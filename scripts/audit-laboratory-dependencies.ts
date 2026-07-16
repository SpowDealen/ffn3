import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { auditLaboratorySources, type LaboratorySourceFile } from "../_laboratorio/laboratorio-ia/src/review/laboratoryAudit/index";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"]);
const ROOTS = ["_laboratorio/laboratorio-ia/src", "app", "components", "panel-ia-OFF"];

async function collectSources(root: string, relative = ""): Promise<LaboratorySourceFile[]> {
  const directory = path.join(root, relative);
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  const sources: LaboratorySourceFile[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".next") continue;
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) sources.push(...await collectSources(root, nextRelative));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) sources.push({ path: nextRelative.replace(/\\/g, "/"), content: await readFile(path.join(root, nextRelative), "utf8") });
  }
  return sources;
}

async function main(): Promise<void> {
  const [field, aliasesValue = ""] = process.argv.slice(2);
  if (!field) throw new Error("Uso: tsx scripts/audit-laboratory-dependencies.ts <field> [alias1,alias2]");
  const repositoryRoot = process.cwd();
  const sources = (await Promise.all(ROOTS.map(async (root) => (await collectSources(path.join(repositoryRoot, root))).map((source) => ({ ...source, path: `${root}/${source.path}` }))))).flat();
  const result = auditLaboratorySources({ field, aliases: aliasesValue.split(",").map((value) => value.trim()).filter(Boolean) }, sources);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "invalid_request") process.exitCode = 1;
}

void main();
