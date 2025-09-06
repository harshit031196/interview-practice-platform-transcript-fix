import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        interviewerProfile: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.interviewerProfile) {
      return NextResponse.json({ error: 'No mentor application found' }, { status: 404 })
    }

    return NextResponse.json({
      id: user.interviewerProfile.id,
      status: user.interviewerProfile.verificationStatus,
      submittedAt: user.createdAt.toISOString(),
      reviewedAt: user.interviewerProfile.verified ? user.updatedAt.toISOString() : null,
      feedback: null // Add feedback field to schema if needed
    })
  } catch (error) {
    console.error('Error fetching mentor application status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
