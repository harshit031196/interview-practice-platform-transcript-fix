'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Play, Square, Send, MessageCircle, Brain, FileText } from 'lucide-react';

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

interface ConversationalInterviewProps {
  sessionId?: string;
  jobRole?: string;
  company?: string;
  interviewType?: string;
  onComplete?: (transcript: string, analysis: any) => void;
}

export default function ConversationalInterview({
  sessionId: initialSessionId,
  jobRole = 'Software Engineer',
  company = 'FAANG',
  interviewType = 'behavioral',
  onComplete
}: ConversationalInterviewProps) {
  const [sessionId, setSessionId] = useState(initialSessionId || `interview-${Date.now()}`);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Start the interview with an initial question
  const startInterview = useCallback(async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/ai/interviewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          jobRole,
          company,
          interviewType,
          conversationHistory: []
        })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentQuestion(data.question);
        setMessages([{ 
          role: 'assistant', 
          content: data.question, 
          timestamp: new Date() 
        }]);
        setInterviewStarted(true);
      } else {
        console.error('Failed to start interview:', response.status, await response.text());
        alert('Failed to start interview. Please check your connection and try again.');
      }
    } catch (error) {
      console.error('Failed to start interview:', error);
      alert('Failed to start interview. Please check your connection and try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, jobRole, company, interviewType]);

  // Start recording audio
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setCurrentTranscript(''); // Reset transcript
      
      // Disable live transcript for now due to repetition issues
      // Will rely on final speech-to-text API result instead
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, []);

  // Stop recording and process speech
  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !streamRef.current) return;

    setIsRecording(false);
    setIsProcessing(true);

    // Stop speech recognition if it exists
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    mediaRecorderRef.current.stop();
    streamRef.current.getTracks().forEach(track => track.stop());

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert to base64 for API
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          
          // Send to speech-to-text API
          const speechResponse = await fetch('/api/ai/speech-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioData: base64Audio,
              sessionId,
              enableDiarization: true
            })
          });

          if (speechResponse.ok) {
            const speechData = await speechResponse.json();
            const userTranscript = speechData.transcripts
              .map((t: any) => t.text)
              .join(' ');

            // Use API transcript only (live transcript disabled due to repetition)
            const finalTranscript = userTranscript.trim();
            
            if (finalTranscript) {
              // Add user message immediately for faster display
              const userMessage: Message = {
                role: 'user',
                content: finalTranscript,
                timestamp: new Date()
              };

              const updatedMessages = [...messages, userMessage];
              setMessages(updatedMessages);

              // Get AI response
              const aiResponse = await fetch('/api/ai/interviewer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userResponse: finalTranscript,
                  conversationHistory: updatedMessages.map(m => ({
                    role: m.role,
                    content: m.content
                  })),
                  sessionId,
                  jobRole,
                  company,
                  interviewType
                })
              });

              if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                setCurrentQuestion(aiData.question);
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: aiData.question,
                  timestamp: new Date()
                }]);
              }
            }
          }
        };
        
        reader.readAsDataURL(audioBlob);
      } catch (error) {
        console.error('Failed to process speech:', error);
      } finally {
        setIsProcessing(false);
      }
    };
  }, [messages, sessionId, jobRole, company, interviewType]);

  // Generate final feedback
  const generateFeedback = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const conversationTranscript = messages
        .map(m => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content}`)
        .join('\n\n');

      const feedbackResponse = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationTranscript,
          sessionId,
          jobRole,
          company,
          interviewType
        })
      });

      if (feedbackResponse.ok) {
        const feedbackData = await feedbackResponse.json();
        console.log('Feedback generated successfully:', feedbackData);
        
        // Store session in database
        await fetch('/api/ai/sessions/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            transcript: conversationTranscript,
            analysis: feedbackData.analysis,
            jobRole,
            company,
            interviewType,
            isConversational: true
          })
        });
        
        onComplete?.(conversationTranscript, feedbackData.analysis);
      } else {
        console.error('Feedback API error:', await feedbackResponse.text());
        alert('Failed to generate feedback. Please try again.');
      }
    } catch (error) {
      console.error('Failed to generate feedback:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [messages, sessionId, jobRole, company, interviewType, onComplete]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Interview Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Conversational AI Interview
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline">{company}</Badge>
            <Badge variant="outline">{jobRole}</Badge>
            <Badge variant="outline">{interviewType}</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Start Interview */}
      {!interviewStarted && (
        <Card>
          <CardContent className="pt-6 text-center">
            <h3 className="text-lg font-semibold mb-4">Ready to start your interview?</h3>
            <p className="text-muted-foreground mb-6">
              The AI interviewer will ask you questions and you can respond naturally using voice.
            </p>
            <Button 
              onClick={startInterview} 
              disabled={isProcessing}
              size="lg"
            >
              {isProcessing ? 'Starting...' : 'Start Interview'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Conversation */}
      {interviewStarted && (
        <div className="space-y-4">
          {messages.map((message, index) => (
            <Card key={index} className={message.role === 'user' ? 'ml-8' : 'mr-8'}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user' 
                      ? 'bg-blue-100 text-blue-600' 
                      : 'bg-purple-100 text-purple-600'
                  }`}>
                    {message.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1">
                      {message.role === 'user' ? 'You' : 'AI Interviewer'}
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                    <p className="leading-relaxed">{message.content}</p>
                    
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Recording Controls */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-4">
                {!isRecording ? (
                  <Button
                    onClick={startRecording}
                    disabled={isProcessing}
                    size="lg"
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    {isProcessing ? 'Processing...' : 'Start Speaking'}
                  </Button>
                ) : (
                  <Button
                    onClick={stopRecording}
                    size="lg"
                    variant="outline"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop & Send Response
                  </Button>
                )}

                <Button
                  onClick={generateFeedback}
                  disabled={isAnalyzing}
                  variant="outline"
                  size="lg"
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  {isAnalyzing ? 'Analyzing...' : 'End Interview & Get Feedback'}
                </Button>
              </div>

              {isRecording && (
                <div className="text-center mt-4">
                  <div className="inline-flex items-center gap-2 text-red-600">
                    <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                    Recording... Speak your response
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Click "Stop & Send Response" when finished speaking
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
