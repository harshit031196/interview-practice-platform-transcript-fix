# Interview Practice Platform - Setup Guide

## Prerequisites Installation

### 1. Install Node.js (Required)

**Option A: Using Node Version Manager (Recommended)**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or run:
source ~/.zshrc

# Install Node.js 18+
nvm install 18
nvm use 18
nvm alias default 18
```

**Option B: Direct Download**
- Visit [nodejs.org](https://nodejs.org/)
- Download Node.js 18+ LTS version
- Run the installer

**Option C: Using Homebrew**
```bash
# Install Homebrew first
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node@18
```

### 2. Verify Installation
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 8.x.x or higher
```

## Project Setup

### 1. Install Dependencies
```bash
cd /Users/harshitgupta/CascadeProjects/interview-practice-platform
npm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env.local

# Edit the .env.local file with your values
nano .env.local
```

**Required Environment Variables:**
```env
# Database (Required) - Google Cloud SQL
DATABASE_URL="postgresql://wingman_user:WingmanSecure2024!@127.0.0.1:5433/wingman_interview"

# NextAuth (Required)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-min-32-chars"

# OAuth Providers (Optional but recommended)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"

# File Upload (Optional)
UPLOADTHING_SECRET="your-uploadthing-secret"
UPLOADTHING_APP_ID="your-uploadthing-app-id"
```

### 3. Database Setup

**Option A: Using Docker (Recommended)**
```bash
# Start PostgreSQL container
docker-compose up -d

# Wait for container to be ready (30 seconds)
sleep 30
```

**Option B: Local PostgreSQL**
```bash
# Install PostgreSQL
brew install postgresql@14
brew services start postgresql@14

# Create database
createdb interview_practice
```

### 4. Initialize Database
```bash
# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed
```

### 5. Initialize shadcn/ui
```bash
npx shadcn-ui@latest init
# Choose defaults for all prompts
```

### 6. Start Development Server
```bash
npm run dev
```

### 7. Open Application
Navigate to [http://localhost:3000](http://localhost:3000)

## Test Login Credentials

After seeding, you can login with these accounts:

**Interviewee (PM Background):**
- Email: `pm.candidate@example.com`
- Password: `password123`

**Interviewee (SWE Background):**
- Email: `swe.candidate@example.com`
- Password: `password123`

**Interviewer (Verified):**
- Email: `expert1@example.com`
- Password: `password123`

**Interviewer (Pending):**
- Email: `expert2@example.com`
- Password: `password123`

## OAuth Setup (Optional)

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable Google+ API
3. Create OAuth 2.0 credentials
4. Add redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID and Secret to `.env.local`

### Microsoft OAuth
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register new application
3. Add redirect URI: `http://localhost:3000/api/auth/callback/microsoft`
4. Generate client secret
5. Copy Application ID and Secret to `.env.local`

## Testing

### Run Unit Tests
```bash
npm run test
```

### Run E2E Tests
```bash
npm run test:e2e
```

### Run Linting
```bash
npm run lint
```

## Troubleshooting

### Common Issues

**1. Database Connection Error**
- Ensure PostgreSQL is running
- Check DATABASE_URL format
- Verify database exists

**2. NextAuth Error**
- Ensure NEXTAUTH_SECRET is at least 32 characters
- Check NEXTAUTH_URL matches your domain

**3. Build Errors**
- Clear node_modules: `rm -rf node_modules package-lock.json`
- Reinstall: `npm install`

**4. Port Already in Use**
- Change port: `npm run dev -- -p 3001`
- Or kill process: `lsof -ti:3000 | xargs kill -9`

### Reset Database
```bash
# Reset and reseed database
npm run db:push --force-reset
npm run db:seed
```

### Clean Install
```bash
# Clean everything and reinstall
rm -rf node_modules package-lock.json .next
npm install
npm run db:push
npm run db:seed
```

## Production Deployment

### Environment Variables
Set these in your production environment:
- `DATABASE_URL` - Production Google Cloud SQL URL
- `NEXTAUTH_URL` - Your production domain
- `NEXTAUTH_SECRET` - Strong secret key
- OAuth credentials for production domains

### Build Commands
```bash
npm run build
npm start
```

### Database Migration
```bash
npm run db:push
npm run db:seed
```

## Support

If you encounter issues:
1. Check this troubleshooting guide
2. Review the main README.md
3. Check the test files for usage examples
4. Create an issue in the repository

## Next Steps

After successful setup:
1. Explore the dashboard at `/dashboard`
2. Try AI practice at `/practice/ai`
3. Browse experts at `/experts`
4. Complete onboarding at `/onboarding/interviewee`
5. Check recordings at `/recordings`

The MVP is now ready for development and testing!
