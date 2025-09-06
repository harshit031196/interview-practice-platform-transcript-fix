import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    // Authenticate the request
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      console.error('No valid session found for video URI update');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse request body
    const body = await req.json();
    const { sessionId, videoUri } = body;
    
    if (!sessionId || !videoUri) {
      return NextResponse.json({ error: 'Missing required fields: sessionId or videoUri' }, { status: 400 });
    }
    
    console.log(`Updating interview session ${sessionId} with videoUri: ${videoUri}`);
    
    // Update the interview session with the videoUri
    // Store it in a custom field using Prisma's update
    const updatedSession = await prisma.interviewSession.update({
      where: {
        id: sessionId,
      },
      data: {
        // The schema doesn't have videoUri or videoUrl fields
        // We'll use the recording relation instead
        recording: {
          upsert: {
            create: {
              url: videoUri,
              durationSec: 0, // Default value, will be updated later
              consent: true
            },
            update: {
              url: videoUri
            }
          }
        },
        updatedAt: new Date(),
      },
    });
    
    if (!updatedSession) {
      return NextResponse.json({ error: 'Failed to update interview session' }, { status: 500 });
    }
    
    console.log(`Successfully updated interview session ${sessionId} with videoUri`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Video URI updated successfully',
      sessionId,
      videoUri
    });
  } catch (error) {
    console.error('Error updating video URI:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
