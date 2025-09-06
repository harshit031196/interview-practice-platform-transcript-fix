import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // First try to authenticate with JWT token via getServerSession
    const session = await getServerSession(authOptions)
    let userId = session?.user?.id
    
    // If no session found, check for database session token in cookies
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')

    const recordings = await prisma.recording.findMany({
      where: {
        session: {
          OR: [
            { intervieweeId: userId },
            { interviewerId: userId }
          ]
        }
      },
      include: {
        session: {
          include: {
            interviewee: {
              select: { name: true }
            },
            interviewer: {
              select: { name: true }
            },
            jd: {
              select: { title: true }
            }
          }
        }
      },
      orderBy: {
        session: {
          createdAt: 'desc'
        }
      },
      take: limit
    })

    const result = recordings.map(recording => ({
      id: recording.id,
      url: recording.url,
      durationSec: recording.durationSec,
      consent: recording.consent,
      session: {
        id: recording.session.id,
        type: recording.session.type,
        startedAt: recording.session.startedAt,
        endedAt: recording.session.endedAt,
        interviewee: recording.session.interviewee,
        interviewer: recording.session.interviewer,
        jd: recording.session.jd
      }
    }))

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // First try to authenticate with JWT token via getServerSession
    const session = await getServerSession(authOptions)
    let userId = session?.user?.id
    
    // If no session found, check for database session token in cookies
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, url, durationSec, consent } = body

    if (!sessionId || !url) {
      return NextResponse.json(
        { error: 'sessionId and url are required' },
        { status: 400 }
      )
    }

    // Verify the session belongs to the authenticated user
    const interviewSession = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { 
        intervieweeId: true, 
        interviewerId: true 
      }
    })

    if (!interviewSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    const isAuthorized = interviewSession.intervieweeId === userId || 
                        interviewSession.interviewerId === userId

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Not authorized to create recording for this session' },
        { status: 403 }
      )
    }

    // Create or update the recording
    const recording = await prisma.recording.upsert({
      where: { sessionId },
      update: {
        url,
        durationSec: durationSec || 0,
        consent: consent !== undefined ? consent : true
      },
      create: {
        sessionId,
        url,
        durationSec: durationSec || 0,
        consent: consent !== undefined ? consent : true
      }
    })

    return NextResponse.json(recording)
  } catch (error) {
    console.error('Recording creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
