# Wingman

A production-ready MVP web application that helps you prepare for difficult conversations with AI and expert guidance. Built with Next.js 14, TypeScript, Prisma, and NextAuth.

## Features

### For Interviewees
- **AI-Powered Practice**: Practice with intelligent AI that adapts to your skill level
- **Expert Sessions**: Book sessions with verified industry professionals
- **Detailed Feedback**: Get comprehensive reports with charts and actionable insights
- **Progress Tracking**: Monitor improvement with readiness scores and analytics
- **Voice Analysis**: Speech pattern analysis and confidence metrics

### For Interviewers
- **Expert Marketplace**: Set availability and expertise areas
- **Session Management**: Conduct and provide feedback for mock interviews
- **Verification System**: Get verified to increase booking rates
- **Earnings**: Monetize your expertise by helping others

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui + Lucide React icons
- **Forms**: React Hook Form + Zod validation
- **State Management**: TanStack Query + Next.js server actions
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: NextAuth with Email/Password + Google/Microsoft OAuth
- **Charts**: Recharts for analytics visualization
- **File Upload**: UploadThing integration ready
- **Testing**: Playwright (E2E) + Vitest (unit tests)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Google Cloud Platform account (for video analysis)
- Google OAuth credentials (optional)
- Microsoft OAuth credentials (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd interview-practice-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Fill in your environment variables:
   ```env
   # Database - Google Cloud SQL
   DATABASE_URL="postgresql://wingman_user:WingmanSecure2024!@127.0.0.1:5433/wingman_interview"
   
   # NextAuth
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here"
   
   # OAuth Providers (optional)
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   MICROSOFT_CLIENT_ID="your-microsoft-client-id"
   MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"
   
   # UploadThing (optional)
   UPLOADTHING_SECRET="your-uploadthing-secret"
   UPLOADTHING_APP_ID="your-uploadthing-app-id"
   ```

4. **Start PostgreSQL**
   
   Using Docker:
   ```bash
   docker-compose up -d
   ```
   
   Or use your local PostgreSQL installation.

5. **Set up the database**
   ```bash
   npm run db:push
   npm run db:seed
   ```

6. **Initialize shadcn/ui** (if needed)
   ```bash
   npx shadcn-ui@latest init
   ```

7. **Start the development server**
   ```bash
   npm run dev
   ```

8. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## Database Setup

The application uses Prisma with PostgreSQL. The schema includes:

- **Users & Authentication**: NextAuth integration with multiple providers
- **Profiles**: Separate profiles for interviewees and interviewers
- **Sessions**: AI, human, and peer interview sessions
- **Reports**: Detailed feedback with charts and analytics
- **Recordings**: Session recordings with consent management
- **Scheduling**: Availability slots and booking system

### Seed Data

The seed script creates:
- 2 interviewers (1 verified, 1 pending)
- 2 interviewees (PM and SWE backgrounds)
- Sample job descriptions
- Completed sessions with reports
- Library content

Login credentials (all users):
- **Password**: `password123`
- **Interviewee (PM)**: `pm.candidate@example.com`
- **Interviewee (SWE)**: `swe.candidate@example.com`
- **Interviewer (Verified)**: `expert1@example.com`
- **Interviewer (Pending)**: `expert2@example.com`

## OAuth Setup

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`

### Microsoft OAuth
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add redirect URI: `http://localhost:3000/api/auth/callback/microsoft`
4. Generate client secret

## Project Structure

```
├── app/                    # Next.js 14 App Router
│   ├── (marketing)/        # Public marketing pages
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Main dashboard
│   ├── practice/          # AI practice sessions
│   ├── experts/           # Expert marketplace
│   ├── feedback/          # Report viewing
│   ├── recordings/        # Session recordings
│   └── onboarding/        # User onboarding flows
├── components/            # Reusable UI components
│   ├── ui/               # shadcn/ui components
│   └── charts/           # Chart components
├── lib/                  # Utility functions
├── prisma/               # Database schema and migrations
└── tests/                # Test files
```

## Key Features Implementation

### AI Interview System
- Configurable interview types (behavioral, technical, product, system design)
- Real-time speech analysis and feedback
- Adaptive questioning based on responses
- Comprehensive scoring algorithm

### Expert Marketplace
- Verified interviewer profiles
- Availability management
- Booking system with calendar integration
- Rating and review system

### Analytics & Reporting
- Radar charts for skill assessment
- Speech pace and confidence tracking
- Sentiment analysis
- Peer comparison metrics
- Progress tracking over time

### Authentication & Security
- Multi-provider OAuth (Google, Microsoft, Email/Password)
- Role-based access control
- Session management
- Data privacy compliance

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `GET/POST /api/auth/[...nextauth]` - NextAuth handlers

### Job Descriptions
- `POST /api/jd/parse` - Parse and extract keywords from JD text

### Expert System
- `GET /api/experts` - List available experts with filters
- `GET /api/experts/[id]` - Get expert details and availability

### Booking System
- `POST /api/bookings` - Create new booking
- `POST /api/availability` - Update interviewer availability

### AI Interview
- `POST /api/ai/start` - Start AI interview session
- `POST /api/ai/ingest` - Process transcript chunks
- `POST /api/ai/finish` - Complete session and generate report

### Reports & Analytics
- `GET /api/reports/[id]` - Get detailed feedback report
- `GET /api/analytics/overview` - User analytics dashboard
- `GET /api/recordings` - List user's recordings

## Testing

### Unit Tests (Vitest)
```bash
npm run test
```

### E2E Tests (Playwright)
```bash
npm run test:e2e
```

### Test Coverage
The test suite covers:
- Authentication flows
- AI interview session creation
- Expert booking process
- Report generation
- Dashboard functionality

## Deployment

### Environment Setup
1. Set up production database (PostgreSQL)
2. Configure OAuth providers for production URLs
3. Set up UploadThing for file storage
4. Configure environment variables

### Build & Deploy
```bash
npm run build
npm start
```

### Database Migration
```bash
npm run db:push
npm run db:seed
```

## Development Guidelines

### Code Style
- TypeScript strict mode enabled
- ESLint + Prettier for code formatting
- Consistent component structure
- Error handling with proper user feedback

### Accessibility
- WCAG AA compliance
- Keyboard navigation support
- Screen reader compatibility
- Focus management in modals

### Performance
- Server-side rendering where appropriate
- Image optimization with next/image
- Code splitting and lazy loading
- Database query optimization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test files for usage examples

## Roadmap

### Phase 1 (Current)
- ✅ Core interview practice functionality
- ✅ Expert marketplace
- ✅ Basic analytics and reporting
- ✅ Authentication system

### Phase 2 (Planned)
- [ ] Real-time video interviews
- [ ] Advanced AI features
- [ ] Mobile app
- [ ] Payment processing
- [ ] Advanced analytics

### Phase 3 (Future)
- [ ] Enterprise features
- [ ] API for third-party integrations
- [ ] Advanced matching algorithms
- [ ] Multi-language support
