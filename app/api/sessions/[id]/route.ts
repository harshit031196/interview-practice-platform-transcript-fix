import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessionRecord = await prisma.interviewSession.findUnique({
      where: {
        id: params.id,
        OR: [
          { intervieweeId: session.user.id },
          { interviewerId: session.user.id }
        ]
      },
      include: {
        interviewee: {
          select: { id: true, name: true, email: true }
        },
        interviewer: {
          select: { id: true, name: true, email: true }
        },
        jd: {
          select: { id: true, title: true, keywords: true }
        },
        booking: true
      }
    })

    if (!sessionRecord) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: sessionRecord.id,
      type: sessionRecord.type,
      status: sessionRecord.status,
      startedAt: sessionRecord.startedAt,
      endedAt: sessionRecord.endedAt,
      interviewee: sessionRecord.interviewee,
      interviewer: sessionRecord.interviewer,
      jd: sessionRecord.jd,
      booking: sessionRecord.booking
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
