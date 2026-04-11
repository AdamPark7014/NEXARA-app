/**
 * Migra getApiBaseTrimmed + API_URL + helpers locales a buildApiUrl importado.
 */
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

function replaceApiUrlTemplates(str) {
  const marker = "${API_URL}/";
  let out = "";
  let i = 0;
  while (i < str.length) {
    const idx = str.indexOf(marker, i);
    if (idx === -1) {
      out += str.slice(i);
      break;
    }
    out += str.slice(i, idx);
    out += "buildApiUrl(`";
    let j = idx + marker.length;
    while (j < str.length) {
      const ch = str[j];
      if (ch === "`") {
        out += "`)";
        j += 1;
        break;
      }
      if (ch === "$" && str[j + 1] === "{") {
        out += "${";
        j += 2;
        let depth = 1;
        while (j < str.length && depth > 0) {
          const c = str[j];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          out += c;
          j++;
        }
        continue;
      }
      out += ch;
      j++;
    }
    i = j;
  }
  return out;
}

function normalizeApiBaseImport(s) {
  return s.replace(/import\s*\{([^}]+)\}\s*from\s*["']@\/lib\/api-base["'];?/g, (full, inner) => {
    const parts = inner
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((p) => p !== "getApiBaseTrimmed");
    const set = new Set(parts);
    set.add("buildApiUrl");
    const preferred = ["buildApiUrl", "getSocketBaseUrl", "getApiAssetOrigin", "getApiBase"];
    const ordered = preferred.filter((k) => set.has(k));
    const rest = [...set].filter((k) => !preferred.includes(k));
    return `import { ${[...ordered, ...rest].join(", ")} } from "@/lib/api-base";`;
  });
}

function stripApiUrlDeclarations(s) {
  let out = s;
  out = out.replace(/\nconst API_URL = getApiBaseTrimmed\(\);\s*\n/g, "\n");
  out = out.replace(/^\s*const API_URL = getApiBaseTrimmed\(\);\s*\n/m, "");
  out = out.replace(/\n\s*const API_URL = getApiBaseTrimmed\(\);\s*\n/g, "\n");

  // const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, '')}`;
  out = out.replace(
    /\n\s*const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\\\/\+\/, ?(['"])\1\)\}`;\s*\n/g,
    "\n",
  );
  out = out.replace(
    /\n\s*const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\\\/\+\/, ""\)\}`;\s*\n/g,
    "\n",
  );
  out = out.replace(
    /\n\s*const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\\\/\+\/, ''\)\}`;\s*\n/g,
    "\n",
  );

  out = out.replace(/\n\s*const getSocketBaseUrl = \(\) => API_URL\.replace\(\/\\\/\+api\\\/?\$\/, ?(['"])\1\);\s*\n/g, "\n");
  out = out.replace(/\n\s*const getSocketBaseUrl = \(\) => API_URL\.replace\(\/\\\/\+api\\\/?\$\/, ''\);\s*\n/g, "\n");

  return out;
}

function migrateContent(raw) {
  if (!raw.includes("getApiBaseTrimmed") && !raw.includes("${API_URL}")) return null;
  let s = raw;

  s = stripApiUrlDeclarations(s);

  if (s.includes("${API_URL}/")) {
    s = replaceApiUrlTemplates(s);
  }

  // ${API_URL} seguido de ${path} (stock legacy)
  s = s.replace(/\$\{API_URL\}\$\{path\}/g, "${buildApiUrl(path.replace(/^\\/+/, ''))}");

  s = normalizeApiBaseImport(s);

  return s === raw ? null : s;
}

const files = walk(mobileRoot);
let changed = 0;
for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const next = migrateContent(raw);
  if (next != null && next !== raw) {
    fs.writeFileSync(file, next, "utf8");
    changed++;
    console.log(path.relative(mobileRoot, file));
  }
}
console.log("changed", changed);
