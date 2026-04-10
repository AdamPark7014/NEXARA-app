/**
 * Ejecuta Gradle en android/ (Windows: gradlew.bat, macOS/Linux: ./gradlew).
 * Uso: node scripts/android-gradle.cjs assembleRelease | bundleRelease
 */
const { spawnSync } = require("child_process");
const path = require("path");

const androidDir = path.join(__dirname, "..", "android");
const arg = process.argv[2] || "assembleRelease";
const appTask = arg.startsWith(":") ? arg : `:app:${arg}`;
const isWin = process.platform === "win32";
const cmd = isWin ? "gradlew.bat" : "./gradlew";

const result = spawnSync(cmd, [appTask, "--no-daemon"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: isWin,
});

process.exit(result.status === 0 ? 0 : result.status || 1);
