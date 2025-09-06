'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { WingmanHeader } from '@/components/WingmanHeader';
import VideoAnalysisResults from '@/components/VideoAnalysisResults';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Upload, Play, RotateCcw, Download, Clock, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AnalysisState {
  status: 'idle' | 'uploading' | 'analyzing' | 'processing' | 'completed' | 'error';
  progress: number;
  results?: any;
  error?: string;
  videoUrl?: string;
  sessionId?: string;
}

function VideoAnalysisPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoUri = searchParams.get('videoUri');
  
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: 'idle',
    progress: 0
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (videoUri) {
      // Auto-start analysis if video URI is provided
      startAnalysis(videoUri);
    }
  }, [videoUri]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
      setAnalysisState({ status: 'idle', progress: 0 });
    }
  };

  const uploadVideo = async (file: File, sessionId?: string) => {
    setAnalysisState({ status: 'uploading', progress: 10 });

    try {
      // Use provided session ID or create one
      const currentSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Get signed upload URL
      const uploadResponse = await fetch('/api/upload/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `analysis-${Date.now()}-${file.name}`,
          contentType: file.type,
          sessionId: currentSessionId
        })
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { signedUrl, filename } = await uploadResponse.json();
      setAnalysisState({ status: 'uploading', progress: 30 });

      // Upload file to Google Cloud Storage
      const uploadFileResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadFileResponse.ok) {
        throw new Error('Failed to upload video');
      }

      setAnalysisState({ status: 'uploading', progress: 50 });
      
      // Return the GCS URI and session ID
      const bucketName = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_BUCKET_NAME || 'wingman-interview-videos-1756476470';
      const videoUri = `gs://${bucketName}/${filename}`;
      return { videoUri, sessionId: currentSessionId };

    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const startAnalysis = async (uri?: string, sessionId?: string) => {
    try {
      let videoUri = uri;
      let currentSessionId = sessionId;
      
      if (!videoUri && selectedFile) {
        // Create session ID and upload video
        currentSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const uploadResult = await uploadVideo(selectedFile, currentSessionId);
        videoUri = uploadResult.videoUri;
        currentSessionId = uploadResult.sessionId;
      }

      if (!videoUri || !currentSessionId) {
        throw new Error('No video or session ID to analyze');
      }

      setAnalysisState({ 
        status: 'analyzing', 
        progress: 60,
        videoUrl: videoUri,
        sessionId: currentSessionId
      });

      // Start video analysis
      const analysisResponse = await fetch('/api/video-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUri, sessionId: currentSessionId })
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      setAnalysisState({ status: 'analyzing', progress: 80 });

      const results = await analysisResponse.json();
      
      // The analysis has been submitted to Google Cloud Functions
      // It will take 2-3 minutes to process
      setAnalysisState({
        status: 'processing',
        progress: 100,
        videoUrl: videoUri,
        sessionId: currentSessionId
      });

    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisState({
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Analysis failed'
      });
    }
  };

  const resetAnalysis = () => {
    setAnalysisState({ status: 'idle', progress: 0 });
    setSelectedFile(null);
  };

  const downloadResults = () => {
    if (analysisState.results) {
      const dataStr = JSON.stringify(analysisState.results, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `interview-analysis-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title="Video Analysis"
        subtitle="AI-powered interview performance analysis"
        showBackButton={true}
        backHref="/practice/ai"
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        {analysisState.status === 'idle' && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-6 w-6" />
                Upload Interview Video
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="video-upload"
                  />
                  <label htmlFor="video-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium mb-2">
                      {selectedFile ? selectedFile.name : 'Choose a video file'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Supported formats: MP4, WebM, MOV (Max 100MB)
                    </p>
                  </label>
                </div>
                
                {selectedFile && (
                  <div className="flex justify-center">
                    <Button onClick={() => startAnalysis()} size="lg">
                      Start Analysis
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress Section */}
        {(analysisState.status === 'uploading' || analysisState.status === 'analyzing') && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-6 w-6" />
                {analysisState.status === 'uploading' ? 'Uploading Video' : 'Analyzing Performance'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-center">
                  <LoadingAnimation message={analysisState.status === 'uploading' ? 'Uploading your video...' : 'Analyzing your interview...'} />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      {analysisState.status === 'uploading' ? 'Uploading...' : 'Analyzing speech, facial expressions, and confidence...'}
                    </span>
                    <span>{analysisState.progress}%</span>
                  </div>
                  <Progress value={analysisState.progress} className="w-full" />
                </div>
                
                <div className="text-center text-sm text-muted-foreground">
                  {analysisState.status === 'uploading' && 'Securely uploading your video to our analysis servers...'}
                  {analysisState.status === 'analyzing' && (
                    <div className="space-y-2">
                      <p>Running comprehensive AI analysis on your interview performance...</p>
                      <p className="text-xs">⏱️ Expected time: 1-2 minutes per minute of video</p>
                      <div className="flex justify-center items-center gap-2 text-xs">
                        <span>🗣️ Speech Analysis</span>
                        <span>😊 Facial Expressions</span>
                        <span>💪 Confidence Metrics</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processing Section */}
        {analysisState.status === 'processing' && (
          <Card className="mb-8 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <Clock className="h-6 w-6" />
                Analysis Submitted Successfully
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Clock className="h-8 w-8 text-blue-600 animate-pulse" />
                  </div>
                </div>
                
                <div className="text-center space-y-3">
                  <h3 className="text-lg font-medium text-blue-900">
                    Your video is being processed by our AI systems
                  </h3>
                  <p className="text-blue-700">
                    This typically takes <strong>2-3 minutes</strong> to complete.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <p className="text-sm text-blue-800 mb-3">
                      <strong>What happens next:</strong>
                    </p>
                    <div className="space-y-2 text-sm text-blue-700">
                      <div className="flex items-center gap-2">
                        <span>🗣️</span>
                        <span>Speech analysis and transcription</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>😊</span>
                        <span>Facial expression and emotion tracking</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>💪</span>
                        <span>Confidence and body language analysis</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-yellow-800">
                      <strong>📋 Your results will be available in the Interview History tab on your dashboard.</strong>
                    </p>
                  </div>
                </div>
                
                <div className="flex justify-center gap-3 pt-4">
                  <Button 
                    onClick={() => router.push('/dashboard')} 
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go to Dashboard
                  </Button>
                  <Button 
                    onClick={resetAnalysis} 
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Analyze Another Video
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Section */}
        {analysisState.status === 'error' && (
          <Card className="mb-8 border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Analysis Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-red-600">{analysisState.error}</p>
                <div className="flex gap-2">
                  <Button onClick={resetAnalysis} variant="outline">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Section - This should rarely be shown now */}
        {analysisState.status === 'completed' && analysisState.results && (
          <div className="space-y-6">
            {/* Action Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">Analysis Complete</h3>
                    <p className="text-sm text-muted-foreground">
                      Your interview has been analyzed successfully
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={downloadResults} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download Report
                    </Button>
                    <Button onClick={resetAnalysis} variant="outline" size="sm">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Analyze Another
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analysis Results */}
            <VideoAnalysisResults analysisData={analysisState.results} sessionId={analysisState.sessionId!} />
          </div>
        )}

        {/* Info Section */}
        {analysisState.status === 'idle' && !selectedFile && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Play className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-medium mb-2">Speech Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Analyzes your speaking pace, filler words, and clarity using Google Cloud Speech-to-Text
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="font-medium mb-2">Facial Expression</h3>
                <p className="text-sm text-muted-foreground">
                  Tracks emotions and expressions throughout your interview using Google Cloud Vision AI
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Play className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="font-medium mb-2">Confidence Metrics</h3>
                <p className="text-sm text-muted-foreground">
                  Measures eye contact, head stability, and overall confidence through video analysis
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VideoAnalysisPage() {
  return (
    <Suspense fallback={<LoadingAnimation message="Loading analysis..." fullscreen /> }>
      <VideoAnalysisPageContent />
    </Suspense>
  );
}
