-- P0-A: FK real de egresos operativos a asientos contables

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;
ALTER TABLE "viaticos" ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;
ALTER TABLE "employee_payments" ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "viaticos"
    ADD CONSTRAINT "viaticos_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "employee_payments"
    ADD CONSTRAINT "employee_payments_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
