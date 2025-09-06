# Google Cloud SQL Setup Guide

## Step 1: Create Google Cloud SQL PostgreSQL Instance

### Using Google Cloud Console:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project: `wingman-interview-470419`

2. **Navigate to Cloud SQL**
   - In the left sidebar, go to "SQL" under "Databases"
   - Click "Create Instance"

3. **Choose PostgreSQL**
   - Select "PostgreSQL" as your database engine
   - Click "Next"

4. **Configure Instance Settings**
   ```
   Instance ID: wingman-interview-db
   Password: [Create a strong password - save this!]
   Database version: PostgreSQL 15 (recommended)
   Region: us-central1 (same as your other resources)
   Zone: us-central1-a
   ```

5. **Machine Configuration**
   ```
   Machine type: Shared core (1 vCPU, 0.614 GB RAM) - for development
   Storage type: SSD
   Storage size: 10 GB (can be increased later)
   Enable automatic storage increases: Yes
   ```

6. **Connections**
   ```
   Public IP: Enable
   Authorized networks: Add 0.0.0.0/0 (for development - restrict in production)
   Private IP: Disable (for now)
   ```

7. **Backup and Recovery**
   ```
   Enable automated backups: Yes
   Backup window: Choose a time when your app has low usage
   Point-in-time recovery: Enable
   ```

8. **Maintenance**
   ```
   Maintenance window: Choose a suitable time
   Order of update: Earlier
   ```

9. **Flags and Labels** (Optional)
   - Leave as default for now

10. **Click "Create Instance"**
    - This will take 5-10 minutes to complete

## Step 2: Create Database and User

Once your instance is created:

1. **Connect to your instance**
   - Click on your instance name in the Cloud SQL instances list
   - Go to "Databases" tab
   - Click "Create Database"
   - Database name: `wingman_interview`
   - Click "Create"

2. **Create a database user**
   - Go to "Users" tab
   - Click "Add User Account"
   - Username: `wingman_user`
   - Password: [Create a strong password - save this!]
   - Click "Add"

## Step 3: Get Connection Details

1. **Get your connection information**
   - Go to "Overview" tab of your instance
   - Note down:
     - **Public IP address**: (e.g., 34.123.45.67)
     - **Connection name**: (e.g., wingman-interview-470419:us-central1:wingman-interview-db)

## Step 4: Update Environment Variables

Update your `.env.local` file with the following:

```bash
# Google Cloud SQL Database
DATABASE_URL="postgresql://wingman_user:YOUR_PASSWORD@YOUR_PUBLIC_IP:5432/wingman_interview?sslmode=require"

# Example:
# DATABASE_URL="postgresql://wingman_user:mypassword123@34.123.45.67:5432/wingman_interview?sslmode=require"
```

## Step 5: Test Connection and Run Migrations

Run these commands in your terminal:

```bash
# Test the connection
npx prisma db pull

# Push your schema to the database
npx prisma db push

# Generate the Prisma client
npx prisma generate

# Optional: Seed the database with initial data
npx prisma db seed
```

## Alternative: Using Google Cloud CLI

If you prefer using the command line:

```bash
# Create the instance
gcloud sql instances create wingman-interview-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --root-password=YOUR_ROOT_PASSWORD

# Create the database
gcloud sql databases create wingman_interview \
    --instance=wingman-interview-db

# Create a user
gcloud sql users create wingman_user \
    --instance=wingman-interview-db \
    --password=YOUR_USER_PASSWORD

# Get connection info
gcloud sql instances describe wingman-interview-db
```

## Security Best Practices

### For Production:
1. **Restrict IP access**
   - Remove 0.0.0.0/0 from authorized networks
   - Add only your application's IP addresses

2. **Use Cloud SQL Proxy**
   - More secure than direct IP connections
   - Handles SSL automatically

3. **Enable SSL**
   - Download SSL certificates from Cloud SQL
   - Update connection string to use SSL

4. **Use IAM authentication**
   - Instead of password-based authentication
   - More secure for production environments

## Monitoring and Maintenance

1. **Enable monitoring**
   - Set up alerts for CPU, memory, and storage usage
   - Monitor connection counts

2. **Regular backups**
   - Automated backups are enabled by default
   - Test restore procedures periodically

3. **Performance optimization**
   - Monitor slow queries
   - Optimize database indexes as needed

## Troubleshooting

### Common Issues:

1. **Connection timeout**
   - Check authorized networks settings
   - Verify firewall rules

2. **SSL connection errors**
   - Ensure `sslmode=require` in connection string
   - Check SSL certificate configuration

3. **Authentication failed**
   - Verify username and password
   - Check user permissions

### Useful Commands:

```bash
# Test connection
psql "postgresql://wingman_user:password@ip:5432/wingman_interview?sslmode=require"

# Check Prisma connection
npx prisma studio

# View database logs
gcloud sql operations list --instance=wingman-interview-db
```

## Cost Optimization

1. **Start small**
   - Use shared-core instances for development
   - Scale up as needed

2. **Monitor usage**
   - Set up billing alerts
   - Review monthly usage reports

3. **Optimize storage**
   - Enable automatic storage increases
   - Monitor storage growth patterns

## Next Steps

After setting up the database:

1. Run Prisma migrations to create all tables
2. Test the interview application with the new database
3. Verify that conversational interviews are being tracked
4. Set up monitoring and alerts
5. Plan for production security hardening
