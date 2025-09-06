import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface FrameData {
  timestamp: number;
  success: boolean;
  emotions: {
    joyLikelihood: number;
    sorrowLikelihood: number;
    angerLikelihood: number;
    surpriseLikelihood: number;
  };
  eyeContact: boolean;
  confidence: number;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { sessionId, frames } = await req.json();

    if (!sessionId || !Array.isArray(frames)) {
      return NextResponse.json({ success: false, error: 'Missing sessionId or frames data' }, { status: 400 });
    }

    const framesToCreate = frames.map((frame: FrameData) => ({
      sessionId: sessionId,
      timestamp: new Date(frame.timestamp),
      joyLikelihood: frame.emotions.joyLikelihood,
      sorrowLikelihood: frame.emotions.sorrowLikelihood,
      angerLikelihood: frame.emotions.angerLikelihood,
      surpriseLikelihood: frame.emotions.surpriseLikelihood,
      eyeContact: frame.eyeContact,
      confidence: frame.confidence,
    }));

        await (prisma as any).visionAnalysisFrame.createMany({
      data: framesToCreate,
    });

    return NextResponse.json({ success: true, message: 'Frames saved successfully' });
  } catch (error) {
    console.error('Error saving vision analysis frames:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
