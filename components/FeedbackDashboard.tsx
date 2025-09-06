'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, MessageSquare, Brain, ArrowLeft, CheckCircle, Star, Upload, Video } from 'lucide-react'
import VideoAnalysisResults from './VideoAnalysisResults'
import { LoadingAnimation } from './LoadingAnimation'

interface VideoAnalysisData {
  speech_analysis?: any;
  facial_analysis?: any;
  confidence_analysis?: any;
  overall_score?: any;
}

interface FeedbackDashboardProps {
  sessionId: string
  onBack?: () => void
}

export function FeedbackDashboard({ sessionId, onBack }: FeedbackDashboardProps) {
  const [analysisData, setAnalysisData] = useState<VideoAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true;
    const pollAnalysis = async () => {
      try {
        const response = await fetch(`/api/video-analysis/results/${sessionId}`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          if (data && isMounted) {
            setAnalysisData(data);
            setLoading(false);
            setError(null);
            return true; // Success
          }
        }
        return false; // Not ready yet
      } catch (e) {
        if (isMounted) {
          setError('Failed to fetch analysis status.');
        }
        return false;
      }
    };

    const startPolling = () => {
      const intervalId = setInterval(async () => {
        const success = await pollAnalysis();
        if (success) {
          clearInterval(intervalId);
          clearTimeout(timeoutId);
        }
      }, 5000); // Poll every 5 seconds

      const timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        if (loading && isMounted) {
            setError('Analysis is taking longer than expected. Please check back later.');
            setLoading(false);
        }
      }, 300000); // 5-minute timeout

      // Initial check
      pollAnalysis();
    };

    startPolling();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <LoadingAnimation message="Loading your analysis results..." />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6 text-center">
          <Clock className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Analysis Processing</h3>
          <p className="text-gray-600 mb-4">
            Your video is being analyzed by our AI system. This typically takes 2-3 minutes to complete.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Please check back in a few minutes or visit your Interview History to see the results once processing is complete.
          </p>
          <div className="space-y-2">
            <Button onClick={() => window.location.reload()} className="w-full">
              <Clock className="w-4 h-4 mr-2" />
              Check Again
            </Button>
            <Button 
              onClick={() => window.location.href = '/history'} 
              variant="outline" 
              className="w-full"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Go to Interview History
            </Button>
            {onBack && (
              <Button onClick={onBack} variant="outline" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analysisData) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6 text-center">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Analysis Data</h3>
          <p className="text-gray-600 mb-4">No video analysis results found for this session.</p>
          <Button 
            onClick={() => window.location.href = '/practice/ai/analysis'} 
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            Start Video Analysis
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <CheckCircle className="w-6 h-6 text-green-600" />
                Video Analysis Complete
              </CardTitle>
              <CardDescription className="text-base mt-2">
                AI-powered analysis of your interview performance
              </CardDescription>
            </div>
            {analysisData.overall_score && (
              <Badge className="bg-green-100 text-green-800 px-4 py-2 text-lg">
                <Star className="w-4 h-4 mr-1" />
                Grade: {analysisData.overall_score.grade}
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Video Analysis Results */}
      <VideoAnalysisResults analysisData={analysisData} sessionId={sessionId} />
    </div>
  )
}
