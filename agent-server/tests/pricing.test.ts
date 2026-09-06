import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseStaffingPlan,
  priceStaffingPlan,
  inferGrade,
  priceRun,
  HOURS_PER_SPRINT,
  type RateLookup,
  type Costing,
} from "../src/pipeline/pricing.js";
import { buildTeamSection, buildCommercialSection, assembleProposal } from "../src/pipeline/proposal.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), "utf-8");

// A flat card, so an assertion about a total is arithmetic the reader can do
// in their head rather than a number copied out of the benchmark table.
const flatCard: RateLookup = () => ({ hourly_rate: 100, currency: "USD" });
const emptyCard: RateLookup = () => undefined;

describe("reading the staffing plan", () => {
  test("reads the table with colon separators and bold roles", () => {
    const plan = parseStaffingPlan(fixture("staffing-bold-colons.md"));
    assert.equal(plan.problems.length, 0);
    assert.equal(plan.lines.length, 6);

    const lead = plan.lines[0];
    assert.equal(lead.role, "Lead AI / Backend Engineer", "the ** wrapper must be stripped");
    assert.equal(lead.headcount, 2);
    assert.equal(lead.allocation, 1);
    assert.equal(lead.sprints, 7);
  });

  test("reads dash separators and a duration written as '6 sprints (12 weeks)'", () => {
    // Both spellings appeared across stored runs; a parser that handles only
    // one of them silently prices half the engagements at zero.
    const plan = parseStaffingPlan(fixture("staffing-dashes-weeks.md"));
    assert.equal(plan.problems.length, 0);
    assert.equal(plan.lines.length, 6);
    assert.equal(plan.lines[0].sprints, 6, "'6 sprints (12 weeks)' is six sprints, not twelve");
  });

  test("picks columns by header name, not position", () => {
    const shuffled = [
      "## Staffing Plan",
      "",
      "| Duration | Role | Allocation | Headcount |",
      "|---|---|---|---|",
      "| 4 sprints | Backend Engineer | 50% | 3 |",
      "",
    ].join("\n");
    const plan = parseStaffingPlan(shuffled);
    assert.deepEqual(plan.lines, [{ role: "Backend Engineer", headcount: 3, allocation: 0.5, sprints: 4 }]);
  });

  test("reports what it could not read instead of guessing", () => {
    const broken = [
      "## Staffing Plan",
      "",
      "| Role | Headcount | Allocation | Duration |",
      "|---|---|---|---|",
      "| Backend Engineer | two | 100% | 6 sprints |",
      "",
    ].join("\n");
    const plan = parseStaffingPlan(broken);
    assert.equal(plan.lines.length, 0);
    assert.equal(plan.problems.length, 1);
    assert.match(plan.problems[0], /Backend Engineer/);
  });

  test("says so when there is no plan at all", () => {
    const plan = parseStaffingPlan("# Backlog\n\nEpics and stories, no staffing section.");
    assert.equal(plan.lines.length, 0);
    assert.match(plan.problems[0], /No Staffing Plan/i);
  });
});

describe("grade inference", () => {
  test("maps the role titles the backlog actually produces", () => {
    assert.equal(inferGrade("Product Owner / Scrum Master"), "Manager");
    assert.equal(inferGrade("AI Security & Compliance Specialist"), "Senior Consultant");
    assert.equal(inferGrade("Senior Backend / Integration Engineer"), "Senior Consultant");
    assert.equal(inferGrade("Security & Compliance Architect"), "Senior Manager");
    assert.equal(inferGrade("DevOps / SRE Engineer"), "Consultant");
  });

  test("a tech lead is a delivery grade, not a supervisory one", () => {
    // Mapping "Lead" to Senior Manager put a single line at $358k on a real
    // run — an error that survives review because the total still looks
    // plausible. Architect keeps the higher grade.
    assert.equal(inferGrade("Lead AI / Backend Engineer"), "Manager");
    assert.equal(inferGrade("Solution Architect"), "Senior Manager");
  });

  test("falls back to Consultant rather than refusing an unknown title", () => {
    assert.equal(inferGrade("Prompt Wrangler"), "Consultant");
  });
});

describe("costing", () => {
  test("cost is headcount × allocation × sprints × hours × rate", () => {
    const plan = { lines: [{ role: "Backend Engineer", headcount: 2, allocation: 0.5, sprints: 6 }], problems: [] };
    const costing = priceStaffingPlan(plan, "onshore", flatCard, true);

    assert.equal(costing.lines[0].hours, 2 * 0.5 * 6 * HOURS_PER_SPRINT);
    assert.equal(costing.total, 2 * 0.5 * 6 * HOURS_PER_SPRINT * 100);
  });

  test("a missing rate becomes a problem, never a silent zero", () => {
    // Summing an absent rate as zero would understate an engagement without
    // anything on the page saying so.
    const plan = { lines: [{ role: "Backend Engineer", headcount: 1, allocation: 1, sprints: 4 }], problems: [] };
    const costing = priceStaffingPlan(plan, "onshore", emptyCard, true);

    assert.equal(costing.lines.length, 0);
    assert.equal(costing.total, 0);
    assert.equal(costing.problems.length, 1);
    assert.match(costing.problems[0], /No onshore rate/);
  });

  test("carries the parser's problems through to the reader", () => {
    const plan = { lines: [], problems: ["Staffing Plan table has no readable rows."] };
    const costing = priceStaffingPlan(plan, "onshore", flatCard, true);
    assert.deepEqual(costing.problems, ["Staffing Plan table has no readable rows."]);
  });

  test("flags a total built on benchmark rates as an estimate", () => {
    // The proposal reads this to decide whether it may present a quote.
    const plan = { lines: [{ role: "Consultant", headcount: 1, allocation: 1, sprints: 1 }], problems: [] };
    assert.equal(priceStaffingPlan(plan, "onshore", flatCard, true).benchmarkOnly, true);
    assert.equal(priceStaffingPlan(plan, "onshore", flatCard, false).benchmarkOnly, false);
  });

  test("states its assumptions rather than burying them", () => {
    const plan = { lines: [{ role: "Consultant", headcount: 1, allocation: 1, sprints: 1 }], problems: [] };
    const costing = priceStaffingPlan(plan, "nearshore", flatCard, true);
    assert.ok(costing.assumptions.some((a) => a.includes(String(HOURS_PER_SPRINT))));
    assert.ok(costing.assumptions.some((a) => a.includes("nearshore")));
  });

  test("prices a real stored plan end to end", () => {
    const costing = priceRun(fixture("staffing-dashes-weeks.md"), "onshore", flatCard, true);
    assert.equal(costing.problems.length, 0);
    assert.equal(costing.lines.length, 6);
    // 7 people, all full time; five roles run 6 sprints and none is part time.
    const expected = costing.lines.reduce((s, l) => s + l.headcount * l.allocation * l.sprints * HOURS_PER_SPRINT * 100, 0);
    assert.equal(costing.total, expected);
    assert.ok(costing.total > 0);
  });

  test("a run with no backlog says so instead of pricing nothing", () => {
    const costing = priceRun(undefined, "onshore", flatCard, true);
    assert.equal(costing.total, 0);
    assert.match(costing.problems[0], /no backlog phase/i);
  });
});

describe("assembling the commercial sections", () => {
  const costing = (over: Partial<Costing> = {}): Costing => ({
    lines: [
      { role: "Lead Engineer", grade: "Manager", location: "onshore", headcount: 1, allocation: 1, sprints: 5, hourlyRate: 200, hours: 400, cost: 80_000 },
      { role: "Backend Engineer", grade: "Consultant", location: "onshore", headcount: 2, allocation: 1, sprints: 5, hourlyRate: 100, hours: 800, cost: 80_000 },
    ],
    total: 160_000,
    currency: "USD",
    benchmarkOnly: true,
    problems: [],
    assumptions: ["A sprint is two weeks."],
    ...over,
  });

  test("the team section shows shape and hours but never a price", () => {
    // Cost belongs in the next section: a reviewer who meets a rate before
    // understanding the team argues about rates.
    const md = buildTeamSection(costing());
    assert.match(md, /## Team and Effort/);
    assert.match(md, /Lead Engineer \| Manager \| 1 \| 100% \| 5 sprints \| 400/);
    assert.match(md, /\*\*1,200\*\*/, "hours total");
    assert.equal(/USD|\$/.test(md), false, "no currency in the team section");
  });

  test("costs are grouped by grade, seniority first", () => {
    const md = buildCommercialSection(costing());
    const manager = md.indexOf("| Manager |");
    const consultant = md.indexOf("| Consultant |");
    assert.ok(manager > 0 && consultant > manager, "Manager must appear above Consultant");
    assert.match(md, /\*\*USD 160,000\*\*/);
  });

  test("a benchmark total is labelled an estimate, not a quote", () => {
    // The distinction that decides whether the document may be sent.
    const md = buildCommercialSection(costing({ benchmarkOnly: true }));
    assert.match(md, /estimate, not a quote/i);
    assert.match(md, /market benchmarks/i);

    const withRealRates = buildCommercialSection(costing({ benchmarkOnly: false }));
    assert.equal(/estimate, not a quote/i.test(withRealRates), false);
  });

  test("an unpriceable engagement says so instead of showing a zero total", () => {
    const md = buildCommercialSection(costing({ lines: [], total: 0, problems: ["No staffing plan."] }));
    assert.match(md, /No cost is presented/);
    assert.match(md, /No staffing plan\./);
    assert.equal(/USD 0/.test(md), false, "a zero total would read as free");
  });

  test("gaps in the costing are surfaced, not swallowed", () => {
    const md = buildCommercialSection(costing({ problems: ["No onshore rate on file for grade \"Partner\"."] }));
    assert.match(md, /Gaps in the costing/);
    assert.match(md, /Partner/);
  });

  test("the document reads narrative first, then team, then price", () => {
    const doc = assembleProposal({ executive: "## Executive Summary\n\nText.", approach: "## Proposed Approach\n\nText." }, costing());
    const order = ["Executive Summary", "Proposed Approach", "Team and Effort", "Commercial Summary"].map((h) => doc.indexOf(h));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "sections must appear in reading order");
    assert.ok(order.every((i) => i >= 0));
  });
});
