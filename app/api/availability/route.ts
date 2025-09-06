import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const availabilitySchema = z.object({
  slots: z.array(z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    recurring: z.boolean().optional(),
  })),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { slots } = availabilitySchema.parse(body)

    // Check if user is an interviewer
    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
        role: { in: ['INTERVIEWER', 'BOTH'] }
      },
      include: { interviewerProfile: true }
    })

    if (!user?.interviewerProfile) {
      return NextResponse.json(
        { error: 'User is not an interviewer' },
        { status: 403 }
      )
    }

    // Clear existing availability slots
    await prisma.availabilitySlot.deleteMany({
      where: { interviewerId: user.interviewerProfile.id }
    })

    // Create new availability slots
    const availabilitySlots = slots.map(slot => ({
      interviewerId: user.interviewerProfile!.id,
      start: new Date(slot.start),
      end: new Date(slot.end),
      isRecurring: slot.recurring || false
    }))

    await prisma.availabilitySlot.createMany({
      data: availabilitySlots
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
