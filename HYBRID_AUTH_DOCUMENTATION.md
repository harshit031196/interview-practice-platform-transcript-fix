# Hybrid Authentication System Documentation

## Overview

The interview practice platform uses a hybrid authentication approach that combines JWT (JSON Web Token) and database sessions for maximum reliability and security. This document explains the architecture, implementation details, and best practices for maintaining the authentication system.

## Authentication Architecture

### Core Components

1. **JWT Sessions (Primary)**
   - Used for browser-based authentication
   - Stored in HTTP-only cookies
   - Managed by NextAuth.js
   - 30-day expiration with 24-hour refresh

2. **Database Sessions (Secondary)**
   - Created in parallel with JWT sessions
   - Linked to JWT sessions via `jwtTokenId`
   - Used for API authentication
   - Stored in the `Session` table via Prisma
   - Accessible via both standard and database-specific cookies

3. **Session Synchronization**
   - JWT sessions are synchronized with database sessions
   - Database sessions contain reference to JWT token ID
   - JWT tokens contain reference to database session token
   - Database session tokens available in both `next-auth.session-token` and `next-auth.database-session` cookies

## Implementation Details

### NextAuth Configuration

The core NextAuth configuration in `lib/auth.ts` uses:

```typescript
session: {
  strategy: 'jwt',
  maxAge: 30 * 24 * 60 * 60, // 30 days
  updateAge: 24 * 60 * 60, // 24 hours
},
adapter: PrismaAdapter(prisma),
```

This configuration:
- Uses JWT strategy for browser sessions
- Maintains database records via PrismaAdapter
- Sets appropriate session lifetimes

### Authentication Flow

1. **User Login**
   - User authenticates via credentials or OAuth
   - NextAuth creates JWT session
   - JWT callback creates linked database session
   - Both session tokens stored in cookies

2. **Session Validation**
   - API routes first check for JWT token
   - If JWT token is invalid/missing, check database session
   - Database session validated against `Session` table
   - Checks both standard and database-specific session cookies

3. **API Authentication**
   - All API routes implement hybrid authentication check
   - Standard pattern checks JWT → Session → Database Session
   - Consistent error handling for authentication failures

### API Route Authentication Pattern

All API routes follow this standard authentication pattern:

```typescript
// Try to get user from JWT token first
const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

// Then try to get user from database session
const session = await getServerSession(authOptions);

// Get user ID from either JWT token or session
let userId = token?.sub || session?.user?.id;

// If no JWT or session, check for database session directly
if (!userId) {
  // Check standard session token first
  let sessionToken = request.cookies.get('next-auth.session-token')?.value;
  
  // If not found, check for database-specific session token (for hybrid fallback)
  if (!sessionToken) {
    sessionToken = request.cookies.get('next-auth.database-session')?.value;
    if (sessionToken) {
      console.log('[API] Found database-specific session token');
    }
  }
  
  if (sessionToken) {
    const dbSession = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
    
    if (dbSession && dbSession.expires > new Date()) {
      userId = dbSession.userId;
    }
  }
}

if (!userId) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### AI Routes with Hybrid Authentication

All AI-related API routes have been updated to support the hybrid authentication pattern, including:

1. **AI Interviewer** (`/api/ai/interviewer`)
   - Handles conversational AI interview questions and responses
   - Supports both JWT and database session authentication
   - Checks for database-specific session token as fallback

2. **AI Feedback** (`/api/ai/feedback`)
   - Provides STAR method feedback on interview responses
   - Both POST and GET methods support hybrid authentication
   - Consistent authentication pattern across all methods

3. **AI Start** (`/api/ai/start`)
   - Initializes AI interview sessions
   - Validates user authentication via hybrid approach
   - Creates session records with authenticated user ID

4. **AI Speech Stream** (`/api/ai/speech-stream`)
   - Handles real-time speech-to-text processing
   - Both POST and GET methods support hybrid authentication
   - Maintains WebSocket-like streaming with authenticated sessions

5. **AI Finish** (`/api/ai/finish`)
   - Completes interview sessions and generates reports
   - Validates user ownership of sessions via hybrid authentication
   - Updates session status and generates feedback

## Frontend Integration

### Session Management

The frontend uses NextAuth's `getSession()` and `signIn()` functions for session management. The `UnifiedInterviewSession` component implements a robust session validation mechanism:

1. First attempts to get JWT session via `getSession()`
2. If JWT session is missing/expired, validates via API endpoint
3. Implements retry logic for transient authentication issues

### Session Refresh

Session refresh is handled automatically by NextAuth for JWT sessions. For API calls, the application includes the session cookie with all requests, allowing the server to validate the session.

## Security Considerations

1. **Cookie Security**
   - HTTP-only cookies prevent JavaScript access
   - Secure flag in production environments
   - SameSite=Lax protection against CSRF

2. **Token Storage**
   - JWT tokens never exposed to client JavaScript
   - Database session tokens stored securely in database
   - Session expiration enforced on both client and server

3. **API Protection**
   - All sensitive API routes protected by authentication
   - Consistent validation across all endpoints
   - No sensitive data in JWT payloads

## Deprecated Components

The following components are maintained only for backward compatibility and should not be used in new code:

1. **Direct Session Creation API**
   - Path: `/api/auth/create-direct-session`
   - Purpose: Legacy support for test scripts
   - Replacement: Use standard NextAuth JWT authentication

## Hybrid Fallback Verification

The platform includes a comprehensive test script (`test-hybrid-auth-verification.js`) that verifies all aspects of the hybrid authentication system, including the fallback mechanism:

1. **Login Test**: Verifies credential-based login and JWT session creation
2. **JWT Session Test**: Validates JWT session token and user data
3. **API Access Test**: Confirms API access with JWT session
4. **Database Session Test**: Verifies database session creation and token storage
5. **Database API Test**: Tests API access with database session validation
6. **Hybrid Fallback Test**: Simulates JWT expiration and tests fallback to database session

### Hybrid Fallback Mechanism

The hybrid fallback test works as follows:

1. Extracts the database session token from the JWT session payload
2. Creates a modified cookie set with only the database session token
3. Attempts API access with only the database session token
4. Verifies that the API correctly authenticates using the database session

```javascript
// Extract database session token from JWT payload
const sessionData = await sessionResponse.json();
const dbSessionToken = sessionData.dbSessionToken;

// Create modified cookies with only database session token
const modifiedCookies = {};
modifiedCookies['next-auth.database-session'] = dbSessionToken;

// Test API access with database session only
const response = await fetch(`${BASE_URL}/api/interviews`, {
  headers: {
    Cookie: serializeCookies(modifiedCookies),
    'X-Auth-Method': 'hybrid-session', // Signal to use hybrid authentication
  },
});
```

## Best Practices

1. **Adding New API Routes**
   - Always implement the full hybrid authentication pattern
   - Include proper error handling and logging
   - Follow the established pattern in existing routes
   - Check for both standard and database-specific session cookies

2. **Testing Authentication**
   - Test both JWT and database session authentication paths
   - Verify session expiration handling
   - Test with both browser and API clients

3. **Troubleshooting**
   - Check browser cookies for valid session tokens
   - Verify database session records in the `Session` table
   - Review server logs for authentication failures

## Middleware Integration

The application uses NextAuth middleware for protected routes:

```typescript
export default withAuth(
  async function middleware(req) {
    // JWT validation happens automatically
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // JWT token validation is sufficient for protected routes
        return !!token;
      },
    },
  }
)
```

Protected routes are defined in the middleware configuration:

```typescript
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/practice/:path*',
    '/experts/:path*',
    // Additional protected routes...
  ]
}
```
