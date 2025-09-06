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

    const report = await prisma.report.findUnique({
      where: { id: params.id },
      include: {
        session: {
          include: {
            interviewee: {
              select: { id: true, name: true }
            },
            interviewer: {
              select: { id: true, name: true }
            },
            jd: {
              select: { title: true, keywords: true }
            },
            transcriptItems: {
              orderBy: { t: 'asc' }
            }
          }
        }
      }
    })

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    // Check if user has access to this report
    const hasAccess = report.session.intervieweeId === session.user.id || 
                     report.session.interviewerId === session.user.id

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      id: report.id,
      overall: report.overall,
      jdCoverage: report.jdCoverage,
      strengths: report.strengths,
      improvements: report.improvements,
      actions: report.actions,
      charts: report.charts,
      createdAt: report.createdAt,
      session: {
        id: report.session.id,
        type: report.session.type,
        startedAt: report.session.startedAt,
        endedAt: report.session.endedAt,
        interviewee: report.session.interviewee,
        interviewer: report.session.interviewer,
        jd: report.session.jd
      },
      transcript: report.session.transcriptItems.map(item => ({
        id: item.id,
        t: item.t,
        speaker: item.speaker,
        text: item.text,
        labels: item.labels
      }))
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
