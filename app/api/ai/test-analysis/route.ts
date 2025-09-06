import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Call our AI analysis endpoint
    const analysisResponse = await fetch(`http://localhost:3002/api/ai/analyze`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'next-auth.session-token=test-token'
      },
      body: JSON.stringify({
        sessionId,
        videoPath: 'test-video-path'
      })
    });

    if (!analysisResponse.ok) {
      throw new Error('Analysis failed');
    }

    const result = await analysisResponse.json();

    return NextResponse.json({
      success: true,
      message: 'AI analysis completed successfully',
      result
    });

  } catch (error) {
    console.error('Test analysis error:', error);
    return NextResponse.json(
      { error: 'Test analysis failed' },
      { status: 500 }
    );
  }
}
