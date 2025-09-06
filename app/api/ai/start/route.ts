import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const startAISessionSchema = z.object({
  jdId: z.string().optional(),
  interviewType: z.string(),
  difficulty: z.string(), 
  duration: z.number().min(5).max(60), // minutes
  isConversational: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/ai/start - Checking authentication')
    
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
      console.error('[API] Unauthorized AI start request - no valid session')
      return NextResponse.json({ error: 'Unauthorized - please sign in' }, { status: 401 })
    }
    
    console.log(`[API] User authenticated for AI start: ${userId}`)

    const body = await request.json()
    console.log('Request body:', body)
    
    const { jdId, interviewType, difficulty, duration, isConversational } = startAISessionSchema.parse(body)
    console.log('Parsed data:', { jdId, interviewType, difficulty, duration, isConversational })

    // Create session in database
    const interviewSession = await prisma.interviewSession.create({
      data: {
        type: 'AI',
        status: 'SCHEDULED',
        intervieweeId: userId,
        jdId: jdId || null,
        interviewType,
        difficulty,
        duration,
        isConversational,
        startedAt: new Date()
      }
    })

    console.log('Session created in database:', interviewSession.id)
    
    const sessionData = {
      id: interviewSession.id,
      type: 'AI_PRACTICE',
      status: 'SCHEDULED',
      intervieweeId: userId,
      jdId,
      interviewType,
      difficulty,
      duration,
      isConversational,
      startedAt: interviewSession.startedAt?.toISOString() || new Date().toISOString()
    }

    return NextResponse.json({ sessionId: interviewSession.id, sessionData })
  } catch (error) {
    console.error('[API] Session creation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message || 'Unknown error' },
      { status: 500 }
    )
  }
}
