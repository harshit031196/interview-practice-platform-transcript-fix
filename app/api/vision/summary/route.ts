import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId') || ''
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    const frames = await prisma.visionAnalysisFrame.findMany({ where: { sessionId } })
    if (!frames || frames.length === 0) return NextResponse.json({ sessionId, count: 0, eyeContactScore10: 0, smileScore10: 0 })

    const eyeTrue = frames.reduce((acc, f) => acc + (f.eyeContact ? 1 : 0), 0)
    const eyePct = (eyeTrue / frames.length) * 100
    const eyeContactScore10 = Math.round((eyePct / 100) * 10)

    // joyLikelihood is typically 0-4; map to 0-10
    const avgJoy = frames.reduce((acc, f) => acc + (typeof f.joyLikelihood === 'number' ? f.joyLikelihood : 0), 0) / frames.length
    const smileScore10 = Math.round((avgJoy / 4) * 10)

    return NextResponse.json({ sessionId, count: frames.length, eyeContactScore10, smileScore10 })
  } catch (e) {
    console.error('[vision/summary] error:', (e as any)?.message || String(e))
    return NextResponse.json({ error: 'Failed to summarize vision frames' }, { status: 500 })
  }
}
