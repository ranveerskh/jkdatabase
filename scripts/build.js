import { cpSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ["index.html", "login.html", "version.json"])
  copyFileSync(resolve(root, file), resolve(output, file));
for (const directory of ["assets", "pages"])
  cpSync(resolve(root, directory), resolve(output, directory), { recursive: true });
console.log("Built JK Database static Netlify site in dist/.");
