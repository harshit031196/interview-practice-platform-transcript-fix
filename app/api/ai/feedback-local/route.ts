import { NextResponse } from 'next/server'

// Deprecated endpoint stub to clear IDE/TS problems.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ error: 'This endpoint is deprecated.' }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ error: 'This endpoint is deprecated.' }, { status: 410 })
}
