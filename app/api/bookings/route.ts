import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const createBookingSchema = z.object({
  interviewerId: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  notes: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { interviewerId, start, end, notes } = createBookingSchema.parse(body)

    // Check if interviewer exists and is available
    const interviewer = await prisma.user.findUnique({
      where: {
        id: interviewerId,
        role: { in: ['INTERVIEWER', 'BOTH'] }
      },
      include: {
        interviewerProfile: {
          include: {
            availabilitySlots: {
              where: {
                start: { lte: new Date(start) },
                end: { gte: new Date(end) }
              }
            }
          }
        }
      }
    })

    if (!interviewer || !interviewer.interviewerProfile?.availabilitySlots.length) {
      return NextResponse.json(
        { error: 'Interviewer not available at this time' },
        { status: 400 }
      )
    }

    // Create session first
    const session_record = await prisma.interviewSession.create({
      data: {
        type: 'HUMAN',
        status: 'SCHEDULED',
        intervieweeId: session.user.id,
        interviewerId,
        startedAt: new Date(start)
      }
    })

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        interviewerId,
        intervieweeId: session.user.id,
        sessionId: session_record.id,
        start: new Date(start),
        end: new Date(end),
        notes: notes || '',
        status: 'PENDING'
      }
    })

    return NextResponse.json({
      bookingId: booking.id,
      sessionId: session_record.id
    })
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
