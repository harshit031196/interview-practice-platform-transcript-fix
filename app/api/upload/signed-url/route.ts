import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// This endpoint generates signed URLs for video uploads
export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/upload/signed-url - Checking authentication');
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions);
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id;
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      const sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
      if (sessionToken) {
        console.log('[API] Checking database session with token');
        try {
          const dbSession = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          });
          
          if (dbSession && dbSession.expires > new Date()) {
            userId = dbSession.userId;
            console.log('[API] Authenticated via database session for user ID:', userId);
          } else {
            console.log('[API] Database session invalid or expired');
          }
        } catch (error) {
          console.error('[API] Error checking database session:', error);
        }
      }
    }
    
    if (!userId) {
      console.error('[API] Unauthorized signed URL request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for signed URL: ${userId}`);

    const { filename, contentType, sessionId } = await request.json();

    if (!filename || !contentType || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: filename, contentType, sessionId' },
        { status: 400 }
      );
    }

    // Validate content type for video files
    if (!contentType.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Only video files are allowed' },
        { status: 400 }
      );
    }

    // Generate unique filename with user ID and session ID
    const uniqueFilename = `interviews/${userId}/${sessionId}/${Date.now()}_${filename}`;

    // Call the Google Cloud Function to get signed URL
    const cloudFunctionUrl = process.env.GENERATE_UPLOAD_URL_ENDPOINT;
    if (!cloudFunctionUrl) {
      return NextResponse.json(
        { error: 'Upload service not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(cloudFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: uniqueFilename,
        contentType: contentType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to generate upload URL');
    }

    const data = await response.json();

    return NextResponse.json({
      signedUrl: data.signedUrl,
      filename: uniqueFilename,
      contentType: contentType,
      expiresAt: data.expiresAt,
      userId: userId, // Include userId in response for debugging
    });

  } catch (error) {
    console.error('[API] Error generating signed URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
