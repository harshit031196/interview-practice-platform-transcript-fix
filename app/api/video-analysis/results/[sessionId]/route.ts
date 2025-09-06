import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Get video analysis results for a specific session
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    // Check authentication - support JWT, session, and API key
    const session = await getServerSession(authOptions);
    const jwtToken = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET });
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.API_SECRET_KEY;

    let userId: string | null = null;
    let isAuthenticated = false;
    let usingApiKey = false;
    if (jwtToken) {
      isAuthenticated = true;
      userId = (jwtToken as any).userId || jwtToken.sub || null;
    } else if (session?.user?.id) {
      isAuthenticated = true;
      userId = session.user.id;
    } else if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
      isAuthenticated = true;
      usingApiKey = true;
    }

    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;

    // Authorization: if using user auth, verify ownership of session
    if (!usingApiKey && userId) {
      const ownsSession = await prisma.interviewSession.findFirst({
        where: { id: sessionId, intervieweeId: userId }
      });
      if (!ownsSession) {
        // Fallback: allow if there's a video_analysis row for this sessionId owned by this user
        const analysisOwned = await prisma.videoAnalysis.findFirst({
          where: { sessionId, userId }
        });
        if (!analysisOwned) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    // Fetch analysis by sessionId (not restricted by userId) once ownership is confirmed
    const analysisResult = await prisma.videoAnalysis.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }
    });

    if (!analysisResult) {
      return NextResponse.json({ 
        error: 'No video analysis found for this session' 
      }, { status: 404 });
    }

    // Parse the stored JSON results
    const analysisData = JSON.parse(analysisResult.results);

    // Handle both new (flat) and old (nested) data structures for backward compatibility.
    if (analysisData && analysisData.results) {
      // Old format: data is nested inside a 'results' key.
      return NextResponse.json(analysisData.results);
    } else {
      // New format: data is already in the correct flat structure.
      return NextResponse.json(analysisData);
    }

  } catch (error) {
    console.error('Error fetching video analysis results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analysis results' },
      { status: 500 }
    );
  }
}

// Store video analysis results for a session
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    // Check authentication - support both session and API key
    const session = await getServerSession(authOptions);
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.API_SECRET_KEY;
    
    // Allow access if either valid session OR valid API key
    const isAuthenticated = session || (apiKey && expectedApiKey && apiKey === expectedApiKey);
    
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;
    const analysisData = await request.json();

    // Store the analysis results
    // For API key auth, we need to handle the case where there's no user session
    if (session?.user?.id) {
      // Session-based auth - store with user ID
      // Determine segment index from query or payload; default to 0
      const url = new URL(request.url);
      const segParam = url.searchParams.get('segmentIndex') ?? url.searchParams.get('segment');
      let segmentIndex = 0;
      if (typeof (analysisData as any)?.segmentIndex === 'number') {
        segmentIndex = (analysisData as any).segmentIndex as number;
      } else if (segParam) {
        const parsed = parseInt(segParam, 10);
        if (!Number.isNaN(parsed)) segmentIndex = parsed;
      }

      const result = await prisma.videoAnalysis.upsert({
        where: {
          sessionId_segmentIndex: {
            sessionId: sessionId,
            segmentIndex: segmentIndex,
          }
        },
        update: {
          results: JSON.stringify(analysisData),
          updatedAt: new Date(),
          userId: session.user.id,
        },
        create: {
          sessionId: sessionId,
          userId: session.user.id,
          segmentIndex: segmentIndex,
          results: JSON.stringify(analysisData),
        },
      });
      
      return NextResponse.json({
        success: true,
        analysisId: result.id,
      });
    } else {
      // API key auth - skip database storage since we don't have a user ID
      console.log('Skipping database storage - API key authentication used (no user session)');
      return NextResponse.json({
        success: true,
        message: 'Analysis completed but not stored (API key authentication)',
      });
    }

  } catch (error) {
    console.error('Error storing video analysis results:', error);
    return NextResponse.json(
      { error: 'Failed to store analysis results' },
      { status: 500 }
    );
  }
}
