/**
 * Elimina reglas CSS cuyo selector incluye :global(body.light) (bloque completo hasta } balanceado).
 * Uso: node scripts/strip-public-body-light-css.mjs <archivo.css>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const target = process.argv[2];
if (!target) {
  console.error("Uso: node strip-public-body-light-css.mjs <ruta.css>");
  process.exit(1);
}

const filePath = path.isAbsolute(target) ? target : path.join(root, target);
let s = fs.readFileSync(filePath, "utf8");
const needle = ":global(body.light)";
const out = [];
let i = 0;

while (i < s.length) {
  const idx = s.indexOf(needle, i);
  if (idx === -1) {
    out.push(s.slice(i));
    break;
  }
  out.push(s.slice(i, idx));
  let j = idx;
  while (j < s.length && s[j] !== "{") j++;
  if (j >= s.length) {
    i = idx + needle.length;
    continue;
  }
  let depth = 1;
  j++;
  while (j < s.length && depth > 0) {
    const c = s[j];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    j++;
  }
  i = j;
  while (s[i] === "\n" || s[i] === "\r") i++;
}

let result = out.join("");
result = result.replace(/\n{3,}/g, "\n\n");
fs.writeFileSync(filePath, result);
console.log("OK:", filePath);
