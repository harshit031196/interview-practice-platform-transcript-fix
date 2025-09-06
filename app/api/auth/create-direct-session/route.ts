import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

/**
 * @deprecated This API is deprecated and will be removed in a future version.
 * Use the standard NextAuth JWT session mechanism instead.
 * This endpoint is kept only for backward compatibility with test scripts.
 */

export async function POST(request: NextRequest) {
  console.warn('[DEPRECATED] Direct session creation API is being used. This API will be removed in a future version.');
  
  try {
    // Check if user is authenticated via JWT or database session
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const session = await getServerSession(authOptions);
    let userId = token?.sub || session?.user?.id;
    
    // For test scripts, allow providing the email in the request body
    if (!userId) {
      const body = await request.json().catch(() => ({}));
      
      if (body.email) {
        console.log(`Attempting to find user by email: ${body.email}`);
        const user = await prisma.user.findUnique({
          where: { email: body.email }
        });
        
        if (user) {
          userId = user.id;
          console.log(`Found user with ID: ${userId} for email: ${body.email}`);
        }
      }
    }
    
    if (!userId) {
      console.error('Unauthorized attempt to create direct session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    
    console.log(`Creating direct database session for user ID: ${userId}`);
    
    // Create session in database
    const dbSession = await prisma.session.create({
      data: {
        sessionToken,
        userId,
        expires,
      },
    });
    
    console.log(`Direct session created with ID: ${dbSession.id}`);
    
    // Set session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('next-auth.session-token', sessionToken, {
      expires,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
    
    return response;
  } catch (error) {
    console.error('Error creating direct session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
