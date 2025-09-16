import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { Storage } from '@google-cloud/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const storage = new Storage()

export async function POST(request: NextRequest) {
  try {
    // Authenticate (JWT, NextAuth session, or DB session via NextAuth)
    const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET })
    const session = await getServerSession(authOptions)

    let userId = token?.sub || session?.user?.id

    if (!userId) {
      // Hybrid session cookie (database session) fallback
      let sessionToken = request.cookies.get('__Secure-next-auth.session-token')?.value
        || request.cookies.get('next-auth.session-token')?.value
        || request.cookies.get('next-auth.database-session')?.value

      if (sessionToken) {
        // We don't import prisma here to keep this route lightweight; rely on JWT/session in normal flow
        // If needed, switch to a shared auth util to resolve DB session.
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId, filename, contentType } = await request.json()

    if (!sessionId || !filename || !contentType) {
      return NextResponse.json({ error: 'Missing required fields: sessionId, filename, contentType' }, { status: 400 })
    }

    if (!contentType.startsWith('video/')) {
      return NextResponse.json({ error: 'Only video content types are allowed' }, { status: 400 })
    }

    const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME 
      || process.env.NEXT_PUBLIC_GCS_BUCKET_NAME 
      || 'wingman-interview-videos-harshit-2024'

    if (!bucketName) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
    }

    const bucket = storage.bucket(bucketName)

    // Build a unique, namespaced object path
    const uniqueName = `interviews/${userId}/${sessionId}/${Date.now()}_${filename}`
    const fileObj = bucket.file(uniqueName)

    // Create a resumable upload URL; origin helps with CORS
    const origin = request.headers.get('origin') || undefined
    const resp = await fileObj.createResumableUpload({
      origin,
      metadata: { contentType },
    })
    const uploadUrl = Array.isArray(resp) ? resp[0] : (resp as any)

    const gcsUri = `gs://${bucketName}/${uniqueName}`

    return NextResponse.json({
      uploadUrl,
      filename: uniqueName,
      gcsUri,
      contentType,
    })
  } catch (error) {
    console.error('[API] /api/upload/resumable error:', error)
    return NextResponse.json({ error: 'Failed to create resumable upload' }, { status: 500 })
  }
}
