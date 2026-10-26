#!/usr/bin/env node
// Usage: npm run export:sql -- diagram.json [-o schema.sql | --stdout]
// Generates the SQL for the diagram's `database` with the app's own
// exportSQL(). Refuses to export a diagram that fails `npm run check`.
import { writeFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { loadModules, readDiagram, validateDiagram } from "./lib.mjs";

const args = process.argv.slice(2);
const stdout = args.includes("--stdout");
const oIdx = args.indexOf("-o");
const out = oIdx >= 0 ? args[oIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith("-") && (oIdx < 0 || i !== oIdx + 1));
if (!file || (oIdx >= 0 && !out)) {
  console.error("usage: npm run export:sql -- <diagram.json> [-o schema.sql | --stdout]");
  process.exit(2);
}

try {
  const d = readDiagram(file);
  const { errors } = await validateDiagram(d);
  if (errors.length) {
    errors.forEach((e) => console.error(`${file}: error: ${e}`));
    process.exit(1);
  }
  const [{ exportSQL }] = await loadModules(["/src/utils/exportSQL/index.js"]);
  // exportSQL takes the app's in-memory shape: `references`, not `relationships`.
  const sql = exportSQL({
    tables: d.tables,
    references: d.relationships,
    types: d.types ?? [],
    enums: d.enums ?? [],
    views: d.views ?? [],
    database: d.database,
    sqlHeader: d.sqlHeader ?? "",
  });
  if (!sql.trim()) {
    console.error(
      `${file}: error: database ${JSON.stringify(d.database)} has no SQL export. ` +
        `Set "database" to one of: postgresql, mysql, mariadb, sqlite, transactsql, oraclesql.`,
    );
    process.exit(1);
  }
  if (stdout) process.stdout.write(sql.endsWith("\n") ? sql : sql + "\n");
  else {
    const target = out ?? join(dirname(file), "schema.sql");
    writeFileSync(target, sql.endsWith("\n") ? sql : sql + "\n");
    console.log(`${basename(file)} -> ${target}`);
  }
} catch (e) {
  console.error(`${file}: error: ${e.message}`);
  process.exit(1);
}
