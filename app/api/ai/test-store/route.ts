import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Mock analysis results
    const mockAnalysis = {
      transcript: "The candidate provided a comprehensive answer discussing their experience with React and Node.js development. They mentioned working on several full-stack projects and demonstrated good understanding of modern web development practices.",
      speaking_metrics: {
        speaking_rate: 145,
        pause_count: 8,
        confidence: 0.87,
        duration: 180
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

    // Store feedback in database using the expected format
    const feedback = await (prisma as any).interviewFeedback.create({
      data: {
        sessionId: sessionId,
        transcript: mockAnalysis.transcript,
        speakingPaceWpm: mockAnalysis.speaking_metrics.speaking_rate,
        fillerWordCount: mockAnalysis.speaking_metrics.pause_count,
        clarityScore: mockAnalysis.content_analysis.clarity * 10,
        emotionTimeline: JSON.stringify([
          {
            timestamp: "0:00",
            emotion: "confident",
            confidence: mockAnalysis.speaking_metrics.confidence
          }
        ]),
        contentFeedback: JSON.stringify({
          summary: mockAnalysis.overall_feedback,
          actionable_feedback: mockAnalysis.areas_for_improvement
        }),
        processingMetadata: JSON.stringify({
          overall_score: mockAnalysis.overall_score,
          detailed_scores: mockAnalysis.detailed_scores,
          strengths: mockAnalysis.strengths,
          recommendations: mockAnalysis.recommendations
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
      message: 'Mock analysis stored successfully'
    });

  } catch (error) {
    console.error('Test store error:', error);
    return NextResponse.json(
      { error: `Test store failed: ${error}` },
      { status: 500 }
    );
  }
}
