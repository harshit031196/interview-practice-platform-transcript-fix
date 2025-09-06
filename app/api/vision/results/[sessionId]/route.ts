import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: { sessionId: string } }) {
  const { sessionId } = params;

  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'Session ID is required' }, { status: 400 });
  }

  try {
        const visionFrames = await (prisma as any).visionAnalysisFrame.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });

    if (!visionFrames || visionFrames.length === 0) {
      return NextResponse.json({ success: false, error: 'No vision analysis data found for this session' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: visionFrames });
  } catch (error) {
    console.error(`Error fetching vision analysis frames for session ${sessionId}:`, error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
