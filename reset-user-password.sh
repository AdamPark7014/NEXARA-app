#!/bin/bash
# ============================================================================
# Reset User Password Script
# Use when user credentials don't work after recovery
# ============================================================================

set -e

# Default values
EMAIL="${1:-gerencia@nexara.com.mx}"
PASSWORD="${2:-Nexara2024!}"
CONTAINER="nexara-db"

echo "🔐 Password Reset Utility"
echo "================================="
echo "Email: $EMAIL"
echo "Container: $CONTAINER"
echo ""

# Generate bcrypt hash (requires bcrypt installed locally)
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install it or use bcrypt from container."
    exit 1
fi

# Create a temporary Node.js script to generate bcrypt hash
HASH=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('$PASSWORD', 10));" 2>/dev/null || echo "ERROR")

if [ "$HASH" = "ERROR" ]; then
    echo "❌ Could not generate bcrypt hash. Installing bcryptjs..."
    npm install -g bcryptjs
    HASH=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('$PASSWORD', 10));")
fi

echo "Generated hash: $HASH"
echo ""

# Update database
echo "🔄 Updating database..."
docker exec -i $CONTAINER psql -U ${POSTGRES_USER:-nexara} -d ${POSTGRES_DB:-nexara} << EOF
UPDATE "User" 
SET passwordHash = '$HASH'
WHERE LOWER(email) = LOWER('$EMAIL');

SELECT id, nombre, email, roleId FROM "User" WHERE LOWER(email) = LOWER('$EMAIL');
EOF

echo ""
echo "✅ Password reset complete!"
echo ""
echo "Test with:"
echo "  curl -X POST http://localhost:3001/api/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}'"
