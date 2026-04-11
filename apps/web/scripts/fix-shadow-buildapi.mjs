/**
 * Elimina líneas locales que sombrean buildApiUrl/getSocketBaseUrl y usan API_URL.
 */
import fs from "node:fs";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..");

function walkTsFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkTsFiles(p, acc);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

function shouldDropLine(trimmed) {
  if (trimmed.startsWith("const buildApiUrl = (path: string)") && trimmed.includes("${API_URL}/")) return true;
  if (trimmed.startsWith("const getSocketBaseUrl = () => API_URL.replace")) return true;
  if (trimmed.startsWith("let API_URL = getApiBaseTrimmed()")) return true;
  if (trimmed.startsWith("API_URL = API_URL.replace(/") && trimmed.includes("$/, '');")) return true;
  return false;
}

function ensureImport(s, name) {
  if (!s.includes(`${name}(`) && !s.includes(`${name} (`)) return s;
  if (new RegExp(`import\\s*\\{[^}]*\\b${name}\\b`).test(s)) return s;
  return s.replace(/import\s*\{([^}]+)\}\s*from\s*["']@\/lib\/api-base["]/, (m, inner) => {
    const parts = inner.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.includes(name)) parts.push(name);
    return `import { ${parts.join(", ")} } from "@/lib/api-base"`;
  });
}

for (const fp of walkTsFiles(webRoot)) {
  if (fp.includes(`${path.sep}scripts${path.sep}`)) continue;
  if (fp.endsWith(`${path.sep}lib${path.sep}api-base.ts`)) continue;
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("${API_URL}/") && !s.includes("API_URL.replace")) continue;

  const lines = s.split(/\r?\n/);
  const nextLines = [];
  let skipNextApiUrlAssign = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("let API_URL = getApiBaseTrimmed()")) {
      skipNextApiUrlAssign = true;
      continue;
    }
    if (skipNextApiUrlAssign && trimmed.startsWith("API_URL = API_URL.replace")) {
      skipNextApiUrlAssign = false;
      continue;
    }
    skipNextApiUrlAssign = false;
    if (shouldDropLine(trimmed)) continue;
    nextLines.push(line);
  }
  let out = nextLines.join("\n");

  out = out.replace(/\bconst base = API_URL\.replace\(\/\\?\/\+api\\\/?\$\/,\s*['"]\s*\)/g, "const base = getApiAssetOrigin()");
  out = out.replace(/\bconst socketUrl = API_URL\.replace\(\/\\?\/\+api\\\/?\$\/,\s*['"]\s*\)/g, "const socketUrl = getSocketBaseUrl()");

  if (out !== s) {
    if (/\bgetApiAssetOrigin\s*\(/.test(out)) out = ensureImport(out, "getApiAssetOrigin");
    if (/\bgetSocketBaseUrl\s*\(/.test(out)) out = ensureImport(out, "getSocketBaseUrl");
    fs.writeFileSync(fp, out, "utf8");
    console.log("fixed", path.relative(webRoot, fp));
  }
}
