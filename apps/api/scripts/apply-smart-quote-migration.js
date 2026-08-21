const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const sql = fs.readFileSync(
  path.join(__dirname, '../prisma/migrations/20260821220000_smart_quote_engine/migration.sql'),
  'utf8',
);

async function main() {
  // Execute whole script — Postgres supports multiple statements via simple query in some drivers.
  // Fallback: split DO $$ ... $$; blocks and other statements.
  const parts = [];
  let buf = '';
  let inDo = false;
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!inDo && trimmed.startsWith('DO $$')) inDo = true;
    buf += line + '\n';
    if (inDo && trimmed.endsWith('END $$;')) {
      parts.push(buf);
      buf = '';
      inDo = false;
      continue;
    }
    if (!inDo && trimmed.endsWith(';')) {
      parts.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf);

  for (const part of parts) {
    const stmt = part.trim();
    if (!stmt || stmt.startsWith('--')) continue;
    try {
      await prisma.$executeRawUnsafe(stmt);
      process.stdout.write('.');
    } catch (e) {
      const msg = e.message || String(e);
      if (/already exists|duplicate/i.test(msg)) {
        process.stdout.write('s');
        continue;
      }
      console.error('\nFAIL:', stmt.slice(0, 120), '\n', msg);
      throw e;
    }
  }
  console.log('\nDONE');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
