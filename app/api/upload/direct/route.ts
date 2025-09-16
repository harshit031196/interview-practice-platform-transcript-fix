import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { Storage } from '@google-cloud/storage';
import { prisma } from '@/lib/prisma';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

// Ensure this route runs on Node.js runtime (GCS SDK is not compatible with Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Allow longer processing time for large uploads
export const maxDuration = 300; // seconds

// Initialize Google Cloud Storage via Application Default Credentials
const storage = new Storage();

export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/upload/direct - Checking authentication');
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions);
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id;
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check session token (support secure and non-secure cookie names)
      let sessionToken = request.cookies.get('__Secure-next-auth.session-token')?.value
        || request.cookies.get('next-auth.session-token')?.value;
      
      // If not found, check for database-specific session token (for hybrid fallback)
      if (!sessionToken) {
        sessionToken = request.cookies.get('next-auth.database-session')?.value;
        if (sessionToken) {
          console.log('[API] Found database-specific session token');
        }
      }
      
      if (sessionToken) {
        console.log('[API] Checking database session with token');
        try {
          const dbSession = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          });
          
          if (dbSession && dbSession.expires > new Date()) {
            userId = dbSession.userId;
            console.log('[API] Authenticated via database session for user ID:', userId);
          } else {
            console.log('[API] Database session invalid or expired');
          }
        } catch (error) {
          console.error('[API] Error checking database session:', error);
        }
      }
    }
    
    if (!userId) {
      console.error('[API] Unauthorized upload attempt - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for upload: ${userId}`);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!file || !sessionId) {
      return NextResponse.json(
        { error: 'Missing file or sessionId' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Only video files are allowed' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `interviews/${userId}/${sessionId}/${timestamp}_${file.name}`;

    // Get bucket
    const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME 
      || process.env.NEXT_PUBLIC_GCS_BUCKET_NAME 
      || 'wingman-interview-videos-harshit-2024';
    if (!bucketName) {
      return NextResponse.json(
        { error: 'Storage not configured' },
        { status: 500 }
      );
    }

    console.log('[API] Using GCS bucket:', bucketName);
    const bucket = storage.bucket(bucketName);
    const fileObj = bucket.file(filename);

    // Prefer streaming + resumable upload for large files to avoid buffering the entire file in memory
    console.log('Upload details (pre-stream):', {
      filename,
      fileSize: file.size,
      fileType: file.type,
      bucketName,
      userId,
      sessionId
    });

    // Convert the web ReadableStream to a Node.js Readable stream without loading into memory
    const nodeStream = Readable.fromWeb(file.stream() as any);

    // Create a GCS write stream (resumable) with metadata
    const gcsWriteStream = fileObj.createWriteStream({
      resumable: true,
      contentType: file.type,
      metadata: {
        contentType: file.type,
        metadata: {
          sessionId: sessionId,
          userId: userId,
          uploadedAt: new Date().toISOString(),
        },
      },
      // validation left default; resumable uploads provide integrity guarantees
    });

    // Attach error handlers for better diagnostics
    gcsWriteStream.on('error', (err) => {
      console.error('[GCS] Write stream error:', err);
    });

    // Stream the request body directly into GCS
    await pipeline(nodeStream, gcsWriteStream);

    // Generate video URI for analysis
    const videoUri = `gs://${bucketName}/${filename}`;
    
    console.log('File uploaded successfully to:', videoUri);

    // Store or update recording in database
    try {
      // Check if a recording already exists for this session
      const existingRecording = await prisma.recording.findUnique({
        where: { sessionId: sessionId }
      });
      
      if (existingRecording) {
        // Update the existing recording with the new URL
        await prisma.recording.update({
          where: { id: existingRecording.id },
          data: { url: videoUri }
        });
        console.log('Updated existing recording entry in database');
      } else {
        // Create a new recording if none exists
        await prisma.recording.create({
          data: {
            sessionId: sessionId,
            url: videoUri,
            durationSec: 0, // Will be updated after analysis
            consent: true, // Assuming consent was given during recording
          }
        });
        console.log('New recording entry created in database');
      }
    } catch (dbError) {
      console.error('Failed to create/update recording entry:', dbError);
      // Don't fail the upload if database entry fails
    }

    return NextResponse.json({
      success: true,
      filename: filename,
      videoUri: videoUri,
      size: file.size,
      contentType: file.type,
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Upload failed';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
