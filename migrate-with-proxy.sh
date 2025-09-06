#!/bin/bash

# Simplified migration using Cloud SQL Proxy
# This approach is more secure and doesn't require IP whitelisting

set -e

PROJECT_ID="wingman-interview-470419"
INSTANCE_NAME="wingman-interview-db"
DATABASE_NAME="wingman_interview"
CLOUD_SQL_USER="wingman_user"
REGION="us-central1"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

echo "🚀 Starting simplified migration with Cloud SQL Proxy..."

# Check if Cloud SQL Proxy is installed
if ! command -v cloud-sql-proxy &> /dev/null; then
    echo "Installing Cloud SQL Proxy..."
    curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64
    chmod +x cloud-sql-proxy
    sudo mv cloud-sql-proxy /usr/local/bin/
    print_status "Cloud SQL Proxy installed"
fi

# Get local database info
echo "Please provide your local database connection details:"
read -p "Local database URL (e.g., postgresql://user:pass@localhost:5432/dbname): " LOCAL_DB_URL

# Export local database
echo "Exporting local database..."
BACKUP_FILE="wingman_backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$LOCAL_DB_URL" --no-owner --no-privileges --clean --if-exists > "$BACKUP_FILE"
print_status "Database exported to $BACKUP_FILE"

# Start Cloud SQL Proxy in background
echo "Starting Cloud SQL Proxy..."
cloud-sql-proxy $PROJECT_ID:$REGION:$INSTANCE_NAME --port 5433 &
PROXY_PID=$!
sleep 5

# Import to Cloud SQL via proxy
echo "Importing to Cloud SQL via proxy..."
CLOUD_SQL_PROXY_URL="postgresql://${CLOUD_SQL_USER}:WingmanSecure2024!@127.0.0.1:5433/${DATABASE_NAME}"

psql "$CLOUD_SQL_PROXY_URL" < "$BACKUP_FILE"
print_status "Data imported successfully"

# Generate environment configuration
cat > .env.cloudsql << EOF
# Cloud SQL Configuration (via Cloud SQL Proxy)
DATABASE_URL="postgresql://${CLOUD_SQL_USER}:WingmanSecure2024!@127.0.0.1:5433/${DATABASE_NAME}"

# For production, use direct connection:
# DATABASE_URL="postgresql://${CLOUD_SQL_USER}:WingmanSecure2024!@//${DATABASE_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"

# Rest of your configuration...
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret"
GOOGLE_CLOUD_PROJECT_ID="wingman-interview-470419"
GOOGLE_CLOUD_BUCKET_NAME="wingman-interview-videos-harshit-2024"
NODE_ENV="development"
EOF

print_status "Environment configuration saved to .env.cloudsql"

# Stop proxy
kill $PROXY_PID 2>/dev/null || true

echo ""
echo "🎉 Migration completed!"
echo ""
echo "To use Cloud SQL:"
echo "1. Start Cloud SQL Proxy: cloud-sql-proxy $PROJECT_ID:$REGION:$INSTANCE_NAME --port 5433"
echo "2. Update your .env.local with the DATABASE_URL from .env.cloudsql"
echo "3. Run: npm run db:push"
echo ""
print_warning "Keep the proxy running while developing locally"
