'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Video, VideoOff, Square, Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface VideoRecorderProps {
  sessionId: string
  onUploadComplete?: (filename: string) => void
  onUploadError?: (error: string) => void
}

export function VideoRecorder({ sessionId, onUploadComplete, onUploadError }: VideoRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })

      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        // Reduce bitrates to keep file sizes manageable for >3 minute videos
        videoBitsPerSecond: 1_200_000, // ~1.2 Mbps
        audioBitsPerSecond: 64_000     // 64 Kbps
      })

      const chunks: BlobPart[] = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        setRecordedBlob(blob)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        
        if (videoRef.current) {
          videoRef.current.srcObject = null
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
      setRecordingDuration(0)

      // Start duration timer
      intervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

    } catch (error) {
      console.error('Error starting recording:', error)
      onUploadError?.('Failed to access camera/microphone. Please check permissions.')
    }
  }, [onUploadError])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRecording])

  const uploadVideo = useCallback(async () => {
    if (!recordedBlob || !sessionId) return

    setIsUploading(true)
    setUploadStatus('uploading')

    try {
      const fileName = `interview_${sessionId}_${Date.now()}.webm`
      const contentType = recordedBlob.type || 'video/webm'
      const SIZE_THRESHOLD = 20 * 1024 * 1024 // 20 MB safety threshold (Cloud Run ~32MB limit)

      if (recordedBlob.size > SIZE_THRESHOLD) {
        // Large file: use V4 signed PUT URL for direct-to-GCS upload from browser
        const createRes = await fetch('/api/upload/signed-put', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId, filename: fileName, contentType })
        })
        if (!createRes.ok) {
          const errText = await createRes.text()
          throw new Error(`Failed to init signed upload: ${errText}`)
        }
        const { signedUrl, filename, gcsUri } = await createRes.json()

        // Upload bytes directly to GCS using the signed URL
        const putRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: recordedBlob
        })
        if (!putRes.ok) {
          const errText = await putRes.text()
          throw new Error(`GCS upload failed: ${putRes.status} ${errText}`)
        }

        // Confirm upload and persist DB record
        await fetch('/api/upload/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId, filename, gcsUri })
        }).catch(e => console.warn('Confirm upload failed (non-fatal):', e))

        setUploadStatus('success')
        onUploadComplete?.(filename)
      } else {
        // Small/medium file: use existing direct upload path via API
        const formData = new FormData()
        formData.append('file', recordedBlob, fileName)
        formData.append('sessionId', sessionId)

        const uploadResponse = await fetch('/api/upload/direct', {
          method: 'POST',
          body: formData,
          // Ensure auth cookies (NextAuth) are sent so server can authenticate the request
          credentials: 'include',
          headers: { 'X-Auth-Method': 'hybrid-session' }
        })

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json()
          throw new Error(error.error || 'Failed to upload video')
        }

        const result = await uploadResponse.json()
        setUploadStatus('success')
        onUploadComplete?.(result.filename)
      }

    } catch (error) {
      console.error('Upload error:', error)
      setUploadStatus('error')
      onUploadError?.(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }, [recordedBlob, sessionId, onUploadComplete, onUploadError])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const resetRecording = () => {
    setRecordedBlob(null)
    setUploadStatus('idle')
    setRecordingDuration(0)
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Video Preview */}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            
            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-sm font-medium">REC {formatDuration(recordingDuration)}</span>
              </div>
            )}

            {recordedBlob && !isRecording && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center text-white">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-lg font-medium">Recording Complete</p>
                  <p className="text-sm opacity-75">Duration: {formatDuration(recordingDuration)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            {!isRecording && !recordedBlob && (
              <Button
                onClick={startRecording}
                className="flex items-center gap-2"
                size="lg"
              >
                <Video className="w-5 h-5" />
                Start Recording
              </Button>
            )}

            {isRecording && (
              <Button
                onClick={stopRecording}
                variant="destructive"
                className="flex items-center gap-2"
                size="lg"
              >
                <Square className="w-5 h-5" />
                Stop Recording
              </Button>
            )}

            {recordedBlob && !isRecording && (
              <div className="flex gap-2">
                <Button
                  onClick={resetRecording}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <VideoOff className="w-4 h-4" />
                  Record Again
                </Button>
                
                <Button
                  onClick={uploadVideo}
                  disabled={isUploading}
                  className="flex items-center gap-2"
                >
                  {uploadStatus === 'uploading' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : uploadStatus === 'success' ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Uploaded
                    </>
                  ) : uploadStatus === 'error' ? (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      Retry Upload
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Video
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Status Messages */}
          {uploadStatus === 'success' && (
            <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">
                ✅ Video uploaded successfully! Analysis will begin shortly.
              </p>
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className="text-center p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">
                ❌ Upload failed. Please try again.
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="text-center text-sm text-gray-600 space-y-1">
            <p>📹 Record your interview response</p>
            <p>🤖 AI will analyze your performance automatically</p>
            <p>📊 Get detailed feedback on speaking pace, clarity, and content</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
