'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VideoRecorder } from '@/components/VideoRecorder'
import UnifiedInterviewSession from '@/components/UnifiedInterviewSession'
import { WingmanHeader } from '@/components/WingmanHeader'
import { Brain, Clock, Mic, Upload, CheckCircle, ArrowRight } from 'lucide-react'

interface SessionData {
  id: string
  interviewType: string
  difficulty: string
  duration: number
  status: string
  isConversational?: boolean
  questions?: string[]
}

export default function AISessionPage({ params }: { params: { sessionId: string } }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState<'intro' | 'recording' | 'uploaded' | 'processing' | 'completed'>('intro')
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null)

  useEffect(() => {
    fetchSessionData()
  }, [params.sessionId])

  const fetchSessionData = async () => {
    try {
      const response = await fetch(`/api/ai/session/${params.sessionId}`)
      if (response.ok) {
        const data = await response.json()
        setSessionData(data)
      } else {
        router.push('/practice/ai')
      }
    } catch (error) {
      console.error('Error fetching session:', error)
      router.push('/practice/ai')
    } finally {
      setLoading(false)
    }
  }

  const handleSessionComplete = async (sessionResults: any) => {
    console.log('Session completed with results:', sessionResults)
    
    if (sessionResults.status === 'processing') {
      // Move to processing step - analysis is happening in background
      setCurrentStep('processing')
      
      // Poll for completion (similar to traditional flow)
      const checkAnalysis = async () => {
        try {
          // Check if conversational feedback is ready (numbers-only path)
          const fbRes = await fetch(`/api/interviews/${params.sessionId}/feedback`, { credentials: 'include' })
          if (fbRes.ok) {
            const payload = await fbRes.json()
            if (payload?.numbersMode || (payload?.normalized && typeof payload.normalized.overallScore10 === 'number')) {
              router.push(`/feedback/${params.sessionId}`)
              return
            }
          }

          // Also check if video analysis results are available
          const response = await fetch(`/api/video-analysis/results/${params.sessionId}`)
          if (response.ok) {
            router.push(`/feedback/${params.sessionId}`)
            return
          }
          
          // If not ready, check again in 5 seconds
          setTimeout(checkAnalysis, 5000)
        } catch (error) {
          console.error('Error checking analysis status:', error)
          // Still redirect to feedback after some time
          setTimeout(() => router.push(`/feedback/${params.sessionId}`), 30000)
        }
      }
      
      // Start checking after a short delay
      setTimeout(checkAnalysis, 3000)
      
    } else if (sessionResults.status === 'error') {
      console.error('Session completed with error:', sessionResults.error)
      // Redirect to feedback page even with errors
      router.push(`/feedback/${params.sessionId}`)
    } else {
      // Legacy handling - direct completion, redirect to feedback
      sessionStorage.setItem(`session_${params.sessionId}_results`, JSON.stringify(sessionResults))
      router.push(`/feedback/${params.sessionId}`)
    }
  }

  const handleUploadComplete = async (filename: string) => {
    setUploadedFilename(filename);
    setCurrentStep('processing');

    try {
      // This now correctly calls the video analysis API
      const fullGcsUri = `gs://${process.env.NEXT_PUBLIC_GCS_BUCKET_NAME}/${filename}`;
      console.log(`[Non-Conversational] Triggering analysis for full GCS URI: ${fullGcsUri}`);

      const response = await fetch('/api/video-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: params.sessionId,
          videoUri: fullGcsUri,
          analysisType: 'comprehensive',
        }),
      });

      if (response.ok) {
        console.log('Video analysis triggered successfully.');
        // The response from trigger is usually just an acknowledgement
        // Now, we start polling for results, similar to handleSessionComplete
        pollForAnalysisResults();
      } else {
        const error = await response.text();
        console.error('Failed to trigger video analysis:', response.status, error);
        alert(`Failed to start video analysis: ${response.status} - ${error}`);
        setCurrentStep('completed'); // Or an error state
      }
    } catch (error) {
      console.error('Error triggering video analysis:', error);
      setCurrentStep('completed'); // Or an error state
    }
  };

  const pollForAnalysisResults = () => {
    const checkAnalysis = async () => {
      try {
        const response = await fetch(`/api/video-analysis/results/${params.sessionId}`);
        if (response.ok) {
          router.push(`/feedback/${params.sessionId}`);
          return;
        }
        // If not ready, poll again
        setTimeout(checkAnalysis, 5000);
      } catch (error) {
        console.error('Error polling for analysis status:', error);
        // Optional: Stop polling after some attempts and show an error
        setTimeout(() => router.push(`/feedback/${params.sessionId}`), 30000); // Fallback redirect
      }
    };
    // Start polling
    setTimeout(checkAnalysis, 3000);
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error)
    alert(`Upload failed: ${error}`)
  }

  const handleViewResults = () => {
    router.push(`/feedback/${params.sessionId}`)
  }

  const handleBackToDashboard = () => {
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600">Session not found</p>
            <Button onClick={() => router.push('/practice/ai')} className="mt-4">
              Back to Practice
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title="AI Interview Session"
        subtitle={`${sessionData.interviewType} • ${sessionData.difficulty} • ${sessionData.duration} min`}
        showBackButton={true}
        backHref="/practice/ai"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${currentStep === 'intro' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'intro' ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                1
              </div>
              <span className="ml-2 font-medium">Introduction</span>
            </div>
            
            <div className={`flex items-center ${currentStep === 'recording' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'recording' ? 'bg-blue-600 text-white' : 
                ['uploaded', 'processing'].includes(currentStep) ? 'bg-green-600 text-white' : 'bg-gray-200'
              }`}>
                <Mic className="w-4 h-4" />
              </div>
              <span className="ml-2 font-medium">Record Response</span>
            </div>
            
            <div className={`flex items-center ${currentStep === 'uploaded' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'uploaded' ? 'bg-blue-600 text-white' :
                currentStep === 'processing' ? 'bg-green-600 text-white' : 'bg-gray-200'
              }`}>
                <Upload className="w-4 h-4" />
              </div>
              <span className="ml-2 font-medium">Upload & Analyze</span>
            </div>
            
            <div className={`flex items-center ${currentStep === 'processing' ? 'text-blue-600' : currentStep === 'completed' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'processing' ? 'bg-blue-600 text-white' : 
                currentStep === 'completed' ? 'bg-green-600 text-white' : 'bg-gray-200'
              }`}>
                {currentStep === 'completed' ? <CheckCircle className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
              </div>
              <span className="ml-2 font-medium">AI Analysis</span>
            </div>
          </div>
        </div>

        {/* Content based on current step */}
        {currentStep === 'intro' && !sessionData.isConversational && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-6 h-6" />
                Interview Question
              </CardTitle>
              <CardDescription>
                Take your time to think through your response. You'll have {sessionData.duration} minutes to record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded-r-lg">
                <h3 className="font-semibold text-lg mb-3">Sample Behavioral Question:</h3>
                <p className="text-gray-700 leading-relaxed">
                  "Tell me about a time when you had to work with a difficult team member. 
                  How did you handle the situation, and what was the outcome?"
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">💡 Tips for Success:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Use the STAR method (Situation, Task, Action, Result)</li>
                    <li>• Be specific with examples and metrics</li>
                    <li>• Speak clearly and at a steady pace</li>
                    <li>• Maintain good eye contact with the camera</li>
                  </ul>
                </div>
                
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">🎯 What We'll Analyze:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Speaking pace and clarity</li>
                    <li>• Filler word usage</li>
                    <li>• Facial expressions and confidence</li>
                    <li>• Content structure and completeness</li>
                  </ul>
                </div>
              </div>

              <div className="flex justify-center">
                <Button 
                  onClick={() => setCurrentStep('recording')} 
                  size="lg"
                  className="px-8"
                >
                  Start Recording
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unified Interview Session for Conversational Mode */}
        {sessionData.isConversational && (
          <UnifiedInterviewSession
            sessionId={params.sessionId}
            interviewType={sessionData.interviewType}
            difficulty={sessionData.difficulty}
            duration={sessionData.duration}
            isConversational={true}
            onComplete={handleSessionComplete}
          />
        )}

        {currentStep === 'recording' && !sessionData.isConversational && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Record Your Response</CardTitle>
                <CardDescription>
                  Answer the question above. Click start when you're ready.
                </CardDescription>
              </CardHeader>
            </Card>
            
            <VideoRecorder 
              sessionId={params.sessionId}
              onUploadComplete={handleUploadComplete}
              onUploadError={handleUploadError}
            />
          </div>
        )}

        {currentStep === 'uploaded' && (
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">Upload Successful!</h3>
              <p className="text-gray-600 mb-6">
                Your interview response has been uploaded successfully. 
                Our AI is now analyzing your performance.
              </p>
              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  <strong>What happens next:</strong> Our AI will analyze your speaking pace, 
                  clarity, facial expressions, and content structure. This typically takes 2-5 minutes.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'processing' && (
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="animate-pulse">
                <Brain className="w-16 h-16 text-blue-600 mx-auto mb-4" />
              </div>
              <h3 className="text-2xl font-bold mb-2">AI Analysis in Progress</h3>
              <p className="text-gray-700 font-medium mb-2">Our system is crunching numbers for you.</p>
              <p className="text-gray-600 mb-6">The analysis can take up to 10 minutes, please hold on.</p>

              <div className="flex justify-center mb-6">
                <img
                  src="https://media.giphy.com/media/QZ2Ap9b9G5CYo/giphy.gif"
                  alt="Processing data"
                  className="w-64 h-40 object-contain rounded-md border"
                />
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                <p className="text-sm text-gray-500">Processing your response...</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Clock className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm font-medium">Speech Analysis</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Mic className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm font-medium">Emotion Detection</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Brain className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-sm font-medium">Content Evaluation</p>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  <strong>Please wait:</strong> This can take several minutes depending on load. The page will automatically update when complete.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'completed' && (
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">Analysis Complete!</h3>
              <p className="text-gray-600 mb-6">
                Your interview response has been analyzed successfully. 
                View your detailed feedback and performance insights.
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-800">Ready to Review</span>
                </div>
                <p className="text-sm text-green-700">
                  Your personalized feedback includes speaking analysis, content evaluation, 
                  and actionable recommendations for improvement.
                </p>
              </div>

              <div className="space-y-3">
                <Button onClick={handleViewResults} size="lg" className="w-full">
                  View Detailed Results
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button onClick={handleBackToDashboard} variant="outline" className="w-full">
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
