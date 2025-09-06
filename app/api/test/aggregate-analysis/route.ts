import { NextRequest, NextResponse } from 'next/server';
import { aggregateAnalysisResults } from '@/lib/analysisAggregation';

// This is a test-only API endpoint for verifying the aggregation logic
export async function POST(req: NextRequest) {
  try {
    // Check API key for security
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      console.error('❌ [Test API] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the analyses from the request body
    const { analyses } = await req.json();
    
    if (!analyses || !Array.isArray(analyses)) {
      console.error('❌ [Test API] Invalid request: analyses must be an array');
      return NextResponse.json({ error: 'Invalid request: analyses must be an array' }, { status: 400 });
    }

    console.log(`🧪 [Test API] Testing aggregation with ${analyses.length} segments`);
    
    try {
      // Use the same aggregation function from UnifiedInterviewSession
      const aggregatedResults = aggregateAnalysisResults(analyses);
      
      console.log('✅ [Test API] Aggregation successful');
      return NextResponse.json(aggregatedResults);
    } catch (error) {
      console.error('❌ [Test API] Aggregation error:', error);
      return NextResponse.json({ 
        error: 'Aggregation error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, { status: 500 });
    }
  } catch (error) {
    console.error('❌ [Test API] Server error:', error);
    return NextResponse.json({ 
      error: 'Server error', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
