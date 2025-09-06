import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const consentSchema = z.object({
  sessionId: z.string(),
  consent: z.boolean(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, consent } = consentSchema.parse(body)

    // Verify session belongs to user
    const sessionRecord = await prisma.interviewSession.findUnique({
      where: {
        id: sessionId,
        OR: [
          { intervieweeId: session.user.id },
          { interviewerId: session.user.id }
        ]
      }
    })

    if (!sessionRecord) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Update or create recording consent
    await prisma.recording.upsert({
      where: { sessionId },
      update: { consent },
      create: {
        sessionId,
        url: `https://example.com/recordings/${sessionId}.mp4`,
        durationSec: 0,
        consent
      }
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
