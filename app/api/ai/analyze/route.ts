import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mock AI analysis function
async function performAIAnalysis(videoPath: string, sessionId: string) {
  // Simulate AI processing time
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Mock analysis results
  const mockAnalysis = {
    transcript: "The candidate provided a comprehensive answer discussing their experience with React and Node.js development. They mentioned working on several full-stack projects and demonstrated good understanding of modern web development practices.",
    speaking_metrics: {
      speaking_rate: 145, // words per minute
      pause_count: 8,
      confidence: 0.87,
      duration: 180 // seconds
    },
    content_analysis: {
      clarity: 8,
      relevance: 9,
      depth: 7,
      examples: 8
    },
    communication_skills: {
      articulation: 8,
      confidence: 7,
      engagement: 9
    },
    strengths: [
      "Clear and articulate communication",
      "Relevant technical examples",
      "Good understanding of the subject matter",
      "Confident delivery"
    ],
    areas_for_improvement: [
      "Could provide more specific metrics or results",
      "Consider structuring responses with clear intro-body-conclusion",
      "Add more details about challenges faced and overcome"
    ],
    overall_feedback: "The candidate demonstrated strong technical knowledge and communication skills. The response was well-structured and relevant to the question. To improve further, consider providing more specific examples with quantifiable results and impact.",
    overall_score: 78,
    detailed_scores: {
      technical_knowledge: 85,
      communication: 75,
      problem_solving: 80,
      cultural_fit: 72
    },
    recommendations: [
      "Practice the STAR method (Situation, Task, Action, Result) for behavioral questions",
      "Prepare specific metrics and achievements to quantify your impact",
      "Work on reducing filler words and pauses for smoother delivery"
    ]
  };
  
  return mockAnalysis;
}

export async function POST(request: NextRequest) {
  let sessionId: string | undefined;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId: requestSessionId, videoPath } = await request.json();
    sessionId = requestSessionId;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Verify the session belongs to the user
    const interviewSession = await (prisma as any).interviewSession.findFirst({
      where: {
        id: sessionId,
        intervieweeId: session.user.id
      }
    });

    if (!interviewSession) {
      return NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404 }
      );
    }

    // Perform AI analysis
    const analysisResult = await performAIAnalysis(videoPath || '', sessionId);

    // Store feedback in database using the expected format
    const feedback = await (prisma as any).interviewFeedback.create({
      data: {
        sessionId: sessionId,
        transcript: analysisResult.transcript,
        speakingPaceWpm: analysisResult.speaking_metrics.speaking_rate,
        fillerWordCount: analysisResult.speaking_metrics.pause_count,
        clarityScore: analysisResult.content_analysis.clarity * 10,
        emotionTimeline: JSON.stringify([
          {
            timestamp: "0:00",
            emotion: "confident",
            confidence: analysisResult.speaking_metrics.confidence
          }
        ]),
        contentFeedback: JSON.stringify({
          summary: analysisResult.overall_feedback,
          actionable_feedback: analysisResult.areas_for_improvement
        }),
        processingMetadata: JSON.stringify({
          overall_score: analysisResult.overall_score,
          detailed_scores: analysisResult.detailed_scores,
          strengths: analysisResult.strengths,
          recommendations: analysisResult.recommendations
        }),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Update interview session status
    await (prisma as any).interviewSession.update({
      where: { id: sessionId },
      data: { 
        status: 'COMPLETED',
        endedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      sessionId,
      feedbackId: feedback.id,
      analysis: analysisResult
    });

  } catch (error) {
    console.error('AI analysis error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      sessionId: sessionId || 'unknown'
    });
    return NextResponse.json(
      { 
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
