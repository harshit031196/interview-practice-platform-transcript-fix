import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const interviewer = await prisma.user.findUnique({
      where: {
        id: params.id,
        role: { in: ['INTERVIEWER', 'BOTH'] }
      },
      include: {
        interviewerProfile: {
          include: {
            availabilitySlots: {
              where: {
                start: {
                  gte: new Date()
                }
              },
              orderBy: {
                start: 'asc'
              }
            }
          }
        }
      }
    })

    if (!interviewer || !interviewer.interviewerProfile) {
      return NextResponse.json(
        { error: 'Interviewer not found' },
        { status: 404 }
      )
    }

    const result = {
      id: interviewer.id,
      name: interviewer.name,
      bio: interviewer.interviewerProfile.bio,
      expertiseTags: interviewer.interviewerProfile.expertiseTags,
      yearsExp: interviewer.interviewerProfile.yearsExp,
      verified: interviewer.interviewerProfile.verified,
      rateCents: interviewer.interviewerProfile.rateCents,
      linkedinUrl: interviewer.linkedinUrl,
      availability: interviewer.interviewerProfile.availabilitySlots.map(slot => ({
        id: slot.id,
        start: slot.start,
        end: slot.end,
        isRecurring: slot.isRecurring
      }))
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
