import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/user
 * Returns the current user's information
 * Supports both JWT and database sessions
 */
export async function GET(req: NextRequest) {
  console.log('[API] GET /api/user - Checking authentication');
  
  try {
    // Try to get user from JWT session first
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    if (token?.sub) {
      console.log('[API] User authenticated via JWT token');
      
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      if (!user) {
        console.error('[API] User not found in database despite valid JWT token');
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      return NextResponse.json(user);
    }
    
    // If no JWT token, try to get user from database session
    const session = await getServerSession(authOptions);
    
    if (session?.user?.email) {
      console.log('[API] User authenticated via database session');
      
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      if (!user) {
        console.error('[API] User not found in database despite valid session');
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      
      return NextResponse.json(user);
    }
    
    // Check for session token in cookies as a last resort
    const sessionToken = req.cookies.get('next-auth.session-token')?.value;
    
    if (sessionToken) {
      console.log('[API] Attempting to authenticate with session token from cookie');
      
      // Find session in database
      const dbSession = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      
      if (dbSession?.user) {
        const user = {
          id: dbSession.user.id,
          name: dbSession.user.name,
          email: dbSession.user.email,
          role: dbSession.user.role,
          createdAt: dbSession.user.createdAt,
          updatedAt: dbSession.user.updatedAt,
        };
        
        return NextResponse.json(user);
      }
    }
    
    // No authentication found
    console.error('[API] No valid authentication found');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('[API] Error in /api/user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
