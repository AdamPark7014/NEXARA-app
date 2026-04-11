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

const bad = /^\s*const buildApiUrl = \(path: string\) => buildApiUrl\(/;

let changed = 0;
for (const file of walk(mobileRoot)) {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  const next = lines.filter((line) => !bad.test(line)).join("\n");
  if (next !== raw) {
    fs.writeFileSync(file, next, "utf8");
    changed++;
    console.log(path.relative(mobileRoot, file));
  }
}
console.log("patched", changed);
