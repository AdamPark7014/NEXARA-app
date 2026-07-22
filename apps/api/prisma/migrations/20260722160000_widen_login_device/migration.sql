-- Login device strings can exceed 80 chars (browser UA summary).
ALTER TABLE "User"
  ALTER COLUMN "lastLoginDevice" TYPE VARCHAR(255);

-- Mapped table name is user_sessions (not UserSession).
ALTER TABLE "user_sessions"
  ALTER COLUMN "device" TYPE VARCHAR(255);
