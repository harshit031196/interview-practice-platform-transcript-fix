import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ingestSchema = z.object({
  sessionId: z.string(),
  transcriptChunk: z.array(z.object({
    t: z.number(),
    text: z.string(),
  })),
  metrics: z.object({
    wpm: z.number(),
    confidence: z.number().min(0).max(1),
  }),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, transcriptChunk, metrics } = ingestSchema.parse(body)

    // Verify session belongs to user
    const sessionRecord = await prisma.interviewSession.findUnique({
      where: {
        id: sessionId,
        intervieweeId: session.user.id,
        status: 'RUNNING'
      }
    })

    if (!sessionRecord) {
      return NextResponse.json(
        { error: 'Session not found or not running' },
        { status: 404 }
      )
    }

    // Process transcript chunks and add labels
    const transcriptItems = transcriptChunk.map(chunk => {
      const labels: string[] = []
      
      // Simple heuristics for labeling
      const words = chunk.text.split(' ')
      const fillerWords = ['um', 'uh', 'like', 'you know', 'actually', 'basically']
      const hasFillers = fillerWords.some(filler => 
        chunk.text.toLowerCase().includes(filler)
      )
      
      if (hasFillers) labels.push('filler')
      if (words.length > 30) labels.push('verbose')
      if (words.length < 5) labels.push('brief')
      if (metrics.confidence > 0.8) labels.push('clear')
      
      return {
        sessionId,
        t: chunk.t,
        speaker: 'HUMAN' as const,
        text: chunk.text,
        labels
      }
    })

    // Save transcript items
    await prisma.transcriptItem.createMany({
      data: transcriptItems
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
