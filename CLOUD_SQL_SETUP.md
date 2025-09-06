# Google Cloud SQL Setup Guide

This guide covers migrating your local PostgreSQL database to Google Cloud SQL and configuring your application to use it.

## Cloud SQL Instance Details

- **Project ID**: `wingman-interview-470419`
- **Instance Name**: `wingman-interview-db`
- **Database Name**: `wingman_interview`
- **Database Version**: PostgreSQL 15
- **Region**: `us-central1`
- **Tier**: `db-f1-micro` (can be upgraded later)
- **IP Address**: `34.172.158.154`

## Database User

- **Username**: `wingman_user`
- **Password**: `WingmanSecure2024!`

## Migration Options

### Option 1: Automated Migration Script (Recommended)

Run the comprehensive migration script:

```bash
./migrate-to-cloud-sql.sh
```

This script will:
1. Export your local database
2. Set up IP authorization
3. Import data to Cloud SQL
4. Generate new environment configuration
5. Run Prisma migrations

### Option 2: Cloud SQL Proxy (More Secure)

For development with enhanced security:

```bash
./migrate-with-proxy.sh
```

This approach uses Cloud SQL Proxy to create a secure tunnel.

## Manual Setup Steps

### 1. Install Cloud SQL Proxy (for development)

```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/
```

### 2. Start Cloud SQL Proxy

```bash
cloud-sql-proxy wingman-interview-470419:us-central1:wingman-interview-db --port 5433
```

### 3. Update Environment Variables

#### Development (.env.local)
```env
# Via Cloud SQL Proxy (recommended for development)
DATABASE_URL="postgresql://wingman_user:WingmanSecure2024!@127.0.0.1:5433/wingman_interview"
```

#### Production (direct connection)
```env
# Direct connection for production
DATABASE_URL="postgresql://wingman_user:WingmanSecure2024!@34.172.158.154:5432/wingman_interview"

# Or using Unix socket (App Engine/Cloud Run)
DATABASE_URL="postgresql://wingman_user:WingmanSecure2024!@/wingman_interview?host=/cloudsql/wingman-interview-470419:us-central1:wingman-interview-db"
```

### 4. Run Prisma Migrations

```bash
npm run db:generate
npm run db:push
```

## Security Considerations

### IP Whitelisting

For direct connections, add your IP to authorized networks:

```bash
gcloud sql instances patch wingman-interview-db \
  --authorized-networks="YOUR_IP/32" \
  --project=wingman-interview-470419
```

### SSL Configuration

Enable SSL for production:

```bash
gcloud sql instances patch wingman-interview-db \
  --require-ssl \
  --project=wingman-interview-470419
```

### Connection Pooling

For production applications, consider using connection pooling:

```env
DATABASE_URL="postgresql://wingman_user:WingmanSecure2024!@34.172.158.154:5432/wingman_interview?pgbouncer=true&connection_limit=5"
```

## Backup and Maintenance

### Automated Backups

Backups are automatically configured:
- **Start Time**: 02:00 UTC
- **Retention**: 7 days (default)

### Manual Backup

```bash
gcloud sql export sql wingman-interview-db gs://your-backup-bucket/backup-$(date +%Y%m%d).sql \
  --database=wingman_interview \
  --project=wingman-interview-470419
```

### Restore from Backup

```bash
gcloud sql import sql wingman-interview-db gs://your-backup-bucket/backup-file.sql \
  --database=wingman_interview \
  --project=wingman-interview-470419
```

## Monitoring and Scaling

### View Instance Metrics

```bash
gcloud sql instances describe wingman-interview-db \
  --project=wingman-interview-470419
```

### Scale Up Instance

```bash
gcloud sql instances patch wingman-interview-db \
  --tier=db-n1-standard-1 \
  --project=wingman-interview-470419
```

### Increase Storage

```bash
gcloud sql instances patch wingman-interview-db \
  --storage-size=20GB \
  --project=wingman-interview-470419
```

## Troubleshooting

### Connection Issues

1. **Check instance status**:
   ```bash
   gcloud sql instances list --project=wingman-interview-470419
   ```

2. **Verify IP authorization**:
   ```bash
   gcloud sql instances describe wingman-interview-db \
     --project=wingman-interview-470419 \
     --format="value(settings.ipConfiguration.authorizedNetworks[].value)"
   ```

3. **Test connection**:
   ```bash
   psql "postgresql://wingman_user:WingmanSecure2024!@34.172.158.154:5432/wingman_interview" -c "SELECT 1;"
   ```

### Performance Issues

1. **Enable query insights**:
   ```bash
   gcloud sql instances patch wingman-interview-db \
     --insights-config-query-insights-enabled \
     --project=wingman-interview-470419
   ```

2. **Monitor slow queries** in the Cloud Console

### Common Errors

- **Connection timeout**: Check firewall rules and IP whitelisting
- **Authentication failed**: Verify username/password
- **Database not found**: Ensure database name is correct
- **SSL required**: Add `?sslmode=require` to connection string

## Cost Optimization

- **Use Cloud SQL Proxy** for development to avoid constant connections
- **Scale down** during low usage periods
- **Use read replicas** for read-heavy workloads
- **Monitor usage** in Cloud Console billing section

## Next Steps

1. Test your application with the new Cloud SQL database
2. Update your CI/CD pipeline with new connection strings
3. Configure monitoring and alerting
4. Set up read replicas if needed for production
5. Implement connection pooling for better performance
