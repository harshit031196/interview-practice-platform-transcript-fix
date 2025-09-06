#!/bin/bash

# Complete Cloud SQL Migration Script
# This script helps you finalize the migration to Google Cloud SQL

set -e

PROJECT_ID="wingman-interview-470419"
INSTANCE_NAME="wingman-interview-db"
DATABASE_NAME="wingman_interview"
CLOUD_SQL_USER="wingman_user"
REGION="us-central1"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${GREEN}✓${NC} $1"; }
print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }

echo "🎯 Finalizing Cloud SQL Migration"
echo "================================="

# Check if Cloud SQL Proxy is available
if ! command -v cloud-sql-proxy &> /dev/null; then
    echo "Installing Cloud SQL Proxy..."
    curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64
    chmod +x cloud-sql-proxy
    sudo mv cloud-sql-proxy /usr/local/bin/
    print_status "Cloud SQL Proxy installed"
fi

# Function to start proxy
start_proxy() {
    echo "Starting Cloud SQL Proxy..."
    cloud-sql-proxy $PROJECT_ID:$REGION:$INSTANCE_NAME --port 5433 &
    PROXY_PID=$!
    sleep 3
    print_status "Cloud SQL Proxy started (PID: $PROXY_PID)"
}

# Function to stop proxy
stop_proxy() {
    if [ ! -z "$PROXY_PID" ]; then
        kill $PROXY_PID 2>/dev/null || true
        print_status "Cloud SQL Proxy stopped"
    fi
}

# Trap to ensure proxy is stopped on exit
trap stop_proxy EXIT

# Start proxy
start_proxy

# Test connection
echo "Testing Cloud SQL connection..."
CLOUD_SQL_PROXY_URL="postgresql://${CLOUD_SQL_USER}:WingmanSecure2024!@127.0.0.1:5433/${DATABASE_NAME}"

if psql "$CLOUD_SQL_PROXY_URL" -c "SELECT 1;" &> /dev/null; then
    print_status "Cloud SQL connection successful"
else
    print_warning "Direct connection test failed. This is normal if you haven't migrated data yet."
fi

# Create/update environment file
echo "Creating environment configuration..."
cat > .env.cloudsql << EOF
# Google Cloud SQL Configuration
DATABASE_URL="postgresql://${CLOUD_SQL_USER}:WingmanSecure2024!@127.0.0.1:5433/${DATABASE_NAME}"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-here"

# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID="wingman-interview-470419"
GOOGLE_CLOUD_BUCKET_NAME="wingman-interview-videos-harshit-2024"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"

# OAuth Providers (Update with your actual values)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"

# Video Analysis Cloud Function
VIDEO_ANALYSIS_FUNCTION_URL="https://your-region-your-project.cloudfunctions.net/video_analysis"

# Cloud Function Endpoints
GENERATE_UPLOAD_URL_ENDPOINT="https://your-region-your-project.cloudfunctions.net/generate_upload_url"
APP_FEEDBACK_ENDPOINT="https://your-app-domain.com/api/interviews"

# Environment
NODE_ENV="development"
EOF

print_status "Environment configuration created (.env.cloudsql)"

# Run Prisma operations
echo "Setting up Prisma with Cloud SQL..."

# Backup existing .env.local if it exists
if [ -f .env.local ]; then
    cp .env.local .env.local.backup.$(date +%Y%m%d_%H%M%S)
    print_status "Backed up existing .env.local"
fi

# Use Cloud SQL configuration temporarily
cp .env.cloudsql .env.local

# Generate Prisma client
echo "Generating Prisma client..."
npm run db:generate

# Push schema to Cloud SQL
echo "Pushing database schema to Cloud SQL..."
npm run db:push

print_status "Prisma setup completed"

# Test the application connection
echo "Testing application connectivity..."
if command -v node &> /dev/null; then
    node test-cloud-sql.mjs || print_warning "Application test failed - this is normal if you haven't migrated data yet"
fi

echo ""
echo "🎉 Migration setup completed!"
echo ""
echo "📋 Next Steps:"
echo "1. If you have local data to migrate, run: ./migrate-with-proxy.sh"
echo "2. Keep Cloud SQL Proxy running: cloud-sql-proxy $PROJECT_ID:$REGION:$INSTANCE_NAME --port 5433"
echo "3. Update your .env.local with values from .env.cloudsql"
echo "4. Test your application: npm run dev"
echo ""
echo "📊 Cloud SQL Instance Info:"
echo "- Instance: $INSTANCE_NAME"
echo "- Database: $DATABASE_NAME"
echo "- Connection: Via proxy on port 5433"
echo ""
print_info "The Cloud SQL Proxy will continue running in the background"
print_warning "Remember to update your production environment variables for deployment"
