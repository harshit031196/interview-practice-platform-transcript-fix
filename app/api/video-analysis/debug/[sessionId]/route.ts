import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Debug endpoint to view raw video analysis data
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    // Check authentication - support both session and API key
    const session = await getServerSession(authOptions);
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.API_SECRET_KEY;
    
    // Allow access if either valid session OR valid API key
    const isAuthenticated = session || (apiKey && expectedApiKey && apiKey === expectedApiKey);
    
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;

    // Try to find stored video analysis results
    const whereClause = session?.user?.id 
      ? { sessionId: sessionId, userId: session.user.id }
      : { sessionId: sessionId };
    
    const analysisResult = await prisma.videoAnalysis.findFirst({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!analysisResult) {
      return NextResponse.json({ 
        error: 'No video analysis found for this session' 
      }, { status: 404 });
    }

    // Parse the stored JSON results
    const analysisData = JSON.parse(analysisResult.results);
    
    // Return the raw data structure for debugging
    return NextResponse.json({
      raw: analysisData,
      parsedStructure: {
        hasResults: !!analysisData,
        topLevelKeys: Object.keys(analysisData),
        hasSpeechAnalysis: !!analysisData.speech_analysis,
        hasFacialAnalysis: !!analysisData.facial_analysis,
        hasConfidenceAnalysis: !!analysisData.confidence_analysis,
        hasOverallScore: !!analysisData.overall_score,
        rawAnnotationResults: analysisData.annotationResults ? {
          count: analysisData.annotationResults.length,
          types: analysisData.annotationResults.map((a: any) => Object.keys(a))
        } : null
      }
    });

  } catch (error) {
    console.error('Error fetching debug video analysis results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analysis results for debugging', details: String(error) },
      { status: 500 }
    );
  }
}
