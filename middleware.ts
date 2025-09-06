import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export default withAuth(
  async function middleware(req) {
    // Log middleware execution
    console.log('🔒 NextAuth middleware running for path:', req.nextUrl.pathname);
    
    // Additional hybrid session validation logic can be added here if needed
    // This is where you could add custom logic for specific routes
    // that need special handling beyond the standard JWT validation
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // For hybrid authentication, token will be populated by NextAuth
        // when a valid JWT session exists
        console.log('🔑 NextAuth middleware authorization check:', { 
          hasToken: !!token,
          tokenSub: token?.sub,
          path: req.nextUrl.pathname
        });
        
        // JWT token validation is sufficient for protected routes
        // Database session validation happens in the API routes themselves
        return !!token;
      },
    },
  }
)

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/practice/:path*',
    '/experts/:path*',
    '/bookings/:path*',
    '/feedback/:path*',
    '/recordings/:path*',
    '/library/:path*',
    '/messages/:path*',
    '/profile/:path*',
    '/onboarding/:path*'
  ]
}
