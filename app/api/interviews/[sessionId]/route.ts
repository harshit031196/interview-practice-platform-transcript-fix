import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Authentication logic
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const session = await getServerSession(authOptions);
    let userId = token?.sub || session?.user?.id;

    if (!userId) {
      let sessionToken = request.cookies.get('next-auth.session-token')?.value || request.cookies.get('next-auth.database-session')?.value;
      if (sessionToken) {
        const dbSession = await prisma.session.findUnique({
          where: { sessionToken },
        });
        if (dbSession && dbSession.expires > new Date()) {
          userId = dbSession.userId;
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch session data
    const interviewSession = await prisma.interviewSession.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!interviewSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Authorization check
    if (interviewSession.intervieweeId !== userId && interviewSession.interviewerId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch analysis data
    let analysisData = null;
    const videoAnalysis = await prisma.videoAnalysis.findFirst({
      where: { sessionId: sessionId },
      orderBy: { createdAt: 'desc' },
    });

    if (videoAnalysis?.results) {
      try {
        analysisData = JSON.parse(videoAnalysis.results);
      } catch (e) {
        console.error('Failed to parse video analysis results:', e);
      }
    }

    const responseData = {
      ...interviewSession,
      analysisData,
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error(`[API] Error fetching session ${params.sessionId}:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
