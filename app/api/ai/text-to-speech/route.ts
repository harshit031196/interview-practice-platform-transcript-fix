import { NextRequest, NextResponse } from 'next/server';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const textToSpeechClient = new TextToSpeechClient();

const textSchema = z.object({
  text: z.string().min(1, 'Text is required.'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = textSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { text } = parsed.data;

    const ttsRequest = {
      input: { text },
      voice: {
        languageCode: 'en-US',
        name: 'en-US-Wavenet-A',
        ssmlGender: 'FEMALE' as const,
      },
      audioConfig: { audioEncoding: 'MP3' as const },
    };

    const [response] = await textToSpeechClient.synthesizeSpeech(ttsRequest);

    if (!response.audioContent) {
        return NextResponse.json(
            { error: 'Failed to synthesize speech' },
            { status: 500 }
        );
    }
    // Ensure body is a Web-compatible BodyInit (e.g., Uint8Array)
    let audioBytes: Uint8Array;
    if (typeof response.audioContent === 'string') {
      // Google TTS can return base64 string depending on transport; decode to bytes
      const buf = Buffer.from(response.audioContent, 'base64');
      audioBytes = new Uint8Array(buf);
    } else if (response.audioContent instanceof Uint8Array) {
      audioBytes = response.audioContent as Uint8Array;
    } else {
      // Buffer case (Node.js)
      const buf = response.audioContent as unknown as Buffer;
      audioBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    }

    // Convert to a concrete ArrayBuffer to satisfy BodyInit typing
    const outBuffer = new ArrayBuffer(audioBytes.byteLength);
    new Uint8Array(outBuffer).set(audioBytes);

    return new NextResponse(outBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error in text-to-speech synthesis:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to process text-to-speech request', details: errorMessage },
      { status: 500 }
    );
  }
}
