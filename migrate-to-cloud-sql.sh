#!/bin/bash

# Migration script for transferring local PostgreSQL database to Google Cloud SQL
# Created for wingman-interview-470419 project

set -e

echo "🚀 Starting database migration to Google Cloud SQL..."

# Configuration
PROJECT_ID="wingman-interview-470419"
INSTANCE_NAME="wingman-interview-db"
DATABASE_NAME="wingman_interview"
CLOUD_SQL_USER="wingman_user"
REGION="us-central1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    echo "Checking dependencies..."
    
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v pg_dump &> /dev/null; then
        print_error "pg_dump is not installed. Please install PostgreSQL client tools."
        exit 1
    fi
    
    if ! command -v psql &> /dev/null; then
        print_error "psql is not installed. Please install PostgreSQL client tools."
        exit 1
    fi
    
    print_status "All dependencies are installed"
}

# Get local database URL from user
get_local_db_info() {
    echo ""
    echo "Please provide your local database connection details:"
    
    read -p "Local database host (default: localhost): " LOCAL_HOST
    LOCAL_HOST=${LOCAL_HOST:-localhost}
    
    read -p "Local database port (default: 5432): " LOCAL_PORT
    LOCAL_PORT=${LOCAL_PORT:-5432}
    
    read -p "Local database name: " LOCAL_DB_NAME
    
    read -p "Local database username: " LOCAL_USERNAME
    
    read -s -p "Local database password: " LOCAL_PASSWORD
    echo ""
    
    # Construct local database URL
    LOCAL_DB_URL="postgresql://${LOCAL_USERNAME}:${LOCAL_PASSWORD}@${LOCAL_HOST}:${LOCAL_PORT}/${LOCAL_DB_NAME}"
    
    print_status "Local database configuration captured"
}

# Test local database connection
test_local_connection() {
    echo "Testing local database connection..."
    
    if psql "$LOCAL_DB_URL" -c "SELECT 1;" &> /dev/null; then
        print_status "Local database connection successful"
    else
        print_error "Failed to connect to local database. Please check your credentials."
        exit 1
    fi
}

# Export local database
export_local_database() {
    echo "Exporting local database..."
    
    BACKUP_FILE="wingman_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    # Export schema and data
    pg_dump "$LOCAL_DB_URL" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        > "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        print_status "Database exported to $BACKUP_FILE"
        echo "Backup file size: $(du -h "$BACKUP_FILE" | cut -f1)"
    else
        print_error "Failed to export database"
        exit 1
    fi
}

# Get Cloud SQL connection info
get_cloud_sql_ip() {
    echo "Getting Cloud SQL instance IP address..."
    
    CLOUD_SQL_IP=$(gcloud sql instances describe $INSTANCE_NAME \
        --project=$PROJECT_ID \
        --format="value(ipAddresses[0].ipAddress)")
    
    if [ -z "$CLOUD_SQL_IP" ]; then
        print_error "Failed to get Cloud SQL IP address"
        exit 1
    fi
    
    print_status "Cloud SQL IP: $CLOUD_SQL_IP"
}

# Authorize current IP for Cloud SQL access
authorize_ip() {
    echo "Authorizing your IP address for Cloud SQL access..."
    
    CURRENT_IP=$(curl -s https://ipinfo.io/ip)
    
    if [ -z "$CURRENT_IP" ]; then
        print_error "Failed to get current IP address"
        exit 1
    fi
    
    print_status "Your current IP: $CURRENT_IP"
    
    # Add current IP to authorized networks
    gcloud sql instances patch $INSTANCE_NAME \
        --authorized-networks="$CURRENT_IP/32" \
        --project=$PROJECT_ID \
        --quiet
    
    print_status "IP address authorized for Cloud SQL access"
    
    # Wait for the change to take effect
    echo "Waiting for authorization to take effect..."
    sleep 30
}

# Import data to Cloud SQL
import_to_cloud_sql() {
    echo "Importing data to Cloud SQL..."
    
    # Construct Cloud SQL connection string
    CLOUD_SQL_URL="postgresql://${CLOUD_SQL_USER}:WingmanSecure2024!@${CLOUD_SQL_IP}:5432/${DATABASE_NAME}"
    
    # Test Cloud SQL connection
    echo "Testing Cloud SQL connection..."
    if psql "$CLOUD_SQL_URL" -c "SELECT 1;" &> /dev/null; then
        print_status "Cloud SQL connection successful"
    else
        print_error "Failed to connect to Cloud SQL. Please check the configuration."
        exit 1
    fi
    
    # Import the backup
    echo "Importing backup file to Cloud SQL..."
    psql "$CLOUD_SQL_URL" < "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        print_status "Database successfully imported to Cloud SQL"
    else
        print_error "Failed to import database to Cloud SQL"
        exit 1
    fi
}

# Generate new environment configuration
generate_env_config() {
    echo "Generating new environment configuration..."
    
    # Create new .env file with Cloud SQL configuration
    cat > .env.cloudsql << EOF
# Updated Database Configuration for Google Cloud SQL
DATABASE_URL="postgresql://${CLOUD_SQL_USER}:WingmanSecure2024!@${CLOUD_SQL_IP}:5432/${DATABASE_NAME}"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret"

# OAuth Providers (Optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"

# Google Cloud Configuration (Required for video upload and AI analysis)
GOOGLE_CLOUD_PROJECT_ID="wingman-interview-470419"
GOOGLE_CLOUD_BUCKET_NAME="wingman-interview-videos-harshit-2024"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# Video Analysis Cloud Function
VIDEO_ANALYSIS_FUNCTION_URL="https://your-region-your-project.cloudfunctions.net/video_analysis"

# Cloud Function Endpoints (Generated after deployment)
GENERATE_UPLOAD_URL_ENDPOINT="https://your-region-your-project.cloudfunctions.net/generate_upload_url"
APP_FEEDBACK_ENDPOINT="https://your-app-domain.com/api/interviews"

# Optional
NODE_ENV="development"
EOF
    
    print_status "New environment configuration saved to .env.cloudsql"
    print_warning "Please update your .env.local file with the new DATABASE_URL"
}

# Run Prisma migration
run_prisma_migration() {
    echo "Running Prisma migration on Cloud SQL..."
    
    # Backup current .env.local if it exists
    if [ -f .env.local ]; then
        cp .env.local .env.local.backup
        print_status "Backed up current .env.local to .env.local.backup"
    fi
    
    # Temporarily use Cloud SQL configuration
    cp .env.cloudsql .env.local
    
    # Generate Prisma client
    npm run db:generate
    
    # Push database schema
    npm run db:push
    
    print_status "Prisma migration completed"
}

# Cleanup
cleanup() {
    echo "Cleaning up..."
    
    # Remove IP authorization (optional - you might want to keep it)
    read -p "Remove IP authorization from Cloud SQL? (y/N): " REMOVE_IP
    if [[ $REMOVE_IP =~ ^[Yy]$ ]]; then
        gcloud sql instances patch $INSTANCE_NAME \
            --clear-authorized-networks \
            --project=$PROJECT_ID \
            --quiet
        print_status "IP authorization removed"
    fi
    
    # Keep backup file
    print_status "Backup file $BACKUP_FILE kept for safety"
}

# Main execution
main() {
    echo "🔄 Database Migration to Google Cloud SQL"
    echo "========================================"
    
    check_dependencies
    get_local_db_info
    test_local_connection
    export_local_database
    get_cloud_sql_ip
    authorize_ip
    import_to_cloud_sql
    generate_env_config
    run_prisma_migration
    cleanup
    
    echo ""
    echo "🎉 Migration completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Update your .env.local file with the new DATABASE_URL from .env.cloudsql"
    echo "2. Test your application with the new Cloud SQL database"
    echo "3. Update your production environment variables"
    echo ""
    echo "Cloud SQL Instance Details:"
    echo "- Instance Name: $INSTANCE_NAME"
    echo "- Database Name: $DATABASE_NAME"
    echo "- IP Address: $CLOUD_SQL_IP"
    echo "- User: $CLOUD_SQL_USER"
    echo ""
    print_warning "Keep your backup file ($BACKUP_FILE) safe until you're sure everything works correctly"
}

# Run main function
main "$@"
