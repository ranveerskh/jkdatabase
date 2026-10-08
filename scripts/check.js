import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
async function files(folder) {
  const entries = await readdir(resolve(root, folder), { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]));
  return nested.flat();
}
const sources = [...await files("assets/js"), ...await files("scripts"), ...await files("tests")].filter((path) => path.endsWith(".js"));
for (const file of sources) {
  const result = spawnSync(process.execPath, ["--check", resolve(root, file)], { encoding: "utf8" });
  if (result.status !== 0) throw Error(`${file}: ${result.stderr}`);
}
const pages = ["index.html", "login.html", ...await files("pages")].filter((path) => path.endsWith(".html"));
const idsByFile = new Map();
const pageSources = new Map();
for (const file of pages) {
  const html = await readFile(resolve(root, file), "utf8");
  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]);
  if (ids.length !== new Set(ids).size) throw Error(`Duplicate IDs in ${file}`);
  idsByFile.set(resolve(root, file), new Set(ids));
  pageSources.set(file, html);
}
for (const [file, html] of pageSources) {
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const link = match[1].replaceAll("&amp;", "&");
    if (/^(https?:|data:|blob:|mailto:|tel:|\/\/)/i.test(link)) continue;
    const [pathname, fragment] = link.split("#");
    const target = resolve(dirname(resolve(root, file)), (pathname || file.split("/").pop()).split("?")[0]);
    await readFile(target).catch(() => { throw Error(`Missing link from ${file}: ${link}`); });
    if (fragment && idsByFile.has(target) && !idsByFile.get(target).has(fragment)) throw Error(`Missing anchor from ${file}: ${link}`);
  }
}
console.log(`${sources.length} JavaScript files pass syntax checks; ${pages.length} HTML pages pass links/duplicate-ID checks.`);
