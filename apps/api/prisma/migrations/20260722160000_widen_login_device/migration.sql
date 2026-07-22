-- Login device strings can exceed 80 chars (browser UA summary).
ALTER TABLE "User"
  ALTER COLUMN "lastLoginDevice" TYPE VARCHAR(255);

ALTER TABLE "UserSession"
  ALTER COLUMN "device" TYPE VARCHAR(255);
