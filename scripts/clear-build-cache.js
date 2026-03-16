const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const mode = (process.argv[2] || "root").toLowerCase();
const forceSharedCache = process.env.CLEAR_SHARED_CACHE === "true" || process.env.CLEAR_SHARED_TURBO_CACHE === "true";

const RETRYABLE_ERROR_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY", "EMFILE", "ENFILE"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dirsByMode = {
  root: [
    ".turbo",
    ...(forceSharedCache ? ["node_modules/.cache"] : []),
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
const results = {
  removed: [],
  skipped: [],
  failed: [],
};

const removeWithRetry = async (absolutePath, attempts = 4) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(absolutePath, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
      return;
    } catch (error) {
      const isLastAttempt = attempt === attempts;
      const retryable = RETRYABLE_ERROR_CODES.has(error && error.code);
      if (!retryable || isLastAttempt) {
        throw error;
      }
      await sleep(120 * attempt);
    }
  }
};

const removeDir = async (relativePath) => {
  const absolutePath = path.resolve(rootDir, relativePath);

  if (!fs.existsSync(absolutePath)) {
    results.skipped.push(relativePath);
    console.log(`[cache-clean] skipped (missing): ${relativePath}`);
    return;
  }

  try {
    await removeWithRetry(absolutePath);
    results.removed.push(relativePath);
    console.log(`[cache-clean] removed: ${relativePath}`);
  } catch (error) {
    results.failed.push(relativePath);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cache-clean] failed: ${relativePath} -> ${message}`);
  }
};

const run = async () => {
  console.log(`[cache-clean] mode: ${mode}`);
  if (mode === "root" && !forceSharedCache) {
    console.log("[cache-clean] shared node_modules/.cache was NOT removed (set CLEAR_SHARED_CACHE=true to force)");
  }

  for (const target of targets) {
    // Sequential deletion avoids race conditions over shared FS metadata on Windows/OneDrive.
    await removeDir(target);
  }

  console.log(
    `[cache-clean] done | removed=${results.removed.length} skipped=${results.skipped.length} failed=${results.failed.length}`,
  );

  if (results.failed.length > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[cache-clean] unexpected failure: ${message}`);
  process.exit(1);
});
