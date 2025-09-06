import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJobDescription } from '@/lib/jdParser'

const parseJDSchema = z.object({
  jdText: z.string().min(50, 'Job description must be at least 50 characters'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jdText } = parseJDSchema.parse(body)

    const { keywords, responsibilities } = parseJobDescription(jdText)

    return NextResponse.json({
      keywords,
      responsibilities
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
