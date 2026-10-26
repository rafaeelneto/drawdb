#!/usr/bin/env node
// Usage: npm run check -- diagram.json [more.json ...]
// Validates the drawDB JSON schema and that every relationship points at an
// existing table/field and every id is unique. Exit code 1 on any error.
import { readDiagram, validateDiagram } from "./lib.mjs";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: npm run check -- <diagram.json> [...]");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  try {
    const { errors, warnings } = await validateDiagram(readDiagram(file));
    warnings.forEach((w) => console.warn(`${file}: warning: ${w}`));
    errors.forEach((e) => console.error(`${file}: error: ${e}`));
    if (errors.length) failed = true;
    else console.log(`${file}: ok`);
  } catch (e) {
    console.error(`${file}: error: ${e.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
