import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".next") continue;
      walk(p, acc);
    } else if (/\.(tsx|ts)$/.test(name.name) && !p.endsWith(`lib${path.sep}api-base.ts`)) {
      acc.push(p);
    }
  }
  return acc;
}

const patterns = [
  /;[\r\n]+\s*const buildApiUrl = \(path: string\) => buildApiUrl\(`\$\{path\.replace\(\/\^\\\/\+\/, ''\)\}`\);/g,
  /;[\r\n]+\s*const buildApiUrl = \(path: string\) => buildApiUrl\(`\$\{path\.replace\(\/\^\\\/\+\/, ""\)\}`\);/g,
];

let n = 0;
for (const file of walk(mobileRoot)) {
  let s = fs.readFileSync(file, "utf8");
  const o = s;
  for (const p of patterns) s = s.replace(p, ";");
  if (s !== o) {
    fs.writeFileSync(file, s, "utf8");
    n++;
    console.log(path.relative(mobileRoot, file));
  }
}
console.log("files", n);
