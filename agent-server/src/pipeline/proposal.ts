import type { Costing, Grade } from "./pricing.js";
import { GRADES } from "./pricing.js";

// The commercial half of a proposal is generated here, in code, and inserted
// into the document after the model has written the narrative. The model is
// told explicitly not to emit figures, because a proposal is the one artifact
// where an invented number becomes contractual. Everything below is arithmetic
// over the stored staffing plan and the rate card.

function money(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * "Team and Effort" — who is on the engagement and for how long. No costs:
 * a reviewer reads shape here and price in the next section, and mixing them
 * invites arguing about rates before the team has been understood.
 */
export function buildTeamSection(costing: Costing): string {
  if (costing.lines.length === 0) {
    return [
      "## Team and Effort",
      "",
      "The staffing plan could not be read from the analysis, so no team is proposed here.",
      ...costing.problems.map((p) => `- ${p}`),
    ].join("\n");
  }

  const rows = costing.lines.map(
    (l) =>
      `| ${l.role} | ${l.grade} | ${l.headcount} | ${Math.round(l.allocation * 100)}% | ${l.sprints} sprints | ${l.hours.toLocaleString("en-US")} |`
  );
  const totalHours = costing.lines.reduce((s, l) => s + l.hours, 0);

  return [
    "## Team and Effort",
    "",
    "| Role | Grade | Headcount | Allocation | Duration | Hours |",
    "|------|-------|----------:|-----------:|----------|------:|",
    ...rows,
    `| **Total** | | | | | **${totalHours.toLocaleString("en-US")}** |`,
    "",
    "Grades are inferred from the role titles in the staffing plan. Review the",
    "Grade column before this document leaves the building — it is the assumption",
    "most likely to be wrong and the quickest to correct.",
  ].join("\n");
}

/**
 * "Commercial Summary" — cost by grade. Grouped rather than per-role because a
 * client evaluates the shape of the pyramid, and because per-role rates invite
 * line-item negotiation before the total has been discussed.
 */
export function buildCommercialSection(costing: Costing): string {
  const out: string[] = ["## Commercial Summary", ""];

  if (costing.lines.length === 0) {
    out.push("No cost is presented: the engagement could not be priced from the analysis.");
    costing.problems.forEach((p) => out.push(`- ${p}`));
    return out.join("\n");
  }

  const byGrade = new Map<Grade, { hours: number; cost: number; rate: number }>();
  for (const line of costing.lines) {
    const acc = byGrade.get(line.grade) ?? { hours: 0, cost: 0, rate: line.hourlyRate };
    acc.hours += line.hours;
    acc.cost += line.cost;
    byGrade.set(line.grade, acc);
  }

  out.push("| Grade | Hours | Rate | Cost |", "|-------|------:|-----:|-----:|");
  for (const grade of GRADES) {
    const acc = byGrade.get(grade);
    if (!acc) continue;
    out.push(
      `| ${grade} | ${acc.hours.toLocaleString("en-US")} | ${money(acc.rate, costing.currency)} | ${money(acc.cost, costing.currency)} |`
    );
  }
  out.push(`| **Total** | | | **${money(costing.total, costing.currency)}** |`, "");

  // The distinction that decides whether this document may be sent as a quote.
  if (costing.benchmarkOnly) {
    out.push(
      "**This total is an estimate, not a quote.** It is priced against public",
      "market benchmarks for technology consulting because no firm rate card has",
      "been entered. Load the firm's own rates before issuing this document to a",
      "client.",
      ""
    );
  }

  out.push("### Basis of the estimate", "");
  costing.assumptions.forEach((a) => out.push(`- ${a}`));

  if (costing.problems.length > 0) {
    out.push("", "### Gaps in the costing", "");
    costing.problems.forEach((p) => out.push(`- ${p}`));
  }

  return out.join("\n");
}

/**
 * Stitches the model's narrative sections together with the generated
 * commercial ones, in reading order. The model never sees these tables before
 * writing, so it cannot restate a figure incorrectly; the tables never see the
 * model, so they cannot be edited into something the arithmetic does not
 * support.
 */
export function assembleProposal(narrative: { executive: string; approach: string }, costing: Costing): string {
  // Reading order: what you need, how it is approached and under what
  // conditions, then who does it and what it costs. Price lands after the
  // assumptions that qualify it, which is the order a reviewer scores in.
  return [
    narrative.executive.trim(),
    narrative.approach.trim(),
    buildTeamSection(costing),
    buildCommercialSection(costing),
  ].join("\n\n---\n\n");
}

export const PROPOSAL_COMMANDS = ["*executive", "*approach"] as const;
