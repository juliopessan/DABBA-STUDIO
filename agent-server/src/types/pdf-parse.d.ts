// pdf-parse ships no types for its internal entry point (only the package
// root has an index.d.ts) — extractText.ts imports the lib file directly to
// avoid pdf-parse's index.js running a debug self-test against a bundled
// sample PDF on import.
declare module "pdf-parse/lib/pdf-parse.js";
