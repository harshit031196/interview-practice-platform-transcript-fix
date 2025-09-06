import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const finishSchema = z.object({
  sessionId: z.string(),
})

export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/ai/finish - Checking authentication')
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions)
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value
      
      // If not found, check for database-specific session token (for hybrid fallback)
      if (!sessionToken) {
        sessionToken = request.cookies.get('next-auth.database-session')?.value
        if (sessionToken) {
          console.log('[API] Found database-specific session token')
        }
      }
      
      if (sessionToken) {
        console.log('[API] Checking database session with token')
        try {
          const dbSession = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          })
          
          if (dbSession && dbSession.expires > new Date()) {
            userId = dbSession.userId
            console.log('[API] Authenticated via database session for user ID:', userId)
          } else {
            console.log('[API] Database session invalid or expired')
          }
        } catch (error) {
          console.error('[API] Error checking database session:', error)
        }
      }
    }
    
    if (!userId) {
      console.error('[API] Unauthorized AI finish request - no valid session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log(`[API] User authenticated for AI finish: ${userId}`)

    const body = await request.json()
    const { sessionId } = finishSchema.parse(body)

    // Verify session belongs to user
    const sessionRecord = await prisma.interviewSession.findUnique({
      where: {
        id: sessionId,
        intervieweeId: userId,
        status: 'RUNNING'
      },
      include: {
        transcriptItems: true,
        jd: true
      }
    })

    if (!sessionRecord) {
      return NextResponse.json(
        { error: 'Session not found or not running' },
        { status: 404 }
      )
    }

    // Update session status
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date()
      }
    })

    // Generate report (stubbed with deterministic data)
    const transcriptLength = sessionRecord.transcriptItems.length
    const hasFillers = sessionRecord.transcriptItems.some(item => 
      item.labels.includes('filler')
    )
    
    // Simple scoring algorithm
    const baseScore = 70
    const fillerPenalty = hasFillers ? -10 : 0
    const lengthBonus = Math.min(transcriptLength * 2, 20)
    const overall = Math.max(0, Math.min(100, baseScore + fillerPenalty + lengthBonus))

    const report = await prisma.report.create({
      data: {
        sessionId,
        overall,
        jdCoverage: overall > 75 ? 'HIGH' : overall > 50 ? 'MEDIUM' : 'LOW',
        strengths: [
          'Clear communication style',
          'Good problem-solving approach',
          'Relevant experience mentioned'
        ],
        improvements: [
          'Reduce filler words',
          'Provide more specific examples',
          'Better time management'
        ],
        actions: [
          { label: 'Practice STAR method', url: '/library/star-method', type: 'exercise' },
          { label: 'Watch: Communication Tips', url: '/library/communication', type: 'video' },
          { label: 'Read: Interview Best Practices', url: '/library/best-practices', type: 'article' }
        ],
        charts: {
          radar: {
            communication: Math.min(100, overall + Math.random() * 20 - 10),
            problemSolving: Math.min(100, overall + Math.random() * 20 - 10),
            confidence: Math.min(100, overall + Math.random() * 20 - 10),
            jdRelevance: Math.min(100, overall + Math.random() * 20 - 10),
            technicalDepth: Math.min(100, overall + Math.random() * 20 - 10),
            leadership: Math.min(100, overall + Math.random() * 20 - 10)
          },
          pace: sessionRecord.transcriptItems.map((item, index) => ({
            time: item.t,
            wpm: 120 + Math.sin(index * 0.1) * 20,
            confidence: 0.7 + Math.random() * 0.3
          })),
          sentiment: {
            positive: 60 + Math.random() * 20,
            neutral: 20 + Math.random() * 20,
            negative: 5 + Math.random() * 15
          }
        }
      }
    })

    // Update readiness score
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { intervieweeProfile: true }
    })

    if (user?.intervieweeProfile) {
      const newReadinessScore = Math.min(100, 
        Math.max(0, user.intervieweeProfile.readinessScore + (overall > 70 ? 2 : -1))
      )
      
      await prisma.intervieweeProfile.update({
        where: { userId: userId },
        data: { readinessScore: newReadinessScore }
      })
    }

    return NextResponse.json({ reportId: report.id })
  } catch (error) {
    console.error('[API] AI finish error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
