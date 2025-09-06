'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaceToneLineChart } from '@/components/charts/PaceToneLineChart';
import { SentimentBars } from '@/components/charts/SentimentBars';
import { SentimentTrendChart } from '@/components/charts/SentimentTrendChart';
import { EyeContactFeedback } from '@/components/EyeContactFeedback';
import { 
  Mic, 
  Eye, 
  Brain, 
  TrendingUp, 
  Clock, 
  MessageSquare,
  Smile,
  Frown,
  Meh,
  AlertCircle,
  Lightbulb,
  Download as DownloadIcon
} from 'lucide-react';

interface VisionFrame {
  timestamp: string;
  joyLikelihood: number;
  sorrowLikelihood: number;
  angerLikelihood: number;
  surpriseLikelihood: number;
  eyeContact: boolean;
}

interface PerAnswerFeedbackItem {
  question?: string;
  candidateAnswerSummary?: string;
  score10?: number;
  whatWasGood?: string;
  whatWasMissing?: string;
  improvedAnswer?: string;
}

interface VideoAnalysisResultsProps {
  sessionId: string;
  analysisData: {
    speech_analysis?: {
      transcript: string;
      total_words: number;
      words_per_minute: number;
      filler_words: {
        count: number;
        percentage: number;
        details: Array<{
          word: string;
          timestamp: number;
          duration: number;
        }>;
      };
      pacing_analysis: {
        average_wpm: number;
        wpm_standard_deviation: number;
        pacing_consistency: number;
        wpm_timeline: number[];
      };
      clarity_score: number;
    };
    facial_analysis?: {
      emotion_timeline: Array<{
        timestamp: number;
        emotions: {
          joy: number;
          sorrow: number;
          anger: number;
          surprise: number;
        };
        detection_confidence: number;
      }>;
      emotion_statistics: {
        joy: { average: number; max: number; min: number; std: number };
        sorrow: { average: number; max: number; min: number; std: number };
        anger: { average: number; max: number; min: number; std: number };
        surprise: { average: number; max: number; min: number; std: number };
      };
      total_frames_analyzed: number;
      average_detection_confidence: number;
    };
    confidence_analysis?: {
      average_eye_contact_score: number;
      eye_contact_consistency: number;
      head_stability_score: number;
      confidence_score: number;
    };
    overall_score?: {
      overall_score: number;
      component_scores: {
        speech_clarity?: number;
        positivity?: number;
        confidence?: number;
      };
      grade: string;
    };
  };
  geminiFeedback?: {
    overallScore10?: number;
    perAnswerFeedback?: PerAnswerFeedbackItem[];
  } | null;
}

// Helper function to extract transcript from raw annotation results
function extractUtterances(data: any): Array<{ speaker: string; transcript: string }> {
  if (data?.speech_analysis?.utterances) return data.speech_analysis.utterances;

  if (data?.annotationResults) {
    for (const annotation of data.annotationResults) {
      if (annotation.speechTranscription?.alternatives?.[0]?.words) {
        const words = annotation.speechTranscription.alternatives[0].words;
        const utterances: Array<{ speakerTag: number; text: string }> = [];
        let currentUtterance = { speakerTag: words[0].speakerTag, text: '' };

        for (const word of words) {
          if (word.speakerTag === currentUtterance.speakerTag) {
            currentUtterance.text += `${word.word} `;
          } else {
            utterances.push({ ...currentUtterance, text: currentUtterance.text.trim() });
            currentUtterance = { speakerTag: word.speakerTag, text: `${word.word} ` };
          }
        }
        utterances.push({ ...currentUtterance, text: currentUtterance.text.trim() });

        return utterances.map(u => ({
          speaker: `Speaker ${u.speakerTag}`,
          transcript: u.text,
        }));
      }
    }
  }
  return [];
}

function extractTranscript(data: any): string {
  if (data.speech_analysis?.transcript) return data.speech_analysis.transcript;
  
  if (data.annotationResults) {
    for (const annotation of data.annotationResults) {
      if (annotation.speechTranscription) {
        const transcripts = annotation.speechTranscription.alternatives;
        if (transcripts && transcripts.length > 0) {
          return transcripts[0].transcript || '';
        }
      }
    }
  }
  
  return 'No transcript available';
}

// Helper function to count words in a string
function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

// Helper function to calculate words per minute
function calculateWPM(data: any): number {
  if (data.speech_analysis?.words_per_minute) return data.speech_analysis.words_per_minute;
  
  const wordCount = countWords(extractTranscript(data));
  const durationInMinutes = data.durationSec ? data.durationSec / 60 : 1;
  return wordCount / durationInMinutes;
}

// Helper function to extract emotion statistics
function extractEmotionStats(data: any): any {
  if (data.facial_analysis?.emotion_statistics) return data.facial_analysis.emotion_statistics;
  
  return {
    joy: { average: 0.25, max: 0.5, min: 0, std: 0.1 },
    sorrow: { average: 0.1, max: 0.3, min: 0, std: 0.05 },
    anger: { average: 0.05, max: 0.2, min: 0, std: 0.03 },
    surprise: { average: 0.15, max: 0.4, min: 0, std: 0.08 }
  };
}

// Helper function to count frames analyzed
function countFrames(data: any): number {
  if (data.facial_analysis?.total_frames_analyzed) return data.facial_analysis.total_frames_analyzed;
  
  if (data.annotationResults) {
    for (const annotation of data.annotationResults) {
      if (annotation.faceDetectionAnnotations) {
        return annotation.faceDetectionAnnotations.length || 0;
      }
    }
  }
  
  return 0;
}

// Helper to safely render metrics, displaying 'N/A' if data is missing.
const renderMetric = (value: number | undefined | null, unit: string = '', defaultValue: string = 'N/A') => {
  if (typeof value === 'number' && !isNaN(value)) {
    return `${Math.round(value)}${unit}`;
  }
  return defaultValue;
};

// Helper to safely render scores as percentages, displaying 'N/A' if data is missing.
const renderScore = (score: number | undefined | null, defaultValue: string = 'N/A') => {
  if (typeof score === 'number' && !isNaN(score)) {
    return `${Math.round(score * 100)}%`;
  }
  return defaultValue;
};

// Helper function to convert score to letter grade
function getGradeFromScore(score: number): string {
  if (score >= 0.9) return 'A+';
  if (score >= 0.8) return 'A';
  if (score >= 0.7) return 'B+';
  if (score >= 0.6) return 'B';
  if (score >= 0.5) return 'C+';
  if (score >= 0.4) return 'C';
  if (score >= 0.3) return 'D+';
  if (score >= 0.2) return 'D';
  return 'F';
}

export default function VideoAnalysisResults({ analysisData, sessionId, geminiFeedback }: VideoAnalysisResultsProps) {
  const [visionFrames, setVisionFrames] = React.useState<VisionFrame[]>([]);
  const [isLoadingVision, setIsLoadingVision] = React.useState(true);

  React.useEffect(() => {
    if (!sessionId) return;

    const fetchVisionData = async () => {
      try {
        setIsLoadingVision(true);
        const response = await fetch(`/api/vision/results/${sessionId}`);
        if (response.status === 404) {
          // No frames saved for this session (e.g., older interviews). Treat as empty, not an error.
          setVisionFrames([]);
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to fetch vision data (${response.status})`);
        }
        const result = await response.json();
        if (result.success) {
          setVisionFrames(result.data);
        } else {
          console.warn('Vision results endpoint returned no data:', result.error);
          setVisionFrames([]);
        }
      } catch (error) {
        console.warn('Non-fatal: vision frames unavailable yet:', error);
        setVisionFrames([]);
      } finally {
        setIsLoadingVision(false);
      }
    };

    fetchVisionData();
  }, [sessionId]);

      const rawAnalysisData = analysisData as any;
  const utterances = React.useMemo(() => extractUtterances(rawAnalysisData.videoAnalysis || rawAnalysisData), [analysisData]);

  const handleDownloadTranscript = () => {
    if (utterances.length === 0) return;

    const scriptContent = utterances
      .map(u => `${u.speaker}: ${u.transcript}`)
      .join('\n\n');

    const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `interview-transcript-${sessionId}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle both old and new data structures
  const rawData = analysisData as any;
  const videoData = rawData.videoAnalysis || rawData;
  const perAnswerFeedback: PerAnswerFeedbackItem[] = (geminiFeedback?.perAnswerFeedback || []) as PerAnswerFeedbackItem[];
  
  // Extract or create speech analysis from raw data
  const speech_analysis = videoData.speech_analysis || (
    videoData.annotationResults && videoData.annotationResults.some((a: any) => a.speechTranscription) ? {
      transcript: extractTranscript(videoData),
      total_words: countWords(extractTranscript(videoData)),
      words_per_minute: calculateWPM(videoData),
      clarity_score: videoData.confidence || 0.5
    } : undefined
  );

  // Extract or create facial analysis from raw data
  const facial_analysis = videoData.facial_analysis || (
    videoData.annotationResults && videoData.annotationResults.some((a: any) => a.faceDetectionAnnotations) ? {
      emotion_statistics: extractEmotionStats(videoData),
      total_frames_analyzed: countFrames(videoData),
      average_detection_confidence: videoData.confidence || 0.5
    } : undefined
  );

  // Extract or create confidence analysis from raw data
  const confidence_analysis = videoData.confidence_analysis || (
    videoData.confidence ? {
      average_eye_contact_score: videoData.confidence,
      eye_contact_consistency: videoData.confidence,
      head_stability_score: videoData.confidence,
      confidence_score: videoData.confidence
    } : undefined
  );

  // Use overall score if available or create one
  const overall_score = React.useMemo(() => {
    // If the backend provides a complete overall_score object, use it directly.
    if (videoData.overall_score && videoData.overall_score.component_scores) {
      return videoData.overall_score;
    }

    // Otherwise, calculate it from the individual analysis components.
    const clarity = speech_analysis?.clarity_score;
    const positivity = facial_analysis?.emotion_statistics?.joy?.average;
    const confidence = confidence_analysis?.confidence_score;

    const component_scores = {
      speech_clarity: clarity,
      positivity: positivity,
      confidence: confidence,
    };

    // Filter out any scores that are not valid numbers.
    const validScores = Object.values(component_scores).filter(
      (score): score is number => typeof score === 'number' && !isNaN(score)
    );

    // Calculate the average score.
    const calculatedOverall =
      validScores.length > 0
        ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
        : 0;

    return {
      overall_score: calculatedOverall,
      component_scores: component_scores,
      grade: getGradeFromScore(calculatedOverall),
    };
  }, [videoData, speech_analysis, facial_analysis, confidence_analysis]);

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'bg-green-100 text-green-800';
    if (grade.startsWith('B')) return 'bg-blue-100 text-blue-800';
    if (grade.startsWith('C')) return 'bg-yellow-100 text-yellow-800';
    if (grade.startsWith('D')) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      {overall_score && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <TrendingUp className="h-6 w-6" />
              Overall Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-4xl font-bold">
                {Math.round(overall_score.overall_score * 100)}%
              </div>
              <Badge className={getGradeColor(overall_score.grade)} variant="secondary">
                Grade: {overall_score.grade}
              </Badge>
            </div>
            <Progress value={overall_score.overall_score * 100} className="w-full" />
            
            {/* Component Scores */}
            {overall_score.component_scores && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="text-center">
                  <div className={`text-2xl font-semibold ${getScoreColor(overall_score.component_scores.speech_clarity ?? 0)}`}>
                    {renderScore(overall_score.component_scores.speech_clarity)}
                  </div>
                  <div className="text-sm text-muted-foreground">Speech Clarity</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-semibold ${getScoreColor(overall_score.component_scores.positivity ?? 0)}`}>
                    {renderScore(overall_score.component_scores.positivity)}
                  </div>
                  <div className="text-sm text-muted-foreground">Positivity</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-semibold ${getScoreColor(overall_score.component_scores.confidence ?? 0)}`}>
                    {renderScore(overall_score.component_scores.confidence)}
                  </div>
                  <div className="text-sm text-muted-foreground">Confidence</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detailed Analysis Tabs */}
      <Tabs defaultValue="speech" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="speech" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Speech Analysis
          </TabsTrigger>
          <TabsTrigger value="facial" className="flex items-center gap-2">
            <Smile className="h-4 w-4" />
            Facial Analysis
          </TabsTrigger>
          <TabsTrigger value="confidence" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Confidence
          </TabsTrigger>
        </TabsList>

        {/* Speech Analysis Tab */}
        <TabsContent value="speech">
          {speech_analysis ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Content: Transcript and Pacing */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Interview Transcript</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleDownloadTranscript} disabled={utterances.length === 0}>
                      <DownloadIcon className="mr-2 h-4 w-4" />
                      Download Script
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto space-y-4">
                      {utterances.length > 0 ? (
                        utterances.map((utterance, index) => (
                          <div key={index} className="prose prose-sm max-w-none">
                            <p>
                              <strong className="capitalize">{utterance.speaker}:</strong>{' '}
                              {utterance.transcript}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No transcript available.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {speech_analysis.pacing_analysis && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Speaking Pace Over Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PaceToneLineChart 
                        data={speech_analysis.pacing_analysis.wpm_timeline.map((wpm: number, index: number) => ({
                          time: index,
                          wpm: wpm,
                          confidence: 0.8 // Default confidence value
                        }))}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Per-Answer Coaching (from LLM) */}
                {perAnswerFeedback && perAnswerFeedback.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" /> Per-Answer Coaching
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {perAnswerFeedback.map((item, idx) => (
                        <div key={idx} className="p-3 rounded-md border">
                          {item.question && (
                            <div className="text-sm mb-1 flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-purple-600" />
                              <span className="font-medium">Question:</span>
                              <span className="text-muted-foreground">{item.question}</span>
                            </div>
                          )}
                          {typeof item.score10 === 'number' && (
                            <div className="text-xs mb-1"><span className="font-medium">Answer Score:</span> {item.score10}/10</div>
                          )}
                          {item.candidateAnswerSummary && (
                            <div className="text-xs mb-1"><span className="font-medium">Your Answer:</span> {item.candidateAnswerSummary}</div>
                          )}
                          {item.whatWasGood && (
                            <div className="text-xs mb-1"><span className="font-medium">What was good:</span> {item.whatWasGood}</div>
                          )}
                          {item.whatWasMissing && (
                            <div className="text-xs mb-1 flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                              <span><span className="font-medium">What was missing:</span> {item.whatWasMissing}</span>
                            </div>
                          )}
                          {item.improvedAnswer && (
                            <div className="text-xs mt-2 p-2 bg-purple-50 rounded-md">
                              <div className="flex items-center gap-2 font-medium mb-1">
                                <Lightbulb className="h-4 w-4 text-purple-700" /> Improved 10/10 Answer
                              </div>
                              <div className="text-muted-foreground whitespace-pre-wrap">{item.improvedAnswer}</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar: Key Metrics */}
              <div className="lg:col-span-1 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Speech Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Words</span>
                      <span className="font-semibold">{renderMetric(speech_analysis.total_words)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Words per Minute</span>
                      <span className="font-semibold">{renderMetric(speech_analysis.words_per_minute, ' wpm')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Clarity Score</span>
                      <span className={`font-semibold ${getScoreColor(speech_analysis.clarity_score ?? 0)}`}>
                        {renderScore(speech_analysis.clarity_score)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {speech_analysis.filler_words && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Filler Words</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Count</span>
                        <span className="font-semibold">{renderMetric(speech_analysis.filler_words.count)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Percentage</span>
                        <span className="font-semibold">{renderMetric(speech_analysis.filler_words.percentage, '%')}</span>
                      </div>
                      {speech_analysis.filler_words.details?.length > 0 && (
                        <div className="pt-2">
                          <h4 className="font-semibold mb-2">Occurrences:</h4>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {speech_analysis.filler_words.details.map((filler: { word: string; timestamp: number }, index: number) => (
                              <div key={index} className="flex justify-between items-center p-2 bg-orange-50 rounded-md">
                                <span className="font-medium text-orange-800">"{filler.word}"</span>
                                <span className="text-muted-foreground">at {formatTime(filler.timestamp)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Speech analysis not available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Facial Analysis Tab */}
        <TabsContent value="facial" className="space-y-4">
          {facial_analysis ? (
            <>
              {/* Emotion Statistics */}
              {facial_analysis.emotion_statistics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {facial_analysis.emotion_statistics.joy && (
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Smile className="h-6 w-6 mx-auto mb-2 text-green-600" />
                        <div className="text-2xl font-bold">
                          {renderScore(facial_analysis.emotion_statistics.joy.average)}
                        </div>
                        <div className="text-sm text-muted-foreground">Joy</div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {facial_analysis.emotion_statistics.sorrow && (
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Frown className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                        <div className="text-2xl font-bold">
                          {renderScore(facial_analysis.emotion_statistics.sorrow.average)}
                        </div>
                        <div className="text-sm text-muted-foreground">Sorrow</div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {facial_analysis.emotion_statistics.anger && (
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Meh className="h-6 w-6 mx-auto mb-2 text-red-600" />
                        <div className="text-2xl font-bold">
                          {renderScore(facial_analysis.emotion_statistics.anger.average)}
                        </div>
                        <div className="text-sm text-muted-foreground">Anger</div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {facial_analysis.emotion_statistics.surprise && (
                    <Card>
                      <CardContent className="p-4 text-center">
                        <AlertCircle className="h-6 w-6 mx-auto mb-2 text-yellow-600" />
                        <div className="text-2xl font-bold">
                          {renderScore(facial_analysis.emotion_statistics.surprise.average)}
                        </div>
                        <div className="text-sm text-muted-foreground">Surprise</div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Emotion Chart */}
              {facial_analysis.emotion_statistics && Object.keys(facial_analysis.emotion_statistics).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Emotional Expression Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SentimentBars 
                      data={{
                        positive: facial_analysis.emotion_statistics.joy ? Math.round(facial_analysis.emotion_statistics.joy.average * 100) : 0,
                        neutral: facial_analysis.emotion_statistics.surprise ? Math.round(facial_analysis.emotion_statistics.surprise.average * 100) : 0,
                        negative: Math.round(((facial_analysis.emotion_statistics.sorrow?.average || 0) + (facial_analysis.emotion_statistics.anger?.average || 0)) / 2 * 100)
                      }}
                    />
                  </CardContent>
                </Card>
              )}

              {visionFrames.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Sentiment Trend Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SentimentTrendChart data={visionFrames} />
                  </CardContent>
                </Card>
              )}

              {/* Detection Quality */}
              <Card>
                <CardHeader>
                  <CardTitle>Analysis Quality</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Frames Analyzed</div>
                      <div className="text-2xl font-bold">{renderMetric(facial_analysis.total_frames_analyzed)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Detection Confidence</div>
                      <div className="text-2xl font-bold">
                        {renderScore(facial_analysis.average_detection_confidence)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Smile className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Facial analysis not available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Confidence Analysis Tab */}
        <TabsContent value="confidence" className="space-y-4">
          {confidence_analysis ? (
            <>
              {/* Confidence Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"> 
                {visionFrames.length > 0 && <EyeContactFeedback data={visionFrames} />}
                <Card>
                  <CardContent className="p-4 text-center">
                    <Eye className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                    <div className={`text-2xl font-bold ${getScoreColor(confidence_analysis.average_eye_contact_score ?? 0)}`}>
                      {renderScore(confidence_analysis.average_eye_contact_score)}
                    </div>
                    <div className="text-sm text-muted-foreground">Eye Contact</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="h-6 w-6 mx-auto mb-2 text-green-600" />
                    <div className={`text-2xl font-bold ${getScoreColor(confidence_analysis.eye_contact_consistency ?? 0)}`}>
                      {renderScore(confidence_analysis.eye_contact_consistency)}
                    </div>
                    <div className="text-sm text-muted-foreground">Consistency</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <Brain className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                    <div className={`text-2xl font-bold ${getScoreColor(confidence_analysis.head_stability_score ?? 0)}`}>
                      {renderScore(confidence_analysis.head_stability_score)}
                    </div>
                    <div className="text-sm text-muted-foreground">Head Stability</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="h-6 w-6 mx-auto mb-2 text-indigo-600" />
                    <div className={`text-2xl font-bold ${getScoreColor(confidence_analysis.confidence_score ?? 0)}`}>
                      {renderScore(confidence_analysis.confidence_score)}
                    </div>
                    <div className="text-sm text-muted-foreground">Overall Confidence</div>
                  </CardContent>
                </Card>
              </div>

              {/* Confidence Progress Bars */}
              <Card>
                <CardHeader>
                  <CardTitle>Confidence Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Eye Contact</span>
                      <span className="text-sm">{renderScore(confidence_analysis.average_eye_contact_score)}</span>
                    </div>
                    <Progress value={confidence_analysis.average_eye_contact_score * 100} />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Consistency</span>
                      <span className="text-sm">{renderScore(confidence_analysis.eye_contact_consistency)}</span>
                    </div>
                    <Progress value={confidence_analysis.eye_contact_consistency * 100} />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">Head Stability</span>
                      <span className="text-sm">{renderScore(confidence_analysis.head_stability_score)}</span>
                    </div>
                    <Progress value={confidence_analysis.head_stability_score * 100} />
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Confidence analysis not available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Raw Analysis Data */}
      <Card>
        <CardHeader>
          <CardTitle>Raw Video Analysis Data (for debugging)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-gray-900 text-white rounded-lg max-h-96 overflow-y-auto">
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
