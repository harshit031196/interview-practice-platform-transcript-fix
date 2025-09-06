'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Mic, MicOff, Video, VideoOff, Square, Send, MessageCircle, Brain, FileText, Clock, Play } from 'lucide-react';
import { signIn, getSession, useSession } from 'next-auth/react';
import { triggerVideoAnalysisWithRetry, ensureValidSession } from './VideoAnalysisHelper';
import SpeechStreamingService from './SpeechStreamingService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  speakerSegments?: Array<{
    speaker: string;
    text: string;
    startTime: number;
    endTime: number;
  }>;
}

interface UnifiedInterviewSessionProps {
  sessionId: string;
  interviewType: string;
  difficulty: string;
  duration: number;
  isConversational: boolean;
  onComplete?: (sessionData: any) => void;
}

// Define a type for individual analysis results for clarity
// This should ideally be moved to a shared types file
type AnalysisSegment = any; // Replace with a more specific type if available

const aggregateAnalysisResults = (results: any[]) => {
  if (!results || results.length === 0) {
    console.log('⚠️ No analysis results to aggregate');
    return {};
  }
  
  console.log(`🔄 Aggregating ${results.length} analysis segments`);
  
  // Validate results array to ensure all items are valid objects
  const validResults = results.filter(result => {
    if (!result || typeof result !== 'object') {
      console.error('⚠️ Invalid result item:', result);
      return false;
    }
    return true;
  });
  
  if (validResults.length === 0) {
    console.error('⚠️ No valid results to aggregate after filtering');
    return {};
  }
  
  // Sort results by segmentIndex to ensure proper order
  validResults.sort((a, b) => {
    const indexA = a.segmentIndex !== undefined ? Number(a.segmentIndex) : 0;
    const indexB = b.segmentIndex !== undefined ? Number(b.segmentIndex) : 0;
    return indexA - indexB;
  });
  
  // Log segment information for debugging
  validResults.forEach((result, i) => {
    console.log(`Segment ${i}: index=${result.segmentIndex || 0}, id=${result.id ? result.id.substring(0, 8) : 'unknown'}`);
  });

  const aggregated = {
    speech_analysis: {
      transcript: '',
      total_words: 0,
      words_per_minute: 0,
      clarity_score: 0,
      filler_words: { count: 0, percentage: 0, details: [] as any[] },
      pacing_analysis: { wpm_timeline: [] as any[] },
      utterances: [] as any[],
    },
    facial_analysis: {
      emotion_timeline: [] as any[],
      emotion_statistics: {
        joy: { average: 0, max: 0, min: 1, std: 0 },
        sorrow: { average: 0, max: 0, min: 1, std: 0 },
        anger: { average: 0, max: 0, min: 1, std: 0 },
        surprise: { average: 0, max: 0, min: 1, std: 0 },
      },
      total_frames_analyzed: 0,
      average_detection_confidence: 0,
    },
    confidence_analysis: {
      average_eye_contact_score: 0,
      eye_contact_consistency: 0,
      head_stability_score: 0,
      confidence_score: 0,
    },
    overall_score: { 
        overall_score: 0,
        grade: '',
        component_scores: {}
    },
    annotationResults: [] as any[],
    durationSec: 0,
  };

  const numResults = results.length;

  validResults.forEach(result => {
    try {
      // Extract results from either direct results field or nested in analysisData
      const analysis = result.results || result.analysisData || {};
      aggregated.durationSec += analysis.durationSec || 0;

      // Aggregate speech analysis
      if (analysis.speech_analysis) {
        aggregated.speech_analysis.transcript += analysis.speech_analysis.transcript + ' ';
        aggregated.speech_analysis.total_words += analysis.speech_analysis.total_words || 0;
        aggregated.speech_analysis.words_per_minute += (analysis.speech_analysis.words_per_minute || 0) / numResults;
        aggregated.speech_analysis.clarity_score += (analysis.speech_analysis.clarity_score || 0) / numResults;
        if (analysis.speech_analysis.filler_words) {
          aggregated.speech_analysis.filler_words.count += analysis.speech_analysis.filler_words.count || 0;
          aggregated.speech_analysis.filler_words.details.push(...(analysis.speech_analysis.filler_words.details || []));
        }
        if (analysis.speech_analysis.pacing_analysis) {
          aggregated.speech_analysis.pacing_analysis.wpm_timeline.push(...(analysis.speech_analysis.pacing_analysis.wpm_timeline || []));
        }
        if(analysis.speech_analysis.utterances) {
          aggregated.speech_analysis.utterances.push(...(analysis.speech_analysis.utterances || []));
        }
      }

      // Aggregate facial analysis
      if (analysis.facial_analysis) {
        aggregated.facial_analysis.total_frames_analyzed += analysis.facial_analysis.total_frames_analyzed || 0;
        aggregated.facial_analysis.average_detection_confidence += (analysis.facial_analysis.average_detection_confidence || 0) / numResults;
        if (analysis.facial_analysis.emotion_statistics) {
          for (const emotion in aggregated.facial_analysis.emotion_statistics) {
            const key = emotion as keyof typeof aggregated.facial_analysis.emotion_statistics;
            if (analysis.facial_analysis.emotion_statistics[key]) {
              aggregated.facial_analysis.emotion_statistics[key].average += analysis.facial_analysis.emotion_statistics[key].average / numResults;
              aggregated.facial_analysis.emotion_statistics[key].max = Math.max(aggregated.facial_analysis.emotion_statistics[key].max, analysis.facial_analysis.emotion_statistics[key].max);
              aggregated.facial_analysis.emotion_statistics[key].min = Math.min(aggregated.facial_analysis.emotion_statistics[key].min, analysis.facial_analysis.emotion_statistics[key].min);
            }
          }
        }
      }

      // Aggregate confidence analysis
      if (analysis.confidence_analysis) {
        aggregated.confidence_analysis.average_eye_contact_score += (analysis.confidence_analysis.average_eye_contact_score || 0) / numResults;
        aggregated.confidence_analysis.eye_contact_consistency += (analysis.confidence_analysis.eye_contact_consistency || 0) / numResults;
        aggregated.confidence_analysis.head_stability_score += (analysis.confidence_analysis.head_stability_score || 0) / numResults;
        aggregated.confidence_analysis.confidence_score += (analysis.confidence_analysis.confidence_score || 0) / numResults;
      }

      // Combine raw annotation results for debugging and detailed views
      if (result.annotationResults) {
          aggregated.annotationResults.push(...result.annotationResults);
      }
    } catch (error) {
      console.error('Error processing segment data:', error, 'Segment:', result);
    }
  });

  // Final calculations
  if (aggregated.speech_analysis.total_words > 0) {
      aggregated.speech_analysis.filler_words.percentage = (aggregated.speech_analysis.filler_words.count / aggregated.speech_analysis.total_words) * 100;
  }
  
  // Ensure transcript is a string before trimming
  if (typeof aggregated.speech_analysis.transcript === 'string') {
    aggregated.speech_analysis.transcript = aggregated.speech_analysis.transcript.trim();
  } else {
    aggregated.speech_analysis.transcript = '';
  }
  
  console.log('✅ Analysis aggregation completed successfully');
  return { videoAnalysis: aggregated };
};

function UnifiedInterviewSession({
  sessionId,
  interviewType,
  difficulty,
  duration,
  isConversational,
  onComplete
}: UnifiedInterviewSessionProps) {
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isContinuousRecording, setIsContinuousRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const speechServiceRef = useRef<SpeechStreamingService | null>(null);
  const geminiTriggeredRef = useRef(false);
  
  // Debug logging for isContinuousRecording state changes
  useEffect(() => {
    console.log(`🎥 [State] isContinuousRecording changed: ${isContinuousRecording}`);
  }, [isContinuousRecording]);
  const [videoSegmentUris, setVideoSegmentUris] = useState<string[]>([]);
  const [continuousVideoBlob, setContinuousVideoBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  // Conversational AI states
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [feedbackData, setFeedbackData] = useState<any>({});
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  
  // Debug logging for interviewStarted state changes
  useEffect(() => {
    console.log(`🎬 [State] interviewStarted changed: ${interviewStarted}`);
  }, [interviewStarted]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isInterviewFlowCompleted, setInterviewFlowCompleted] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  // Guard to prevent duplicate end flows (e.g., timer expiry + user click)
  const endInProgressRef = useRef(false);
  // Timer states
  const [timeRemaining, setTimeRemaining] = useState(duration * 60); // Convert to seconds
  const [timerActive, setTimerActive] = useState(false);
  
  // Media refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const aiVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const visionAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPollTimestampRef = useRef<number>(Date.now());

  // Vision API states
  const [visionAnalysisData, setVisionAnalysisData] = useState<any[]>([]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            handleEndInterview();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, timeRemaining]);

  // Function to play AI audio
  const playAiAudio = useCallback(async (text: string) => {
    // Sanitize leading role prefixes so TTS doesn't speak labels
    const stripRolePrefix = (s: string) => {
      if (!s) return s
      let out = s.trim()
      return out.replace(/^\s*(Interviewer|Candidate|Assistant|System)\s*[:\-—]\s*/i, '').trim()
    }
    const safeText = stripRolePrefix(text)
    if (!text || !audioPlayerRef.current) return;

    try {
      setIsAiSpeaking(true);
      const response = await fetch('/api/ai/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: safeText }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        audioPlayerRef.current.src = url;
        audioPlayerRef.current.play();
        audioPlayerRef.current.onended = () => {
          setIsAiSpeaking(false);
          URL.revokeObjectURL(url);
        };
      } else {
        console.error('Failed to fetch TTS audio.');
        setIsAiSpeaking(false);
      }
    } catch (error) {
      console.error('Error in playAiAudio:', error);
      setIsAiSpeaking(false);
    }
  }, []);

  // Effect to play audio when a new question is set
  useEffect(() => {
    if (currentQuestion && isConversational) {
      playAiAudio(currentQuestion);
    }
  }, [currentQuestion, isConversational, playAiAudio]);

  // Effect to sync AI video with speech
  useEffect(() => {
    if (aiVideoRef.current) {
      if (isAiSpeaking) {
        aiVideoRef.current.play().catch(e => console.error('AI video play error:', e));
      } else {
        aiVideoRef.current.pause();
      }
    }
  }, [isAiSpeaking]);
  
  // Effect to ensure video display when stream is attached
  useEffect(() => {
    if (interviewStarted && videoRef.current && streamRef.current) {
      console.log('🔄 [Video] Ensuring video stream is properly attached');
      
      // Re-attach stream if needed
      if (!videoRef.current.srcObject) {
        console.log('🔄 [Video] Re-attaching stream to video element');
        videoRef.current.srcObject = streamRef.current;
      }
      
      // Ensure video is playing
      if (videoRef.current.paused) {
        videoRef.current.play().catch(e => {
          console.error('❌ [Video] Error playing video in effect:', e);
        });
      }
    }
  }, [interviewStarted]);


  const pollForAnalysisResults = useCallback(() => {
    if (isPolling) return;
    setIsPolling(true);
    lastPollTimestampRef.current = Date.now();
    console.log('🔄 [Polling] Starting to poll for analysis results for all segments...');
    let intervalId: NodeJS.Timeout;
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      if (isPolling) {
        console.log('⌛️ [Polling] Polling timed out.');
        setIsPolling(false);
        setAnalysisProgress('Analysis is taking longer than expected. Please check the feedback page later.');
        setInterviewFlowCompleted(true); // Complete flow to avoid getting stuck
      }
    }, 600000);

    intervalId = setInterval(async () => {
      try {
        const response = await fetch(`/api/video-analysis?sessionId=${sessionId}`);
        if (response.ok) {
          const analyses = await response.json();
          // For continuous recording, we expect only 1 segment (the full video)
          // For segment-based recording, we use the videoSegmentUris length
          const expectedSegments = isContinuousRecording ? 1 : videoSegmentUris.length;
          const receivedSegments = analyses.length;

          console.log(`🔄 [Polling] Status: ${receivedSegments} of ${expectedSegments} segments analyzed.`);
          console.log(`🔄 [Polling] Recording mode: ${isContinuousRecording ? 'Continuous' : 'Segmented'}`);
          console.log(`🔄 [Polling] Video segment URIs: ${JSON.stringify(videoSegmentUris)}`);
          console.log(`🔄 [Polling] Continuous video blob exists: ${continuousVideoBlob ? 'Yes' : 'No'}`);
          console.log(`🔄 [Polling] Analysis results count: ${analyses.length}`);

          // Check if all expected segments have been analyzed
          // We need to verify both the count and that each segment has valid results
          const allSegmentsAnalyzed = receivedSegments >= expectedSegments && 
            analyses.every((analysis: any) => {
              if (!analysis) {
                console.log('Found null or undefined analysis object');
                return false;
              }
              // Extract results from either direct results field or nested in analysisData
              const resultsData = analysis.results || (analysis.analysisData ? analysis.analysisData : null);
              const hasResults = resultsData && typeof resultsData === 'object' && Object.keys(resultsData).length > 0;
              if (!hasResults) {
                console.log(`Segment ${analysis.segmentIndex !== undefined ? analysis.segmentIndex : 'unknown'} has empty results`);
              }
              return hasResults;
            });
            
          // Force completion if we have at least one analyzed segment and it's been more than 30 seconds
          const forceCompletion = receivedSegments > 0 && 
            (Date.now() - lastPollTimestampRef.current) > 30000;
            
          if (allSegmentsAnalyzed || forceCompletion) {
            if (forceCompletion) {
              console.log('⚠️ [Polling] Force completing interview flow after 30 seconds with partial results');
            }
            console.log(`All ${expectedSegments} segments analyzed. Aggregating results.`);
            try {
              const aggregatedResults = aggregateAnalysisResults(analyses);
              // Store the aggregated results for later use
              setAnalysisResults(aggregatedResults);
              // Also update the feedbackData state to include video analysis results
              setFeedbackData((prevData: any) => ({ ...prevData, videoAnalysis: aggregatedResults.videoAnalysis }));
              // Video analysis complete. Do not trigger Gemini here; it was already triggered at end interview.
              setAnalysisProgress('Video analysis complete. Preparing results...');
              setInterviewFlowCompleted(true);
              clearInterval(intervalId);
              clearTimeout(timeoutId);
              setIsPolling(false);
            } catch (error) {
              console.error('Error during result aggregation:', error);
              setAnalysisProgress('Error aggregating analysis results. Please try again.');
            }
          } else {
            setAnalysisProgress(`Analysis in progress: ${receivedSegments} of ${expectedSegments} segments analyzed...`);
          }
        } else if (response.status === 404) {
          console.log('🔄 [Polling] Analysis not ready yet... No results found.');
          const expectedSegments = isContinuousRecording ? 1 : videoSegmentUris.length;
          
          // Check if we've uploaded any segments yet
          if (expectedSegments > 0) {
            // Check if any segments have been successfully uploaded
            // For continuous recording, we check if we have a continuousVideoBlob
            const uploadedSegments = isContinuousRecording 
              ? (continuousVideoBlob ? 1 : 0) 
              : videoSegmentUris.filter(uri => uri).length;
            
            if (uploadedSegments === 0) {
              setAnalysisProgress('Analysis in progress, waiting for video upload...');
            } else if (uploadedSegments < expectedSegments) {
              setAnalysisProgress(`Analysis in progress, ${uploadedSegments} of ${expectedSegments} segments uploaded...`);
            } else {
              setAnalysisProgress(`Analysis in progress, processing ${expectedSegments} segments...`);
            }
          } else {
            setAnalysisProgress('Analysis in progress, waiting for first segment...');
          }
        } else {
          console.error(`❌ [Polling] Error checking analysis status: ${response.status}`);
          setAnalysisProgress('An error occurred while fetching analysis status.');
          // Do not stop polling on transient server errors, let the timeout handle it.
        }
      } catch (error) {
        console.error('❌ [Polling] Network error checking analysis status:', error);
        setAnalysisProgress('Network error. Retrying...');
      }
    }, 10000); // Increased polling interval to 10s to reduce load

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [isPolling, sessionId, messages, isConversational, videoSegmentUris.length, isContinuousRecording, continuousVideoBlob]);

  const analyzeFrame = useCallback(async () => {
    if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL('image/jpeg');

      try {
        console.log('📸 [Vision] Capturing and analyzing frame...');
        const response = await fetch('/api/vision/analyze-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            image: imageDataUrl,
            sessionId: sessionId 
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setVisionAnalysisData(prevData => [...prevData, { timestamp: Date.now(), ...data }]);
            console.log('✅ [Vision] Frame analysis successful');
          }
        } else {
          console.error('❌ [Vision] Frame analysis API failed:', response.status);
        }
      } catch (error) {
        console.error('❌ [Vision] Error sending frame for analysis:', error);
      }
    }
  }, [sessionId]);

  const startFrameAnalysis = useCallback(() => {
    if (visionAnalysisIntervalRef.current) return; // Already running
    visionAnalysisIntervalRef.current = setInterval(analyzeFrame, 5000);
    console.log('▶️ [Vision] Started frame analysis.');
  }, [analyzeFrame]);

  const stopFrameAnalysis = useCallback(() => {
    if (visionAnalysisIntervalRef.current) {
      clearInterval(visionAnalysisIntervalRef.current);
      visionAnalysisIntervalRef.current = null;
      console.log('⏹️ [Vision] Stopped frame analysis.');
    }
  }, []);

  // Start continuous video recording
  const startContinuousRecording = useCallback(() => {
    if (!streamRef.current) {
      console.error('❌ [Video] Cannot start continuous recording: No media stream available');
      return;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('⚠️ [Video] Continuous recording already in progress');
      return;
    }
    
    console.log('DEBUG: Starting continuous recording with stream:', streamRef.current ? 'Available' : 'Not available');

    try {
      console.log('▶️ [Video] Starting continuous recording...');
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'video/webm;codecs=vp9,opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Set up data collection at regular intervals (e.g., every 1 second)
      // This ensures we collect data throughout the recording without waiting for stop
      mediaRecorder.start(1000);
      
      setIsContinuousRecording(true);
      console.log('✅ [Video] Continuous recording started');
    } catch (error) {
      console.error('❌ [Video] Failed to start continuous recording:', error);
    }
  }, []); // Remove isContinuousRecording from dependency array to avoid re-creation issues

  // Effect to handle interview completion and redirection
  useEffect(() => {
    if (isInterviewFlowCompleted) {
      console.log('Interview flow complete, calling onComplete...');
      onComplete?.({
        sessionId,
        status: 'processing',
        hasVideo: videoSegmentUris.length > 0,
        hasConversation: isConversational && messages.length > 0,
        messages: isConversational ? messages : []
      });
    }
  }, [isInterviewFlowCompleted, onComplete, sessionId, videoSegmentUris, isConversational, messages]);

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start the interview with continuous recording
  const startInterview = useCallback(async () => {
    setIsProcessing(true);
    // Set interview as started immediately to prevent button reappearing
    setInterviewStarted(true);
    setTimerActive(true);
    
    try {
      // Get camera and microphone access
      console.log('▶️ [Video] Requesting media devices...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      console.log('✅ [Video] Media stream acquired.');
      
      streamRef.current = stream;
      if (videoRef.current) {
        console.log('▶️ [Video] Attaching stream to video element.');
        videoRef.current.srcObject = stream;
        
        // Add debugging to check video element state
        console.log('Video element state:', {
          width: videoRef.current.offsetWidth,
          height: videoRef.current.offsetHeight,
          videoWidth: videoRef.current.videoWidth,
          videoHeight: videoRef.current.videoHeight,
          paused: videoRef.current.paused,
          muted: videoRef.current.muted
        });
        
        // Force a timeout before playing to ensure DOM is ready
        setTimeout(() => {
          if (videoRef.current) {
            const playPromise = videoRef.current.play();
            if (playPromise) {
              playPromise.then(() => {
                console.log('Video preview ready. Recording will start when you begin answering.');
                // Start periodic frame analysis now that the video is playing
                try {
                  startFrameAnalysis();
                } catch (e) {
                  console.warn('Failed to start frame analysis:', e);
                }
              }).catch(() => {
                console.log('Second play attempt failed, video may need user interaction');
              });
            }
          }
        }, 500);
      } else {
        console.error('❌ [Video] videoRef.current is null. Cannot attach stream.');
      }

      if (isConversational) {
        // Get initial AI question
        const response = await fetch('/api/ai/interviewer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            jobRole: 'Software Engineer',
            company: 'FAANG',
            interviewType,
            conversationHistory: []
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log('AI interviewer response:', data);
          const newQuestion = data.question;
          setCurrentQuestion(newQuestion);
          setMessages([{ 
            role: 'assistant', 
            content: newQuestion, 
            timestamp: new Date() 
          }]);
          await playAiAudio(newQuestion);
        } else {
          console.error('AI interviewer API error:', response.status, await response.text());
          // Fallback question if API fails
          const fallbackQuestion = `Hello! I'm your AI interviewer today. Let's start with a ${interviewType} question. Tell me about a challenging ${interviewType === 'behavioral' ? 'situation you faced at work' : interviewType === 'technical' ? 'technical problem you solved' : interviewType === 'system-design' ? 'system you designed' : 'project you worked on'} and how you handled it.`;
          setCurrentQuestion(fallbackQuestion);
          setMessages([{ 
            role: 'assistant', 
            content: fallbackQuestion, 
            timestamp: new Date() 
          }]);
          await playAiAudio(fallbackQuestion);
        }
      }
    } catch (error) {
      console.error('Failed to start interview:', error);
      alert('Failed to access camera/microphone. Please check permissions.');
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, interviewType, isConversational, startFrameAnalysis, playAiAudio, startContinuousRecording]);

  const uploadVideoSegment = useCallback(async (segmentBlob: Blob, segmentIndex: number) => {
    console.log(`[Segment Upload] Uploading segment ${segmentIndex}...`);
    const formData = new FormData();
    formData.append('file', segmentBlob, `interview_${sessionId}_segment_${segmentIndex}_${Date.now()}.webm`);
    formData.append('sessionId', sessionId);

    try {
      const uploadResponse = await fetch('/api/upload/direct', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: { 'X-Auth-Method': 'hybrid-session' }
      });

      if (uploadResponse.ok) {
        const { videoUri } = await uploadResponse.json();
        console.log(`[Segment Upload] Segment ${segmentIndex} uploaded successfully: ${videoUri}`);
        setVideoSegmentUris(prev => [...prev, videoUri]);
        
        // Asynchronously trigger analysis for the segment
        console.log(`[Segment Analysis] Triggering analysis for segment: ${videoUri}`);
        triggerVideoAnalysisWithRetry(
          videoUri,
          sessionId, // Use the base sessionId
          3,
          (message: string) => console.log(`[Segment Analysis] Progress for segment ${segmentIndex}: ${message}`),
          segmentIndex // Pass segmentIndex separately
        ).catch(err => console.error(`[Segment Analysis] Failed for segment ${segmentIndex}:`, err));

        return videoUri;
      } else {
        console.error(`[Segment Upload] Segment ${segmentIndex} upload failed:`, uploadResponse.status);
        const errorText = await uploadResponse.text();
        console.error('[Segment Upload] Upload error details:', errorText);
        return null;
      }
    } catch (error) {
      console.error(`[Segment Upload] Error uploading segment ${segmentIndex}:`, error);
      return null;
    }
  }, [sessionId]);


  // The speech streaming happens in real-time in startAnswering/stopAnswering methods
  // This code section is removed and replaced by the implementation in those methods
  
  // Helper function to check media stream availability
  const ensureMediaStream = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) {
      return true;
    }
    
    try {
      // Get camera and microphone access if not already available
      console.log('▶️ [Video] Requesting media devices...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(e => {
          console.error('Error playing video:', e);
        });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to access media devices:', error);
      return false;
    }
  }, []);


  const startAnswering = useCallback(async () => {
    try {
      // Ensure we have a media stream
      const hasStream = await ensureMediaStream();
      if (!hasStream) {
        console.error('[Speech] Failed to ensure media stream');
        return;
      }

      // Start continuous recording on first answer if not already recording
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        console.log('▶️ [Video] Starting continuous recording on first answer...');
        startContinuousRecording();
      }

      // Mark the start time of this answer segment
      const answerStartTime = Date.now();
      console.log(`[Answer] Starting answer at timestamp: ${answerStartTime}`);
      
      // Update state to show user is answering
      setIsAnswering(true);
      setIsRecording(true);
      setInterimTranscript(''); // Clear any previous interim transcript
      
      // Initialize speech streaming service if not already created
      if (!speechServiceRef.current) {
        console.log('[Speech] Creating new speech streaming service');
        speechServiceRef.current = new SpeechStreamingService({
          sessionId,
          onInterimResult: (result) => {
            if (result && result.transcript) {
              const incoming = String(result.transcript).trim();
              console.log(`[Speech] Interim result: ${incoming}`);
              // Append-only UX: keep already shown words and add new ones.
              // Avoid flicker/regression when interim hypothesis shortens.
              setInterimTranscript(prev => {
                if (!incoming) return prev;
                if (!prev) return incoming;
                // If incoming extends previous (common cumulative case), append the delta
                if (incoming.length >= prev.length && incoming.startsWith(prev)) {
                  return prev + incoming.slice(prev.length);
                }
                // If incoming is shorter and is a prefix of prev (regression), keep prev to avoid flicker
                if (prev.length > incoming.length && prev.startsWith(incoming)) {
                  return prev;
                }
                // Otherwise, fall back to incoming
                return incoming;
              });
            }
          },
          onInterimTranscript: (transcript) => {
            // Store raw transcripts in session storage as backup
            if (transcript && transcript.trim()) {
              try {
                const backupKey = `backup_transcript_${Date.now()}`;
                sessionStorage.setItem(backupKey, transcript.trim());
              } catch (e) {
                // Ignore storage errors
              }
            }
          },
          onFinalResult: (result) => {
            if (result && result.transcript) {
              // Check if it's from fallback mechanism
              const fromFallback = result.fromFallback ? ' (from fallback)' : '';
              console.log(`[Speech] Final result${fromFallback}: ${result.transcript}`);
            }
          },
          onError: (error) => {
            console.error('[Speech] Streaming error:', error);
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'I had trouble processing your audio. Please try again.',
              timestamp: new Date()
            }]);
          },
          // Enable performance monitoring
          debugMode: true,
          onMetrics: (metrics) => {
            // Store metrics in component state or ref if needed
            console.log('[Speech] Performance metrics update:', 
              `Average latency: ${metrics.averageLatency.toFixed(1)}ms, ` +
              `Chunks: ${metrics.chunksSent}, ` +
              `Data: ${(metrics.bytesProcessed / 1024).toFixed(1)}KB`);
              
            // Optional: Could store these in state or a ref for display in the UI
            if (metrics.averageLatency > 1000) {
              console.warn('[Speech] High latency detected in speech streaming');
            }
          },
          chunkInterval: 2000 // Use ~2s chunks; with 96kbps this stays ~24KB and reduces truncation for longer utterances
        });
      }
      
      // Start streaming with the current media stream
      if (streamRef.current && speechServiceRef.current) {
        const started = await speechServiceRef.current.startStreaming(streamRef.current);
        if (started) {
          console.log('[Speech] Started real-time streaming transcription');
        } else {
          console.error('[Speech] Failed to start streaming');
          setIsAnswering(false);
          setIsRecording(false);
        }
      } else {
        console.error('[Speech] Cannot start streaming: Missing stream or speech service');
        setIsAnswering(false);
        setIsRecording(false);
      }
    } catch (error) {
      console.error('Failed to start answer segment:', error);
      setIsAnswering(false);
      setIsRecording(false);
    }
  }, [isContinuousRecording, sessionId, ensureMediaStream]);

  // Helper function to process user's response and get AI reply
  const processUserResponse = useCallback(async (transcript: string) => {
    if (!transcript || transcript.trim().length === 0) {
      console.error('[Speech] Cannot process empty transcript');
      setIsProcessing(false);
      return;
    }
    
    try {
      // Create a message object for the transcript
      const userMessage: Message = {
        role: 'user',
        content: transcript,
        timestamp: new Date()
      };
      
      // Get current message list before making request to ensure we have latest state
      const currentMessages = [...messages, userMessage];
      
      // Get AI response
      console.log('[AI] Requesting AI interviewer response...');
      const aiResponse = await fetch('/api/ai/interviewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userResponse: transcript,
          conversationHistory: currentMessages.map(m => ({
            role: m.role,
            content: m.content
          })),
          sessionId,
          jobRole: 'Software Engineer',
          company: 'FAANG',
          interviewType
        }),
        credentials: 'include'
      });
      
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        console.log('[AI] Response received:', aiData);
        
        if (aiData && aiData.question) {
          const newQuestion = aiData.question;
          setCurrentQuestion(newQuestion);
          
          // Add AI's question to the conversation
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: newQuestion,
            timestamp: new Date()
          }]);
          
          // Play the audio version if TTS is enabled
          await playAiAudio(newQuestion);
        } else {
          console.error('[AI] Response missing question field:', aiData);
          throw new Error('Invalid AI response format');
        }
      } else {
        console.error('[AI] Request failed:', aiResponse.status, await aiResponse.text());
        throw new Error(`AI response failed with status ${aiResponse.status}`);
      }
    } catch (aiError) {
      console.error('[AI] Error getting interviewer response:', aiError);
      
      // Show error in conversation but don't throw (let the user continue)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I had trouble generating a response. Let\'s continue - do you have more to add?',
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, [messages, sessionId, interviewType, playAiAudio]);

  const stopAnswering = useCallback(async () => {
    // Guard clause - make sure we're in an answering state and have a continuous recording
    if (!isAnswering || !isContinuousRecording) {
      console.log('[Speech] Not currently answering or no continuous recording');
      return;
    }
    
    // Always update UI state first to give immediate feedback
    setIsAnswering(false);
    setIsRecording(false);
    setIsProcessing(true); // Show processing state
    
    try {
      // Check if we have a streaming service
      if (!speechServiceRef.current) {
        throw new Error('No active speech streaming service found');
      }
      
      // Small grace buffer to capture trailing words before finalizing
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.log('[Speech] Stopping real-time streaming transcription');
      const finalResult = await speechServiceRef.current.stopStreaming();
      
      // Process final transcript if available
      if (finalResult && typeof finalResult === 'object') {
        // Log transcript info regardless of whether it's empty
        console.log(`[Speech] Final transcript: ${finalResult.transcript || '(empty)'}`);
        
        // Use the final transcription result (trim whitespace)
        let userTranscript = finalResult.transcript ? finalResult.transcript.trim() : '';
        // If interim has more trailing words and contains the final as a prefix, prefer interim
        if (interimTranscript && interimTranscript.length > userTranscript.length && interimTranscript.startsWith(userTranscript)) {
          userTranscript = interimTranscript.trim();
        }
        
        // Handle empty transcript more gracefully
        if (userTranscript.length === 0) {
          console.warn('[Speech] Empty transcript after trimming');
          
          // Try to recover from sessionStorage backup
          let recoveredTranscript = '';
          
          try {
            // Look through session storage for backup transcripts
            console.log('[Speech] Attempting to recover transcript from session storage');
            
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && (key.startsWith('transcript_') || key.startsWith('backup_transcript_'))) {
                const storedItem = sessionStorage.getItem(key);
                if (storedItem) {
                  try {
                    // Try to parse as JSON first
                    const parsed = JSON.parse(storedItem);
                    if (parsed.transcript && typeof parsed.transcript === 'string') {
                      recoveredTranscript += ' ' + parsed.transcript;
                    }
                  } catch (e) {
                    // If it's not JSON, try to use it directly
                    if (typeof storedItem === 'string') {
                      recoveredTranscript += ' ' + storedItem;
                    }
                  }
                }
              }
            }
            
            // Clean up recovered transcript
            recoveredTranscript = recoveredTranscript.trim();
          } catch (e) {
            console.error('[Speech] Error recovering transcript from session storage:', e);
          }
          
          if (recoveredTranscript.length > 0) {
            console.log(`[Speech] Successfully recovered transcript from session storage: "${recoveredTranscript.substring(0, 50)}${recoveredTranscript.length > 50 ? '...' : ''}"`);
            
            // Use the recovered transcript instead
            const userMessage: Message = {
              role: 'user',
              content: recoveredTranscript,
              timestamp: new Date()
            };
            
            // Add to messages
            setMessages(prev => {
              const newMessages = [...prev, userMessage];
              console.log('[Messages] Updated with recovered user response:', newMessages.length);
              return newMessages;
            });
            
            // Process with the recovered transcript
            processUserResponse(recoveredTranscript);
            return;
          }
          
          // If recovery failed, show a user-friendly message
          console.warn('[Speech] Failed to recover transcript from session storage');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'I couldn\'t hear what you said. Please try speaking again or check your microphone.',
            timestamp: new Date()
          }]);
          
          // Reset UI states
          setIsProcessing(false);
          return; // Exit early but don't throw error
        }
        
        // Create a new user message with the transcription
        const userMessage: Message = {
          role: 'user',
          content: userTranscript,
          timestamp: new Date()
        };
        
        // Add to messages and clear interim transcript
        setMessages(prev => {
          const newMessages = [...prev, userMessage];
          console.log('[Messages] Updated with user response:', newMessages.length);
          return newMessages;
        });
        
        // Clear interim transcript since we now have the final result
        setInterimTranscript('');
        
        try {
          // Get AI response - with error handling
          console.log('[AI] Requesting AI interviewer response...');
          const aiResponse = await fetch('/api/ai/interviewer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userResponse: userTranscript,
              conversationHistory: [...messages, userMessage].map(m => ({
                role: m.role,
                content: m.content
              })),
              sessionId,
              jobRole: 'Software Engineer',
              company: 'FAANG',
              interviewType
            }),
            credentials: 'include'
          });
          
          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            console.log('[AI] Response received:', aiData);
            
            if (aiData && aiData.question) {
              const newQuestion = aiData.question;
              setCurrentQuestion(newQuestion);
              
              // Add AI's question to the conversation
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: newQuestion,
                timestamp: new Date()
              }]);
              
              // Play the audio version if TTS is enabled
              await playAiAudio(newQuestion);
            } else {
              console.error('[AI] Response missing question field:', aiData);
              throw new Error('Invalid AI response format');
            }
          } else {
            console.error('[AI] Request failed:', aiResponse.status, await aiResponse.text());
            throw new Error(`AI response failed with status ${aiResponse.status}`);
          }
        } catch (aiError) {
          console.error('[AI] Error getting interviewer response:', aiError);
          
          // Show error in conversation but don't throw (let the user continue)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'I had trouble generating a response. Let\'s continue - do you have more to add?',
            timestamp: new Date()
          }]);
        }
      } else {
        console.warn('[Speech] Invalid or missing transcript in final result:', finalResult);
        throw new Error('No valid transcript received');
      }
    } catch (error) {
      console.error('[Speech] Error in stopAnswering:', error);
      
      // Show friendly error message in conversation
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I had trouble processing your response. Please try speaking again or click "End Interview" if you\'re finished.',
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, [isAnswering, isContinuousRecording, sessionId, messages, interviewType, playAiAudio]);

  // Function to stop continuous recording and get the full video blob
  const stopContinuousRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return null;

    // If already inactive, build from whatever chunks we have
    if (recorder.state === 'inactive') {
      console.warn('[Video] MediaRecorder already inactive; building blob from existing chunks');
      const fullVideoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
      setContinuousVideoBlob(fullVideoBlob);
      setIsContinuousRecording(false);
      return Promise.resolve(fullVideoBlob);
    }

    return new Promise<Blob>((resolve) => {
      console.log('Stopping continuous recording... state=', recorder.state);
      let resolved = false;

      const handleStop = () => {
        if (resolved) return;
        resolved = true;
        console.log('Continuous recording stopped, creating final video blob');
        const fullVideoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
        setContinuousVideoBlob(fullVideoBlob);
        setIsContinuousRecording(false);
        console.log(`Full video size: ${fullVideoBlob.size} bytes`);
        resolve(fullVideoBlob);
      };

      const handleData = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.addEventListener('dataavailable', handleData);
      recorder.addEventListener('stop', handleStop, { once: true });

      try {
        // Flush any buffered data and stop
        (recorder as any).requestData?.();
        recorder.stop();
      } catch (e) {
        console.error('[Video] Error stopping recorder:', e);
        handleStop();
      }

      // Fallback timeout in case 'stop' event doesn't fire
      setTimeout(() => {
        if (resolved) return;
        console.warn('[Video] MediaRecorder stop timeout; finalizing from collected chunks');
        recorder.removeEventListener('dataavailable', handleData);
        handleStop();
      }, 5000);
    });
  }, []);

  // Upload the full continuous video
  const uploadFullVideo = useCallback(async (videoBlob: Blob) => {
    console.log(`[Full Video Upload] Uploading full video, size: ${videoBlob.size} bytes...`);
    const formData = new FormData();
    formData.append('file', videoBlob, `interview_${sessionId}_full_${Date.now()}.webm`);
    formData.append('sessionId', sessionId);

    try {
      const uploadResponse = await fetch('/api/upload/direct', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: { 'X-Auth-Method': 'hybrid-session' }
      });

      if (uploadResponse.ok) {
        const { videoUri } = await uploadResponse.json();
        console.log(`[Full Video Upload] Full video uploaded successfully: ${videoUri}`);
        setVideoSegmentUris([videoUri]); // Replace any previous segments with just this one full video
        
        // Trigger analysis for the full video (fire-and-forget)
        console.log(`[Full Video Analysis] Triggering analysis for full video (async): ${videoUri}`);
        triggerVideoAnalysisWithRetry(
          videoUri,
          sessionId,
          3,
          (message: string) => console.log(`[Full Video Analysis] Progress: ${message}`),
          0 // Use segment index 0 for the full video
        )
          .then(() => console.log('[Full Video Analysis] Async analysis completed'))
          .catch((err: any) => console.error('[Full Video Analysis] Async analysis error', err));

        return videoUri;
      } else {
        console.error(`[Full Video Upload] Upload failed:`, uploadResponse.status);
        const errorText = await uploadResponse.text();
        console.error('[Full Video Upload] Upload error details:', errorText);
        return null;
      }
    } catch (error) {
      console.error(`[Full Video Upload] Error uploading full video:`, error);
      return null;
    }
  }, [sessionId]);

  // Enhanced end interview with JWT session validation
  const handleEndInterview = useCallback(async () => {
    if (endInProgressRef.current) {
      console.log('handleEndInterview already in progress; skipping duplicate call');
      return;
    }
    endInProgressRef.current = true;
    console.log('handleEndInterview called');
    stopFrameAnalysis();
    setTimerActive(false);
    
    // Clean up speech streaming service if active
    if (speechServiceRef.current) {
      speechServiceRef.current.cleanup();
      speechServiceRef.current = null;
    }
    
    setIsAnalyzing(true);
    setAnalysisProgress('Starting video processing...');
    // Fire-and-forget Gemini segmented numeric feedback immediately for conversational mode
    if (isConversational && !geminiTriggeredRef.current) {
      geminiTriggeredRef.current = true;
      (async () => {
        try {
          console.log('🔄 [Feedback] Triggering segmented numeric feedback (Gemini) at end interview...');
          // Build a simple plain-text transcript from messages to speed up analysis
          const convTranscript = Array.isArray(messages) && messages.length
            ? messages.map(m => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`).join('\n')
            : '';
          const res = await fetch('/api/ai/feedback-quant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sessionId, conversationTranscript: convTranscript, interviewType })
          });
          if (!res.ok) {
            console.warn('Segmented feedback API responded non-OK:', res.status, await res.text());
          }
        } catch (e) {
          console.warn('Failed to trigger segmented numeric feedback', e);
        }
      })();
    }
    // Notify parent immediately so it can show processing overlay
    try {
      onComplete?.({
        sessionId,
        status: 'processing',
        hasVideo: videoSegmentUris.length > 0,
        hasConversation: isConversational && messages.length > 0,
        messages: isConversational ? messages : []
      })
    } catch {}
    
    try {
      // Check database session validity before starting critical operations
      const sessionValid = await ensureValidSession();
      if (!sessionValid) {
        console.log('Session validation failed, but continuing with upload...');
        setAnalysisProgress('Session may have expired - video will be saved, please refresh the page after upload completes');
      } else {
        console.log('Session validated successfully, proceeding with upload and analysis');
      }
      
      // Stop the continuous recording and get the full video blob
      if (isContinuousRecording) {
        setAnalysisProgress('Finalizing video recording...');
        const fullVideoBlob = await stopContinuousRecording();
        
        if (fullVideoBlob) {
          setAnalysisProgress('Uploading full interview video...');
          const videoUri = await uploadFullVideo(fullVideoBlob);
          
          if (videoUri) {
            console.log('Full video uploaded successfully, updating session status');
            setAnalysisProgress('Video uploaded. Analysis is running in the background.');
            
            // Update session status to completed
            await fetch(`/api/ai/session/${sessionId}`, {
              method: 'PATCH',
              headers: { 
                'Content-Type': 'application/json',
                'X-Auth-Method': 'hybrid-session'
              },
              credentials: 'include',
              body: JSON.stringify({ status: 'COMPLETED' })
            });

            // Save vision analysis frames
            if (visionAnalysisData.length > 0) {
              console.log(`Saving ${visionAnalysisData.length} vision analysis frames...`);
              await fetch('/api/vision/save-frames', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, frames: visionAnalysisData }),
              }).catch(error => console.error('Failed to save vision analysis frames:', error));
            }

            // Start polling for the analysis results
            pollForAnalysisResults();
          } else {
            console.error('Failed to upload full video');
            setAnalysisProgress('Failed to upload video. Please try again.');
            setInterviewFlowCompleted(true);
          }
        } else {
          console.error('Failed to get full video blob');
          setAnalysisProgress('Failed to finalize video recording. Please try again.');
          setInterviewFlowCompleted(true);
        }
      } else if (isConversational) {
        // If conversational but no videos, we already triggered Gemini above.
        setAnalysisProgress('Finalizing conversational session...');
        setInterviewFlowCompleted(true);
      } else {
        // No video recorded, just end the flow
        setInterviewFlowCompleted(true);
      }

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      console.log('handleEndInterview finished, analysis is processing in the background.');
      
    } catch (error) {
      console.error('Error in handleEndInterview:', error);
      // Still call onComplete to ensure flow continues
      onComplete?.({
        sessionId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        hasVideo: videoSegmentUris.length > 0,
        hasConversation: isConversational && messages.length > 0,
        messages: isConversational ? messages : []
      });
    }
  }, [sessionId, messages, isConversational, onComplete, pollForAnalysisResults, stopFrameAnalysis, visionAnalysisData, ensureValidSession, videoSegmentUris, isContinuousRecording, stopContinuousRecording, uploadFullVideo]);
  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto">
      <audio ref={audioPlayerRef} />
      {/* Interview Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{interviewType} Interview</h2>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline">{difficulty}</Badge>
            <Badge variant="outline">{isConversational ? 'Conversational' : 'Traditional'}</Badge>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono">{formatTime(timeRemaining)}</div>
          <div className="text-sm text-muted-foreground">Time Remaining</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Video Feed */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex justify-between items-center">
              <span>Video Feed</span>
              {interviewStarted && (
                <Badge variant={isRecording ? "destructive" : "outline"} className="ml-2">
                  {isRecording ? 'Recording' : 'Ready'}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-video bg-black rounded-md overflow-hidden">
              {!interviewStarted ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button 
                    onClick={startInterview} 
                    disabled={isProcessing}
                    className="flex items-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Start Interview
                  </Button>
                </div>
              ) : (
                <>
                  <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover z-10" 
                    autoPlay
                    playsInline
                    muted
                    style={{ display: 'block' }}
                  />
                  <video
                    ref={aiVideoRef}
                    src="/videos/ai-interviewer.mp4" // Using a stock video
                    loop
                    playsInline
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isAiSpeaking ? 'opacity-70' : 'opacity-0'} z-0`}
                    style={{ pointerEvents: 'none' }}
                  />
                  <audio ref={audioRef} />
                  <div className="absolute bottom-2 right-2 flex gap-2">
                    {isConversational ? (
                      isRecording ? (
                        <Button size="sm" variant="destructive" onClick={stopAnswering} disabled={isProcessing}>
                          <Square className="h-4 w-4 mr-1" />
                          Stop Answering
                        </Button>
                      ) : (
                        <>
                          {/* Debug log for button conditions */}
                          {console.log('Start Answering button conditions:', { 
                            isProcessing, 
                            isAiSpeaking, 
                            interviewStarted, 
                            isContinuousRecording,
                            shouldBeDisabled: isProcessing || isAiSpeaking || !interviewStarted || !isContinuousRecording
                          })}
                          <Button 
                            size="sm" 
                            variant="default" 
                            onClick={startAnswering} 
                            disabled={isProcessing || isAiSpeaking || !interviewStarted}
                          >
                            <Mic className="h-4 w-4 mr-1" />
                            Start Answering
                          </Button>
                        </>
                      )
                    ) : null}
                  </div>
                </>
              )}
            </div>
            
            {/* Controls */}
            {interviewStarted && !isAnalyzing && (
              <div className="mt-4 flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.srcObject = null;
                    }
                    if (streamRef.current) {
                      streamRef.current.getTracks().forEach(track => track.stop());
                    }
                    setInterviewStarted(false);
                    setTimerActive(false);
                  }}
                  disabled={isProcessing || isRecording}
                >
                  Restart
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleEndInterview}
                  disabled={isProcessing || isRecording}
                >
                  End Interview
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversation / Instructions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>
              {isConversational ? 'Conversation' : 'Instructions'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isConversational ? (
              <div className="flex flex-col gap-4 h-[350px] overflow-y-auto">
                {messages.map((message, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-lg ${
                      message.role === 'assistant' 
                        ? 'bg-primary/10 text-black' 
                        : 'bg-muted text-black'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {message.role === 'assistant' ? (
                        <Brain className="h-3 w-3" />
                      ) : (
                        <MessageCircle className="h-3 w-3" />
                      )}
                      <span className="text-xs font-medium">
                        {message.role === 'assistant' ? 'Interviewer' : 'You'}
                      </span>
                    </div>
                    <div className="text-sm">{message.content}</div>
                  </div>
                ))}
                
                {/* Display interim transcript while user is speaking */}
                {isRecording && interimTranscript && (
                  <div className="p-3 rounded-lg bg-muted/50 text-black border border-dashed border-gray-300">
                    <div className="flex items-center gap-2 mb-1">
                      <Mic className="h-3 w-3 text-red-500 animate-pulse" />
                      <span className="text-xs font-medium">You (speaking)</span>
                    </div>
                    <div className="text-sm italic">{interimTranscript}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p>This is a traditional interview session. Please:</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Click "Start Interview" to begin</li>
                  <li>Click "Record" when you're ready to answer</li>
                  <li>Click "Stop" when you've finished your response</li>
                  <li>Click "End Interview" when you're done</li>
                </ol>
                <p className="text-sm text-muted-foreground mt-4">
                  Your video will be analyzed and feedback will be provided after the interview.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interviewer Audio Meter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Interviewer Audio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 rounded-md border bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Audio Meter</div>
                <Badge variant={isAiSpeaking ? 'default' : 'outline'} className="capitalize">
                  {isAiSpeaking ? 'Speaking' : 'Idle'}
                </Badge>
              </div>
              <div className="h-20 flex items-end gap-1" aria-hidden="true">
                <span className={`w-2 bg-indigo-500 rounded-sm ${isAiSpeaking ? 'animate-eq1' : ''}`} />
                <span className={`w-2 bg-indigo-500 rounded-sm ${isAiSpeaking ? 'animate-eq2' : ''}`} />
                <span className={`w-2 bg-indigo-500 rounded-sm ${isAiSpeaking ? 'animate-eq3' : ''}`} />
                <span className={`w-2 bg-indigo-500 rounded-sm ${isAiSpeaking ? 'animate-eq2' : ''}`} />
                <span className={`w-2 bg-indigo-500 rounded-sm ${isAiSpeaking ? 'animate-eq1' : ''}`} />
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {isAiSpeaking ? 'Playing interviewer audio…' : 'Waiting for interviewer audio'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analysis Status */}
      {isAnalyzing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Analysis Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={isInterviewFlowCompleted ? 100 : 50} className="mb-2" />
            <p className="text-sm text-muted-foreground">{analysisProgress}</p>
          </CardContent>
        </Card>
      )}
      <style jsx>{`
        @keyframes eq1 { 0% { height: 6px; opacity: .6 } 50% { height: 18px; opacity: 1 } 100% { height: 6px; opacity: .6 } }
        @keyframes eq2 { 0% { height: 10px; opacity: .6 } 50% { height: 22px; opacity: 1 } 100% { height: 10px; opacity: .6 } }
        @keyframes eq3 { 0% { height: 14px; opacity: .6 } 50% { height: 26px; opacity: 1 } 100% { height: 14px; opacity: .6 } }
        .animate-eq1 { animation: eq1 0.9s ease-in-out infinite; }
        .animate-eq2 { animation: eq2 0.9s ease-in-out infinite .1s; }
        .animate-eq3 { animation: eq3 0.9s ease-in-out infinite .2s; }
      `}</style>
    </div>
  );
}

export default UnifiedInterviewSession;
