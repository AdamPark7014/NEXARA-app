#!/bin/bash
# ============================================================================
# Reset User Password Script
# Use when user credentials don't work after recovery.
# Requires email + password (no hardcoded defaults).
# ============================================================================

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <email> <new-password>"
  echo "Example: $0 user@nexara.com.mx 'StrongPass!2026'"
  exit 1
fi

EMAIL="$1"
PASSWORD="$2"
CONTAINER="${POSTGRES_CONTAINER:-nexara-db}"

if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "Invalid email format."
  exit 1
fi

if [[ ${#PASSWORD} -lt 10 ]]; then
  echo "Password must be at least 10 characters."
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo "Node.js not found. Install it or run from an environment with Node."
  exit 1
fi

HASH="$(PASSWORD="$PASSWORD" node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync(process.env.PASSWORD, 10));")"

# Escape single quotes for SQL literal safety.
sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

EMAIL_SQL="$(sql_escape "$EMAIL")"
HASH_SQL="$(sql_escape "$HASH")"

echo "Password Reset Utility"
echo "======================"
echo "Email: $EMAIL"
echo "Container: $CONTAINER"
echo ""

docker exec -i "$CONTAINER" \
  psql -U "${POSTGRES_USER:-nexara}" -d "${POSTGRES_DB:-nexara}" \
  -v ON_ERROR_STOP=1 <<SQL
UPDATE "User"
SET "passwordHash" = '${HASH_SQL}'
WHERE LOWER(email) = LOWER('${EMAIL_SQL}');

SELECT id, nombre, email, "roleId"
FROM "User"
WHERE LOWER(email) = LOWER('${EMAIL_SQL}');
SQL

echo ""
echo "Password reset complete for $EMAIL"
