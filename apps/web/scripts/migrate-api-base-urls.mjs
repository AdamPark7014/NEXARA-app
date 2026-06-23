/**
 * Reemplaza fallbacks a localhost por helpers de @/lib/api-base (apps/web).
 * Run desde la raíz del repo: node apps/web/scripts/migrate-api-base-urls.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const SKIP = new Set(["node_modules", ".next", "dist", "out", "coverage"]);

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function mergeApiBaseImport(src, names) {
  const need = [...new Set(names)].filter(Boolean);
  if (!need.length) return src;

  const existing = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/api-base["']/);
  if (existing) {
    const cur = existing[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = [...new Set([...cur, ...need])];
    return src.replace(/import\s*\{[^}]*\}\s*from\s*["']@\/lib\/api-base["'];/, `import { ${merged.join(", ")} } from "@/lib/api-base";`);
  }
  const first = src.search(/^import\s/m);
  const line = `import { ${need.join(", ")} } from "@/lib/api-base";\n`;
  if (first === -1) return line + src;
  return src.slice(0, first) + line + src.slice(first);
}

function processSource(src) {
  if (!src.includes("localhost:3001")) return src;

  let s = src;
  const imports = new Set();

  const modDq = `const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => \`\${API_URL}/\${path.replace(/^\\/+/, "")}\`;
const getSocketBaseUrl = () => API_URL.replace(/\\/++api\\/?$/, "");`;

  if (s.includes(modDq)) {
    s = s.split(modDq).join("");
    imports.add("buildApiUrl");
    imports.add("getSocketBaseUrl");
  }

  const modSq = `const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(
  /[\\/.]+$/,
  ''
);
const buildApiUrl = (path: string) => \`\${API_URL}/\${path.replace(/^\\/+/, '')}\`;
const getSocketBaseUrl = () => API_URL.replace(/\\/++api\\/?$/, '');`;

  if (s.includes(modSq)) {
    s = s.split(modSq).join("");
    imports.add("buildApiUrl");
    imports.add("getSocketBaseUrl");
  }

  const consoleBlock = `const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => \`\${API_URL}/\${path.replace(/^\\/+/, "")}\`;
const getSocketBaseUrl = () => API_URL.replace(/\\/++api\\/?$/, "");`;

  if (s.includes(consoleBlock)) {
    s = s.split(consoleBlock).join("");
    imports.add("buildApiUrl");
    imports.add("getSocketBaseUrl");
  }

  const wp = `const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\\/.]+$/, '');
const buildApiUrl = (path: string) => \`\${API_URL}/\${path.replace(/^\\/+/, '')}\`;`;
  if (s.includes(wp)) {
    s = s.split(wp).join("");
    imports.add("buildApiUrl");
  }

  const innerFines = `  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(
    /[\\/.]+$/,
    ''
  );
  const buildApiUrl = (path: string) => \`\${API_URL}/\${path.replace(/^\\/+/, '')}\`;`;
  if (s.includes(innerFines)) {
    s = s.split(innerFines).join("");
    imports.add("buildApiUrl");
    imports.add("getSocketBaseUrl");
  }

  const innerAH = `  const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\\/.]+$/, '');
  const buildApiUrl = (path: string) => \`\${API_URL}/\${path.replace(/^\\/+/, '')}\`;

  const getSocketBaseUrl = () => {
    return API_URL.replace(/\\/++api\\/?$/, '');
  };`;
  if (s.includes(innerAH)) {
    s = s.split(innerAH).join("");
    imports.add("buildApiUrl");
    imports.add("getSocketBaseUrl");
  }

  const cvsBlock = `const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\\/.]+$/, "");
const toApi = (path: string) => \`\${apiBase}/\${path.replace(/^\\/+/, "")}\`;`;
  if (s.includes(cvsBlock)) {
    s = s.split(cvsBlock).join(`const toApi = (path: string) => buildApiUrl(path);`);
    imports.add("buildApiUrl");
    imports.add("getSocketBaseUrl");
    s = s.replace("const socketUrl = apiBase.replace(/\\/++api\\/?$/, '');", "const socketUrl = getSocketBaseUrl();");
  }

  const oneDq = `const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\\/.]+$/, "");`;
  if (s.includes(oneDq)) {
    s = s.split(oneDq).join("const API_URL = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const oneSq = `const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/[\\/.]+$/, '');`;
  if (s.includes(oneSq)) {
    s = s.split(oneSq).join("const API_URL = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const oneStock = `const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\\/\\.]+$/, "");`;
  if (s.includes(oneStock)) {
    s = s.split(oneStock).join("const API_URL = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const notif = `const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';`;
  if (s.includes(notif)) {
    s = s.split(notif).join("const API_URL = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const baseDq = `const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";`;
  if (s.includes(baseDq)) {
    s = s.split(baseDq).join("const base = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }
  const baseSq = `const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';`;
  if (s.includes(baseSq)) {
    s = s.split(baseSq).join("const base = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const orderBase = `const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';`;
  if (s.includes(orderBase)) {
    s = s.split(orderBase).join("const base = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const letApiSq = `let API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';`;
  if (s.includes(letApiSq)) {
    s = s.split(letApiSq).join("let API_URL = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }
  const letApiDq = `let API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";`;
  if (s.includes(letApiDq)) {
    s = s.split(letApiDq).join("let API_URL = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const innerApiDq = `      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";`;
  if (s.includes(innerApiDq)) {
    s = s.split(innerApiDq).join("      const API_URL = getApiBaseTrimmed();");
    imports.add("getApiBaseTrimmed");
  }

  const viaSocket =
    /const socketUrl = \(process\.env\.NEXT_PUBLIC_SOCKET_URL \|\| process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/localhost:3001'\)\.replace\(\/\\\$\/?, ?''\);/;
  if (viaSocket.test(s)) {
    s = s.replace(viaSocket, "const socketUrl = getSocketBaseUrl();");
    imports.add("getSocketBaseUrl");
  }

  const evSocket =
    /const socketUrl = \(process\.env\.NEXT_PUBLIC_SOCKET_URL \|\| process\.env\.NEXT_PUBLIC_API_URL \|\| ['"]http:\/\/localhost:3001['"]\)\.replace\(\/\\\$\/?, ?['"]['"]\);/;
  if (evSocket.test(s)) {
    s = s.replace(evSocket, "const socketUrl = getSocketBaseUrl();");
    imports.add("getSocketBaseUrl");
  }

  const chainSocket = `const socketUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api')
      .replace(/[\\/.]+$/, '')
      .replace(/\\/++api\\/?$/, '');`;
  if (s.includes(chainSocket)) {
    s = s.split(chainSocket).join("const socketUrl = getSocketBaseUrl();");
    imports.add("getSocketBaseUrl");
  }
  if (s.includes(`const socketUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api')\n    .replace(/[\\/.]+$/, '')\n    .replace(/\\/++api\\/?$/, '');`)) {
    s = s.split(`const socketUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api')\n    .replace(/[\\/.]+$/, '')\n    .replace(/\\/++api\\/?$/, '');`).join("const socketUrl = getSocketBaseUrl();");
    imports.add("getSocketBaseUrl");
  }

  s = s.replace(/const socketUrl = API_URL\.replace\(\/\+\/api\\\/?\$\/, ?['"]['"]\);/g, "const socketUrl = getSocketBaseUrl();");
  if (s.includes("getSocketBaseUrl()") && !src.includes("getSocketBaseUrl()")) {
    imports.add("getSocketBaseUrl");
  }

  s = s.replace(
    /const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\/?\+\/, ?['"]\/?['"]\)\}`;\s*\n/g,
    "",
  );
  s = s.replace(
    /const buildApiUrl = \(path: string\) => `\$\{API_URL\}\/\$\{path\.replace\(\/\^\/?\+\/, ?["']\/["']\)\}`;\s*\n/g,
    "",
  );

  if (/\bbuildApiUrl\s*\(/.test(s) && !s.includes('from "@/lib/api-base"')) {
    imports.add("buildApiUrl");
  }
  if (/\bgetApiBaseTrimmed\s*\(/.test(s)) {
    imports.add("getApiBaseTrimmed");
  }
  if (/\bgetSocketBaseUrl\s*\(/.test(s)) {
    imports.add("getSocketBaseUrl");
  }

  const importList = [...imports];
  if (importList.length) {
    s = mergeApiBaseImport(s, importList);
  }

  return s;
}

let updated = 0;
for (const file of walk(appRoot)) {
  if (file.includes(`${path.sep}scripts${path.sep}`)) continue;
  if (file.endsWith(`${path.sep}lib${path.sep}api-base.ts`)) continue;

  const before = fs.readFileSync(file, "utf8");
  const after = processSource(before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    updated++;
    console.log(path.relative(appRoot, file));
  }
}
console.log("files updated:", updated);
