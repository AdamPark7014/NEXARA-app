const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const mode = (process.argv[2] || "root").toLowerCase();

const dirsByMode = {
  root: [
    ".turbo",
    "node_modules/.cache",
    "apps/web/.next",
    "apps/mobile/.next",
    "apps/web/node_modules/.cache",
    "apps/mobile/node_modules/.cache",
  ],
  web: [
    "apps/web/.next",
    "apps/web/node_modules/.cache",
  ],
  mobile: [
    "apps/mobile/.next",
    "apps/mobile/node_modules/.cache",
  ],
  api: [
    "apps/api/dist",
    "apps/api/node_modules/.cache",
  ],
};

const targets = dirsByMode[mode] || dirsByMode.root;

const removeDir = (relativePath) => {
  const absolutePath = path.resolve(rootDir, relativePath);
  try {
    fs.rmSync(absolutePath, { recursive: true, force: true });
    console.log(`[cache-clean] removed: ${relativePath}`);
  } catch (error) {
    console.warn(`[cache-clean] failed: ${relativePath} -> ${error.message}`);
  }
};

console.log(`[cache-clean] mode: ${mode}`);
targets.forEach(removeDir);
console.log("[cache-clean] done");
