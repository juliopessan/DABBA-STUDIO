import { db } from "./sqlite.js";
import { GRADES, LOCATIONS, type Grade, type Location } from "../pipeline/pricing.js";

// Pricing is the one part of a commercial proposal a language model must never
// produce. Rate cards, pyramid ratios and location mix are firm-specific and
// confidential — none of it appears in an RFP or in any earlier phase — so a
// model asked for a price has nothing to reason from and invents one, formatted
// convincingly. This table is the missing input: supply it, and the cost is
// arithmetic; leave it empty, and the proposal must show gaps rather than
// numbers.
db.exec(`
  CREATE TABLE IF NOT EXISTS rate_card (
    id TEXT PRIMARY KEY,
    grade TEXT NOT NULL,
    location TEXT NOT NULL,
    currency TEXT NOT NULL,
    hourly_rate REAL NOT NULL,
    source TEXT NOT NULL,
    note TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE (grade, location)
  );
`);

export type RateSource = "market-benchmark" | "firm-actual";

export interface RateCardEntry {
  id: string;
  grade: string;
  location: string;
  currency: string;
  hourly_rate: number;
  source: RateSource;
  note: string | null;
  updated_at: string;
}



// Public market ranges for technology and digital consulting, in USD per hour.
// These are NOT any firm's actual rate card — no such figures are public, and
// presenting invented ones as real would be the exact failure this whole
// pipeline defends against. They are order-of-magnitude benchmarks, stamped
// `market-benchmark` so every consumer can tell them apart from a real card,
// and the proposal renders them as an assumption rather than a quote.
//
// Nearshore sits near 58% of onshore and offshore near 35%, which is the
// spread these engagements are typically modelled with.
const BENCHMARK: Record<Grade, Record<Location, number>> = {
  Partner:            { onshore: 550, nearshore: 320, offshore: 190 },
  Director:           { onshore: 420, nearshore: 245, offshore: 145 },
  "Senior Manager":   { onshore: 320, nearshore: 190, offshore: 110 },
  Manager:            { onshore: 245, nearshore: 145, offshore: 85 },
  "Senior Consultant":{ onshore: 185, nearshore: 110, offshore: 65 },
  Consultant:         { onshore: 145, nearshore: 88, offshore: 50 },
  Analyst:            { onshore: 105, nearshore: 65, offshore: 38 },
};

const BENCHMARK_NOTE =
  "Public market range for technology consulting. Replace with the firm's own card before quoting.";

/**
 * Fills the table with the benchmark on first use only. Existing rows are left
 * untouched — once a firm has entered its real rates, a restart must not
 * quietly overwrite them with market averages.
 */
export function seedBenchmarkRates(): void {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM rate_card").get() as { n: number };
  if (existing.n > 0) return;

  const insert = db.prepare(
    `INSERT INTO rate_card (id, grade, location, currency, hourly_rate, source, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  for (const grade of GRADES) {
    for (const location of LOCATIONS) {
      insert.run(`${grade}:${location}`, grade, location, "USD", BENCHMARK[grade][location], "market-benchmark", BENCHMARK_NOTE, now);
    }
  }
}

export function listRates(): RateCardEntry[] {
  return db
    .prepare("SELECT * FROM rate_card ORDER BY grade, location")
    .all() as unknown as RateCardEntry[];
}

export function getRate(grade: string, location: string): RateCardEntry | undefined {
  return db
    .prepare("SELECT * FROM rate_card WHERE grade = ? AND location = ?")
    .get(grade, location) as RateCardEntry | undefined;
}

/**
 * Replaces one cell of the card. Writing a rate always stamps it
 * `firm-actual`: a hand-entered number is by definition no longer the
 * benchmark, and the proposal reads that stamp to decide whether it may
 * present the cost as a quote or only as an estimate.
 */
export function setRate(grade: string, location: string, hourlyRate: number, currency = "USD", note?: string): void {
  db.prepare(
    `INSERT INTO rate_card (id, grade, location, currency, hourly_rate, source, note, updated_at)
     VALUES (?, ?, ?, ?, ?, 'firm-actual', ?, ?)
     ON CONFLICT (grade, location) DO UPDATE SET
       hourly_rate = excluded.hourly_rate,
       currency    = excluded.currency,
       source      = 'firm-actual',
       note        = excluded.note,
       updated_at  = excluded.updated_at`
  ).run(`${grade}:${location}`, grade, location, currency, hourlyRate, note ?? null, new Date().toISOString());
}

/** True when every rate in use still carries the seeded benchmark. */
export function isBenchmarkOnly(): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM rate_card WHERE source = 'firm-actual'")
    .get() as { n: number };
  return row.n === 0;
}
