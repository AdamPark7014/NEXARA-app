/**
 * Migra `const API_URL = getApiBaseTrimmed()` + `fetch(\`${API_URL}/...\`)`
 * a `buildApiUrl` importado desde @/lib/api-base.
 * Ejecutar desde la raíz del repo: node apps/web/scripts/migrate-trimmed-api-url.mjs
 */
import fs from "node:fs";
import path from "node:path";

const webRoot = path.resolve(import.meta.dirname, "..");

const skipFiles = new Set([
  path.join(webRoot, "lib", "api-base.ts"),
]);

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

function migrateContent(relPath, raw) {
  let s = raw;
  const orig = s;

  // --- api.ts (console/users) ---
  if (relPath.endsWith(`${path.sep}[slug]${path.sep}users${path.sep}api.ts`) || relPath.endsWith("/users/api.ts")) {
    return `import { buildApiUrl } from "@/lib/api-base";
export async function createUser(formData: FormData, token?: string) {
  const res = await fetch(buildApiUrl("users"), {
    method: "POST",
    headers: token ? { Authorization: \`Bearer \${token}\` } : undefined,
    body: formData,
  });
  if (!res.ok) {
    throw new Error("Error al crear usuario");
  }
  return res.json();
}
`;
  }

  // Quitar función local buildApiUrl de una línea (tras quitar API_URL)
  s = s.replace(
    /\n\s*const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\\\/\+\/, ['"]\)\}\`;\s*\n/g,
    "\n",
  );
  s = s.replace(
    /\n\s*const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\\\/\+\/, ""\)\}\`;\s*\n/g,
    "\n",
  );
  // Variante comillas simples en replace
  s = s.replace(
    /\n\s*const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\\\/\+\/, ['"]\)\}\`;\r?\n/g,
    "\n",
  );

  s = s.replace(/\n\s*const getSocketBaseUrl = \(\) => API_URL\.replace\(\/\\\/\+api\\\/?\$\/, ['"]\);\s*\n/g, "\n");
  s = s.replace(/\n\s*const getSocketBaseUrl = \(\) => API_URL\.replace\(\/\\\/\+api\\\/?\$\/, ""\);\s*\n/g, "\n");

  // socketUrl = API_URL.replace → getSocketBaseUrl()
  s = s.replace(/const socketUrl = API_URL\.replace\(\/\\\/\+api\\\/?\$\/,\s*['"]\s*\);/g, "const socketUrl = getSocketBaseUrl();");
  s = s.replace(/const socketUrl = API_URL\.replace\(\/\\\/\+api\\\/?\$\/,\s*""\s*\);/g, "const socketUrl = getSocketBaseUrl();");

  // fetch / new URL / = `${API_URL}/
  s = s.replace(/fetch\(`\$\{API_URL\}\//g, "fetch(buildApiUrl(`");
  s = s.replace(/new URL\(`\$\{API_URL\}\//g, "new URL(buildApiUrl(`");
  s = s.replace(/=\s*`\$\{API_URL\}\//g, "= buildApiUrl(`");

  // Cerrar buildApiUrl: `,  → `),  cuando sigue , o ) y no es ya `),`
  // Heurística: buildApiUrl(`...` seguido de `, { → `), {
  s = s.replace(/buildApiUrl\(`([^`]*?)`\s*,\s*\{/g, "buildApiUrl(`$1`), {");
  s = s.replace(/buildApiUrl\(`([^`]*?)`\s*\)\s*\.then/g, "buildApiUrl(`$1`)).then");
  s = s.replace(/buildApiUrl\(`([^`]*?)`\s*\)\s*;$/gm, "buildApiUrl(`$1`));");

  // new URL(buildApiUrl(`x`), ...) → new URL(buildApiUrl(`x`)) — si había new URL(buildApiUrl(`path`, { mal formado
  s = s.replace(/new URL\(buildApiUrl\(`([^`]+)`\),\s*\{/g, "new URL(buildApiUrl(`$1`), {");

  // new URL(buildApiUrl(`path`)) — si el original era new URL(`...`) sin segundo arg, cerrar con ))
  s = s.replace(/new URL\(buildApiUrl\(`([^`]+)`\)\s*,/g, "new URL(buildApiUrl(`$1`),");

  // Quitar módulo / hook: const API_URL = getApiBaseTrimmed();
  s = s.replace(/\nconst API_URL = getApiBaseTrimmed\(\);\s*\n/g, "\n");
  s = s.replace(/\n  const API_URL = getApiBaseTrimmed\(\);\s*\n/g, "\n");

  // UserForm: let API_URL + replace + local buildApiUrl
  s = s.replace(
    /\n  let API_URL = getApiBaseTrimmed\(\);\s*\n  API_URL = API_URL\.replace\(\/\\\[\\\/\.\]\+\$\/, ''\);\s*\n  const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\\\/\+\/, ''\)\}`;\s*\n/g,
    "\n",
  );

  // apiUrl={API_URL} → getApiBaseTrimmed() for legacy prop that expects trimmed API root
  s = s.replace(/apiUrl=\{API_URL\}/g, "apiUrl={getApiBaseTrimmed()}");

  // useEffect deps [, API_URL] → remove API_URL from dependency arrays
  s = s.replace(/, API_URL/g, "");
  s = s.replace(/API_URL, /g, "");

  // Imports: ensure buildApiUrl + getSocketBaseUrl when needed
  const needsSocket = /\bgetSocketBaseUrl\(\)/.test(s) && !/import\s*\{[^}]*getSocketBaseUrl/.test(s);
  const needsBuild = /\bbuildApiUrl\(/.test(s);
  const needsTrimmed = /\bgetApiBaseTrimmed\(\)/.test(s);

  if (needsBuild || needsSocket || needsTrimmed) {
    s = s.replace(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/api-base["'];?/m, (m, inner) => {
      const parts = new Set(
        inner
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .filter((x) => x !== "getApiBaseTrimmed" || needsTrimmed),
      );
      if (needsBuild) parts.add("buildApiUrl");
      if (needsSocket) parts.add("getSocketBaseUrl");
      if (needsTrimmed) parts.add("getApiBaseTrimmed");
      const ordered = ["buildApiUrl", "getSocketBaseUrl", "getApiAssetOrigin", "getApiBaseTrimmed", "getApiBase"].filter(
        (name) => parts.has(name),
      );
      const rest = [...parts].filter((p) => !ordered.includes(p));
      const all = [...ordered.filter((x) => parts.has(x)), ...rest.sort()];
      return `import { ${all.join(", ")} } from "@/lib/api-base";`;
    });
  }

  // Si ya no se usa getApiBaseTrimmed en el archivo, limpiar import
  if (!/\bgetApiBaseTrimmed\b/.test(s)) {
    s = s.replace(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/api-base["'];?/m, (m, inner) => {
      const parts = inner
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((x) => x !== "getApiBaseTrimmed");
      if (!parts.length) return m;
      return `import { ${parts.join(", ")} } from "@/lib/api-base";`;
    });
  }

  // assetBaseUrl = API_URL.replace → getApiAssetOrigin()
  s = s.replace(
    /const assetBaseUrl = API_URL\.replace\(\/\\\/\+api\\\/?\$\/,\s*["']["']\);/g,
    "const assetBaseUrl = getApiAssetOrigin();",
  );

  // const base = API_URL.replace(/\/+api\/?$/, ''); → getApiAssetOrigin or getSocketBaseUrl — context dependent
  // ClientTicketsPanel: base for uploads → getApiAssetOrigin
  s = s.replace(
    /const base = API_URL\.replace\(\/\\\/\+api\\\/?\$\/,\s*['"]\s*\);/g,
    "const base = getApiAssetOrigin();",
  );

  // ActivitiesTable: const base = API_URL.replace — same
  if (relPath.includes("ActivitiesTable")) {
    s = s.replace(
      /const base = API_URL\.replace\(\/\\\/\+api\\\/?\$\/,\s*['"]\s*\);/g,
      "const base = getApiAssetOrigin();",
    );
  }

  // console/clients baseUrl
  s = s.replace(
    /const baseUrl = API_URL\.replace\(\/\\\/api\\\/?\$\/,\s*['"]\s*\);/g,
    "const baseUrl = getApiAssetOrigin();",
  );

  if (s === orig && !relPath.endsWith("users/api.ts")) return null;
  return s;
}

const list = walkTsFiles(webRoot);

for (const fp of list) {
  if (skipFiles.has(fp)) continue;
  const raw = fs.readFileSync(fp, "utf8");
  if (!raw.includes("getApiBaseTrimmed") && !raw.includes("const API_URL = getApiBase")) continue;

  const rel = path.relative(webRoot, fp);
  const next = migrateContent(rel.replace(/\\/g, path.sep), raw);
  if (next && next !== raw) {
    fs.writeFileSync(fp, next, "utf8");
    console.log("migrated", rel);
  }
}
