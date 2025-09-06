import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const dummyExperts = [
  {
    id: 'd-1',
    name: 'Sarah Chen',
    bio: 'Senior Product Manager at Google with 10+ years of experience in consumer tech. Passionate about mentoring aspiring PMs.',
    expertiseTags: ['Product Strategy', 'Consumer Tech', 'Agile', 'A/B Testing'],
    yearsExp: 12,
    verified: true,
    rateCents: 15000,
    nextSlots: [
      { start: new Date(Date.now() + 24 * 60 * 60 * 1000), end: new Date(Date.now() + (24 * 60 + 30) * 60 * 1000) },
      { start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), end: new Date(Date.now() + (2 * 24 * 60 + 30) * 60 * 1000) },
    ],
  },
  {
    id: 'd-2',
    name: 'Michael Rodriguez',
    bio: 'Engineering Lead at Meta, specializing in large-scale distributed systems and system design interviews.',
    expertiseTags: ['System Design', 'Scalability', 'Backend', 'Technical Leadership'],
    yearsExp: 15,
    verified: true,
    rateCents: 20000,
    nextSlots: [
      { start: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), end: new Date(Date.now() + (3 * 24 * 60 + 45) * 60 * 1000) },
    ],
  },
  {
    id: 'd-3',
    name: 'Emily White',
    bio: 'UX Research Lead at Airbnb. Expert in user-centered design, qualitative research, and product discovery.',
    expertiseTags: ['User Research', 'Product Design', 'Qualitative Analysis'],
    yearsExp: 8,
    verified: true,
    rateCents: 12000,
    nextSlots: [],
  },
    {
    id: 'd-4',
    name: 'David Lee',
    bio: 'Former Amazon Bar Raiser and current Engineering Manager at a fast-growing startup. Focus on behavioral and leadership principles.',
    expertiseTags: ['Behavioral Interviews', 'Leadership', 'Hiring Manager', 'FAANG'],
    yearsExp: 18,
    verified: true,
    rateCents: 18000,
    nextSlots: [
      { start: new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000), end: new Date(Date.now() + (1.5 * 24 * 60 + 30) * 60 * 1000) },
      { start: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), end: new Date(Date.now() + (4 * 24 * 60 + 30) * 60 * 1000) },
    ],
  },
];

const expertsQuerySchema = z.object({
  tags: z.string().optional(),
  industry: z.string().optional(),
  availabilityWindow: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    console.log('[API] GET /api/experts - Checking authentication')
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions)
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      const sessionToken = request.cookies.get('next-auth.session-token')?.value
      
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
    
    // Note: This endpoint allows public access, so we don't require authentication
    // But we log if a user is authenticated for analytics purposes
    if (userId) {
      console.log(`[API] User authenticated for experts listing: ${userId}`)
    } else {
      console.log('[API] Public access to experts listing')
    }
    
    const { searchParams } = new URL(request.url)
    const tags = searchParams.get('tags')
    const industry = searchParams.get('industry')
    const availabilityWindow = searchParams.get('availabilityWindow')

    // Build where clause
    const where: any = {
      role: { in: ['INTERVIEWER', 'BOTH'] },
      interviewerProfile: {
        verified: true
      }
    }

    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim())
      where.interviewerProfile.expertiseTags = {
        hasSome: tagArray
      }
    }

    // Get interviewers with their profiles and availability
    const interviewers = await prisma.user.findMany({
      where,
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
              },
              take: 3
            }
          }
        }
      }
    })

    let result = interviewers.map(interviewer => ({
      id: interviewer.id,
      name: interviewer.name,
      bio: interviewer.interviewerProfile?.bio,
      expertiseTags: interviewer.interviewerProfile?.expertiseTags || [],
      yearsExp: interviewer.interviewerProfile?.yearsExp,
      verified: interviewer.interviewerProfile?.verified,
      rateCents: interviewer.interviewerProfile?.rateCents,
      nextSlots: interviewer.interviewerProfile?.availabilitySlots.map(slot => ({
        start: slot.start,
        end: slot.end
      })) || []
    }))

    if (result.length === 0) {
      console.log('[API] No real experts found, returning dummy data.');
      result = dummyExperts;
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] Experts listing error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
