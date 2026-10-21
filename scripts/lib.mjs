// Shared helpers for the CLI scripts. The app sources use extensionless
// imports (bundler style), so they are loaded through Vite's SSR loader
// instead of plain Node.
import { readFileSync } from "node:fs";
import { createServer } from "vite";

export async function loadModules(paths) {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    return await Promise.all(paths.map((p) => server.ssrLoadModule(p)));
  } finally {
    await server.close();
  }
}

export function readDiagram(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(`cannot read ${file}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON: ${e.message}`);
  }
}

/** Referential checks the JSON schema cannot express. */
export function checkReferences(d) {
  const errors = [];
  const warnings = [];

  const dupes = (items, label, getId = (x) => x.id) => {
    const seen = new Map();
    items.forEach((x, i) => {
      const id = getId(x);
      if (seen.has(id)) {
        errors.push(`${label}: duplicate id ${JSON.stringify(id)} (items #${seen.get(id)} and #${i})`);
      } else seen.set(id, i);
    });
  };

  const tables = d.tables ?? [];
  dupes(tables, "tables");
  dupes(d.relationships ?? [], "relationships");
  dupes(d.notes ?? [], "notes");
  dupes(d.subjectAreas ?? [], "subjectAreas");
  for (const t of tables) dupes(t.fields ?? [], `table "${t.name}" fields`);

  const names = new Map();
  for (const t of tables) {
    if (names.has(t.name)) warnings.push(`tables: duplicate name "${t.name}"`);
    names.set(t.name, t);
  }

  const byId = new Map(tables.map((t) => [t.id, t]));
  const looseTable = (id) => tables.find((t) => String(t.id) === String(id));

  for (const r of d.relationships ?? []) {
    const label = `relationship "${r.name}" (id ${JSON.stringify(r.id)})`;
    for (const side of ["start", "end"]) {
      const tid = r[`${side}TableId`];
      const fid = r[`${side}FieldId`];
      const table = byId.get(tid);
      if (!table) {
        const loose = looseTable(tid);
        errors.push(
          loose
            ? `${label}: ${side}TableId ${JSON.stringify(tid)} has the wrong type (table "${loose.name}" has id ${JSON.stringify(loose.id)})`
            : `${label}: ${side}TableId ${JSON.stringify(tid)} does not exist`,
        );
        continue;
      }
      const fields = table.fields ?? [];
      if (!fields.some((f) => f.id === fid)) {
        const loose = fields.find((f) => String(f.id) === String(fid));
        errors.push(
          loose
            ? `${label}: ${side}FieldId ${JSON.stringify(fid)} has the wrong type (field "${loose.name}" has id ${JSON.stringify(loose.id)})`
            : `${label}: ${side}FieldId ${JSON.stringify(fid)} does not exist in table "${table.name}"`,
        );
      }
    }
  }
  return { errors, warnings };
}

/** Schema + reference validation. Returns { errors, warnings }. */
export async function validateDiagram(d) {
  const [{ jsonDiagramIsValid }, { jsonSchema }, { Validator }] =
    await Promise.all([
      ...(await loadModules(["/src/utils/validateSchema.js", "/src/data/schemas.js"])),
      import("jsonschema"),
    ]);
  const errors = [];
  if (!jsonDiagramIsValid(d)) {
    const result = new Validator().validate(d, jsonSchema);
    for (const e of result.errors) {
      errors.push(`schema: ${e.stack.replace(/^instance\.?/, "")}`);
    }
    if (!result.errors.length) errors.push("schema: diagram is not valid");
  }
  const refs = checkReferences(d);
  return { errors: [...errors, ...refs.errors], warnings: refs.warnings };
}
