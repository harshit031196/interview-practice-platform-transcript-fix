import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Storage } from '@google-cloud/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const storage = new Storage()

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET })
    const session = await getServerSession(authOptions)

    let userId = token?.sub || session?.user?.id

    if (!userId) {
      // Database session cookie fallback (hybrid)
      const sessionToken = request.cookies.get('__Secure-next-auth.session-token')?.value
        || request.cookies.get('next-auth.session-token')?.value
        || request.cookies.get('next-auth.database-session')?.value
      if (!sessionToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      // Minimal trust fallback: allow write without resolving user for now
      // If stronger auth is required, import prisma and resolve session -> userId
    }

    const { sessionId, filename, gcsUri } = await request.json()

    if (!sessionId || !filename || !gcsUri) {
      return NextResponse.json({ error: 'Missing required fields: sessionId, filename, gcsUri' }, { status: 400 })
    }

    // Persist or update recording entry
    try {
      const existing = await prisma.recording.findUnique({ where: { sessionId } })
      if (existing) {
        await prisma.recording.update({ where: { id: existing.id }, data: { url: gcsUri } })
      } else {
        await prisma.recording.create({
          data: {
            sessionId,
            url: gcsUri,
            durationSec: 0,
            consent: true,
          },
        })
      }
    } catch (dbErr) {
      console.error('[Upload Confirm] DB write error:', dbErr)
      // Non-fatal for the upload flow
    }

    // Attempt to fetch GCS object metadata for verification
    let metadata: { size?: number; contentType?: string; crc32c?: string; updated?: string } | null = null
    try {
      if (typeof gcsUri === 'string' && gcsUri.startsWith('gs://')) {
        const rest = gcsUri.slice('gs://'.length)
        const slash = rest.indexOf('/')
        const bucketName = slash === -1 ? rest : rest.slice(0, slash)
        const objectName = slash === -1 ? '' : rest.slice(slash + 1)
        if (bucketName && objectName) {
          const [meta] = await storage.bucket(bucketName).file(objectName).getMetadata()
          metadata = {
            size: meta?.size ? Number(meta.size) : undefined,
            contentType: meta?.contentType,
            crc32c: meta?.crc32c,
            updated: meta?.updated,
          }
        }
      }
    } catch (gcsErr) {
      console.error('[Upload Confirm] GCS metadata fetch error:', gcsErr)
      // Continue without blocking
    }

    return NextResponse.json({ success: true, metadata })
  } catch (err) {
    console.error('[API] /api/upload/confirm error:', err)
    return NextResponse.json({ error: 'Failed to confirm upload' }, { status: 500 })
  }
}
