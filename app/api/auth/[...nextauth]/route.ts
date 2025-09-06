import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// Create the standard NextAuth handler
const standardHandler = NextAuth(authOptions)

// Custom handler to intercept the response and set session cookie if needed
async function customHandler(req: NextRequest, context: any) {
  // Get the original response from NextAuth
  const response = await standardHandler(req, context)
  
  // Check if this is a sign-in request
  if (req.method === 'POST' && req.url.includes('/api/auth/callback/credentials')) {
    console.log('🔍 Intercepted credentials callback response')
    
    // Extract user data from the request if available
    try {
      const body = await req.json().catch(() => ({}))
      const { email } = body || {}
      
      if (email && process.env.FORCE_SESSION_CREATION === 'true') {
        console.log(`🔍 Checking for forced session for user: ${email}`)
        
        // Find the user to get the session token we attached in the signIn callback
        const user = await fetch(`${process.env.NEXTAUTH_URL}/api/auth/session`, {
          headers: {
            Cookie: response.headers.get('set-cookie') || ''
          }
        }).then(res => res.json()).catch(() => null)
        
        if (user?.dbSessionToken) {
          console.log('🔧 Found session token in session data, setting cookie')
          
          // Create a new response with the session cookie
          const newResponse = NextResponse.json(response.body)
          
          // Copy all headers from the original response
          response.headers.forEach((value: string, key: string) => {
            newResponse.headers.set(key, value)
          })
          
          // Set the session cookie
          const expires = new Date()
          expires.setDate(expires.getDate() + 30)
          
          newResponse.cookies.set('next-auth.session-token', user.dbSessionToken, {
            expires,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/'
          })
          
          console.log('✅ Session cookie set in response')
          return newResponse
        }
      }
    } catch (error) {
      console.error('❌ Error in custom handler:', error)
    }
  }
  
  return response
}

export const GET = (req: NextRequest, context: any) => customHandler(req, context)
export const POST = (req: NextRequest, context: any) => customHandler(req, context)
