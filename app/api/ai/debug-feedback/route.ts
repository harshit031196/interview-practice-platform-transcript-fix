import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
 
export async function GET(request: NextRequest) {
  try {
    // Get all interview sessions
    const sessions = await (prisma as any).interviewSession.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        intervieweeId: true
      }
    });

    // Get all feedback records
    const feedback = await (prisma as any).interviewFeedback.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        transcript: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      sessions,
      feedback,
      sessionCount: sessions.length,
      feedbackCount: feedback.length
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json(
      { error: `Debug failed: ${error}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Check if session exists
    const session = await (prisma as any).interviewSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if feedback exists
    const existingFeedback = await (prisma as any).interviewFeedback.findUnique({
      where: { sessionId: sessionId }
    });

    return NextResponse.json({
      session,
      feedback: existingFeedback,
      hasFeedback: !!existingFeedback
    });

  } catch (error) {
    console.error('Debug session error:', error);
    return NextResponse.json(
      { error: `Debug session failed: ${error}` },
      { status: 500 }
    );
  }
}
