import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
 
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      sessionId,
      transcript,
      analysis,
      jobRole,
      company,
      interviewType,
      isConversational = true
    } = body;

    console.log('Storing conversational interview session:', sessionId);

    // Store the interview session in database
    const interviewSession = await prisma.interviewSession.create({
      data: {
        id: sessionId,
        type: 'AI',
        intervieweeId: session.user.id,
        interviewType: interviewType || 'behavioral',
        difficulty: 'medium',
        duration: 15,
        status: 'COMPLETED',
        startedAt: new Date(),
        endedAt: new Date()
      }
    });

    // Store the analysis results in the report
    await prisma.report.create({
      data: {
        sessionId: sessionId,
        overall: analysis.overallScore || 70,
        jdCoverage: 'MEDIUM',
        strengths: analysis.strengths || [],
        improvements: analysis.improvementAreas || [],
        actions: {
          transcript,
          analysis,
          jobRole,
          company,
          interviewType,
          starMethodScore: analysis.starMethodAnalysis?.score || 0,
          communicationScore: Math.round(
            ((analysis.communicationSkills?.clarity?.score || 0) +
             (analysis.communicationSkills?.structure?.score || 0) +
             (analysis.communicationSkills?.conciseness?.score || 0)) / 3
          ),
          isConversational: true
        },
        charts: {
          starMethod: analysis.starMethodAnalysis || {},
          communication: analysis.communicationSkills || {},
          tips: analysis.interviewTips || []
        }
      }
    });

    console.log('Conversational interview session stored successfully');

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Session stored successfully'
    });

  } catch (error) {
    console.error('Error storing conversational interview session:', error);
    return NextResponse.json(
      { error: 'Failed to store session' },
      { status: 500 }
    );
  }
}
