/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');

const nextBin = '../../node_modules/next/dist/bin/next';

function runBuild(maxOldSpaceSize, ignoreTypeErrors) {
  const env = {
    ...process.env,
    NEXT_IGNORE_TYPE_ERRORS: ignoreTypeErrors ? '1' : process.env.NEXT_IGNORE_TYPE_ERRORS,
  };

  const args = [`--max-old-space-size=${maxOldSpaceSize}`, nextBin, 'build'];
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env,
  });

  const signalCode = result.signal === 'SIGKILL' ? 137 : 0;
  const statusCode = typeof result.status === 'number' ? result.status : 0;
  return signalCode || statusCode;
}

console.log('[web-build] Attempt 1: standard build (type-check enabled)');
const firstExitCode = runBuild(2304, false);

if (firstExitCode === 0) {
  process.exit(0);
}

if (firstExitCode !== 137) {
  process.exit(firstExitCode);
}

console.warn('[web-build] OOM detected (exit 137). Retrying with low-memory mode and NEXT_IGNORE_TYPE_ERRORS=1');
const secondExitCode = runBuild(1536, true);
process.exit(secondExitCode);
