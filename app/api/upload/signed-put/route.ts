import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { Storage } from '@google-cloud/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const storage = new Storage()

export async function POST(request: NextRequest) {
  try {
    // Authenticate (JWT or NextAuth session)
    const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET })
    const session = await getServerSession(authOptions)

    let userId = token?.sub || session?.user?.id

    if (!userId) {
      // Hybrid DB session token fallback
      userId = undefined as any
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
    const uniqueName = `interviews/${userId || 'anon'}/${sessionId}/${Date.now()}_${filename}`
    const fileObj = bucket.file(uniqueName)

    const expires = Date.now() + 15 * 60 * 1000 // 15 minutes

    const [signedUrl] = await fileObj.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType,
    })

    const gcsUri = `gs://${bucketName}/${uniqueName}`

    return NextResponse.json({ signedUrl, filename: uniqueName, gcsUri, contentType, expires })
  } catch (error) {
    console.error('[API] /api/upload/signed-put error:', error)
    return NextResponse.json({ error: 'Failed to create signed PUT URL' }, { status: 500 })
  }
}
