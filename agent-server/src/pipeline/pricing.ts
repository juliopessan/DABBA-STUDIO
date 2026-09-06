// A commercial proposal is assembled, not written. The team, the durations and
// the allocations already exist in the backlog phase's Staffing Plan; the cost
// is arithmetic over them and a rate card. Handing any of that to a model
// invites the failure measured across this project's runs — plausible figures
// with no source. Everything here is computed, so every number it produces can
// be re-derived from the stored artifact.
//
// This module holds no database import on purpose. Both `sqlite.ts` and
// `rateCard.ts` open the database and create tables as an import side effect,
// so importing them here would mean a unit test of the parser silently touches
// the user's real data file. Rates arrive as a parameter; `index.ts` supplies
// them from the card.

// The delivery pyramid these engagements are staffed against, most senior
// first. Order matters: it is the display order in the proposal.
export const GRADES = [
  "Partner",
  "Director",
  "Senior Manager",
  "Manager",
  "Senior Consultant",
  "Consultant",
  "Analyst",
] as const;

export const LOCATIONS = ["onshore", "nearshore", "offshore"] as const;

export type Grade = (typeof GRADES)[number];
export type Location = (typeof LOCATIONS)[number];

/** Looks a rate up in whatever card the caller holds. */
export type RateLookup = (grade: Grade, location: string) => { hourly_rate: number; currency: string } | undefined;

export interface StaffingLine {
  role: string;
  headcount: number;
  allocation: number; // 0–1
  sprints: number;
}

export interface StaffingPlan {
  lines: StaffingLine[];
  /** Rows the parser could not read. Reported, never guessed at. */
  problems: string[];
}

const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const SEPARATOR = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim().replace(/\*\*/g, ""));
}

function firstNumber(text: string): number | null {
  const match = /(\d+(?:[.,]\d+)?)/.exec(text);
  return match ? Number(match[1].replace(",", ".")) : null;
}

/**
 * Reads the Staffing Plan table out of the backlog artifact.
 *
 * Columns are located by header name rather than position: across stored runs
 * the same table appeared with two different separator styles, roles wrapped
 * in bold, and durations written as "6 sprints", "5 sprints (S2-S6)" and
 * "6 sprints (12 weeks)". Position-based parsing survives none of that.
 */
export function parseStaffingPlan(backlog: string): StaffingPlan {
  const lines = backlog.split("\n");
  const problems: string[] = [];

  const headingAt = lines.findIndex((l) => /^#{1,6}\s+.*staffing plan/i.test(l.trim()));
  if (headingAt === -1) return { lines: [], problems: ["No Staffing Plan section in the backlog artifact."] };

  // The header row is the first table row after the heading.
  let headerAt = -1;
  for (let i = headingAt + 1; i < lines.length && i < headingAt + 12; i++) {
    if (TABLE_ROW.test(lines[i]) && !SEPARATOR.test(lines[i])) {
      headerAt = i;
      break;
    }
  }
  if (headerAt === -1) return { lines: [], problems: ["Staffing Plan section has no table."] };

  const header = cells(lines[headerAt]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iRole = col("role");
  const iHead = col("headcount", "fte", "quantity");
  const iAlloc = col("allocation", "%");
  const iDur = col("duration", "sprints");

  if (iRole === -1 || iHead === -1 || iDur === -1) {
    return { lines: [], problems: [`Staffing Plan table is missing a required column (found: ${header.join(", ")}).`] };
  }

  const out: StaffingLine[] = [];
  for (let i = headerAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    if (!TABLE_ROW.test(line)) break;
    if (SEPARATOR.test(line)) continue;

    const c = cells(line);
    const role = c[iRole] ?? "";
    if (!role || /^total$/i.test(role)) continue;

    const headcount = firstNumber(c[iHead] ?? "");
    const sprints = firstNumber(c[iDur] ?? "");
    // Allocation is the one optional column — absent means full time.
    const allocationPct = iAlloc === -1 ? 100 : firstNumber(c[iAlloc] ?? "");

    if (headcount === null || sprints === null || allocationPct === null) {
      problems.push(`Could not read the numbers for "${role}".`);
      continue;
    }
    out.push({ role, headcount, allocation: allocationPct / 100, sprints });
  }

  if (out.length === 0 && problems.length === 0) problems.push("Staffing Plan table has no readable rows.");
  return { lines: out, problems };
}

// Mapping a role title to a delivery grade is inference, not measurement — the
// backlog names roles by skill ("AI QA & Evaluation Specialist"), never by
// grade. The proposal therefore prints this mapping for review rather than
// hiding it: it is the assumption most likely to be wrong, and the one a
// consultant can correct in seconds.
//
// Order is significant. "Senior Backend Engineer" must match the seniority cue
// before the generic engineer fallback, so the specific patterns run first.
//
// "Lead" sits at Manager, not Senior Manager: on these engagements a tech lead
// is a hands-on delivery grade, while Senior Manager is a supervisory one.
// Mapping it upward put a single line at $358k on a real run — the kind of
// error that survives review precisely because the total still looks plausible.
// "Architect" keeps the higher grade.
const GRADE_PATTERNS: [RegExp, Grade][] = [
  [/\bpartner\b/i, "Partner"],
  [/\bdirector\b|\bprincipal\b|\bhead of\b|\bchief\b/i, "Director"],
  [/\barchitect\b|\bsenior manager\b/i, "Senior Manager"],
  [/\blead\b|\bmanager\b|\bproduct owner\b|\bscrum master\b|\bdelivery\b/i, "Manager"],
  [/\bsenior\b|\bspecialist\b|\bexpert\b|\bsme\b/i, "Senior Consultant"],
  [/\bjunior\b|\bintern\b|\bgraduate\b|\bassociate\b/i, "Analyst"],
];

const DEFAULT_GRADE: Grade = "Consultant";

export function inferGrade(role: string): Grade {
  for (const [pattern, grade] of GRADE_PATTERNS) if (pattern.test(role)) return grade;
  return DEFAULT_GRADE;
}

/** Billable hours one person at 100% allocation contributes to a two-week sprint. */
export const HOURS_PER_SPRINT = 80;

export interface CostLine extends StaffingLine {
  grade: Grade;
  location: string;
  hourlyRate: number;
  hours: number;
  cost: number;
}

export interface Costing {
  lines: CostLine[];
  total: number;
  currency: string;
  /** True while no firm rate has been entered — the total is an estimate, not a quote. */
  benchmarkOnly: boolean;
  problems: string[];
  assumptions: string[];
}

/**
 * Prices a staffing plan against the rate card. Returns problems rather than
 * numbers when the card has no entry for a grade — a missing rate is a gap the
 * reader must see, not a zero to be silently summed.
 */
export function priceStaffingPlan(
  plan: StaffingPlan,
  location: string,
  lookup: RateLookup,
  benchmarkOnly: boolean
): Costing {
  const problems = [...plan.problems];
  const lines: CostLine[] = [];
  let currency = "USD";

  for (const line of plan.lines) {
    const grade = inferGrade(line.role);
    const rate = lookup(grade, location);
    if (!rate) {
      problems.push(`No ${location} rate on file for grade "${grade}" (role "${line.role}").`);
      continue;
    }
    currency = rate.currency;
    const hours = line.headcount * line.allocation * line.sprints * HOURS_PER_SPRINT;
    lines.push({
      ...line,
      grade,
      location,
      hourlyRate: rate.hourly_rate,
      hours,
      cost: hours * rate.hourly_rate,
    });
  }

  return {
    lines,
    total: lines.reduce((sum, l) => sum + l.cost, 0),
    currency,
    benchmarkOnly,
    problems,
    assumptions: [
      `A sprint is two weeks; one person at 100% allocation bills ${HOURS_PER_SPRINT} hours per sprint.`,
      `All roles are priced ${location}; a delivery mix across locations changes the total materially.`,
      "Grades are inferred from role titles — see the mapping column and correct it where it is wrong.",
    ],
  };
}

/** Prices a whole run. `backlog` is the artifact output; absent means no plan. */
export function priceRun(
  backlogOutput: string | undefined,
  location: string,
  lookup: RateLookup,
  benchmarkOnly: boolean
): Costing {
  if (!backlogOutput) {
    return {
      lines: [], total: 0, currency: "USD", benchmarkOnly,
      problems: ["This run has no backlog phase, so there is no staffing plan to price."],
      assumptions: [],
    };
  }
  return priceStaffingPlan(parseStaffingPlan(backlogOutput), location, lookup, benchmarkOnly);
}
