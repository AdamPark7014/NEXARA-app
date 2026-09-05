-- Card numbers per person. `integra_people.numOfCard` says HOW MANY cards
-- somebody has; nothing said WHICH ones, because CardInfo/Search was never
-- called. Populated from `POST /ISAPI/AccessControl/CardInfo/Search`.
CREATE TABLE IF NOT EXISTS "integra_person_cards" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "personId" VARCHAR(120) NOT NULL,
    "cardNo" VARCHAR(120) NOT NULL,
    "cardType" VARCHAR(48),
    "deviceIp" VARCHAR(64) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_person_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integra_person_cards_siteId_cardNo_key"
  ON "integra_person_cards"("siteId", "cardNo");

CREATE INDEX IF NOT EXISTS "integra_person_cards_companyId_personId_idx"
  ON "integra_person_cards"("companyId", "personId");

ALTER TABLE "integra_person_cards"
  DROP CONSTRAINT IF EXISTS "integra_person_cards_companyId_fkey";
ALTER TABLE "integra_person_cards"
  ADD CONSTRAINT "integra_person_cards_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integra_person_cards"
  DROP CONSTRAINT IF EXISTS "integra_person_cards_siteId_fkey";
ALTER TABLE "integra_person_cards"
  ADD CONSTRAINT "integra_person_cards_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
