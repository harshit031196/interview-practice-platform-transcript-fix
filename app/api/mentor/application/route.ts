import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { bio, yearsExp, currentCompany, currentRole, linkedinUrl, expertiseTags } = await request.json()

    // Validate required fields
    if (!bio || !yearsExp || !currentCompany || !currentRole || !expertiseTags || expertiseTags.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Update user's role to INTERVIEWER and LinkedIn URL if provided
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        role: 'INTERVIEWER',
        linkedinUrl: linkedinUrl || user.linkedinUrl
      }
    })

    // Create or update interviewer profile
    const interviewerProfile = await prisma.interviewerProfile.upsert({
      where: { userId: user.id },
      update: {
        bio,
        yearsExp,
        expertiseTags,
        verificationStatus: 'PENDING'
      },
      create: {
        userId: user.id,
        bio,
        yearsExp,
        expertiseTags,
        verificationStatus: 'PENDING',
        verified: false
      }
    })

    return NextResponse.json({ 
      success: true, 
      applicationId: interviewerProfile.id,
      status: interviewerProfile.verificationStatus 
    })
  } catch (error) {
    console.error('Error submitting mentor application:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
