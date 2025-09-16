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

    const body = await request.json()
    const currentRole = String(body.currentRole || '').trim()
    const yearsExp = Number(body.yearsExp)
    const industry = String(body.industry || '').trim()
    const skills = body.skills ?? []
    const targetRoles = Array.isArray(body.targetRoles) ? body.targetRoles.map((r: any) => String(r)) : []

    if (!currentRole || !industry || !Number.isFinite(yearsExp)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Ensure role is set to INTERVIEWEE
    await prisma.user.update({ where: { id: user.id }, data: { role: 'INTERVIEWEE' } })

    // Upsert interviewee profile
    await prisma.intervieweeProfile.upsert({
      where: { userId: user.id },
      update: {
        currentRole,
        yearsExp: Math.max(0, Math.floor(yearsExp)),
        industry,
        skills,
        targetRoles,
      },
      create: {
        userId: user.id,
        currentRole,
        yearsExp: Math.max(0, Math.floor(yearsExp)),
        industry,
        skills,
        targetRoles,
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Create interviewee profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
