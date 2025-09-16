'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WingmanHeader } from '@/components/WingmanHeader'
import { LoadingAnimation } from '@/components/LoadingAnimation'
import { 
  Calendar, 
  Clock, 
  TrendingUp, 
  Eye, 
  Video,
  BarChart3,
  Star,
  ArrowRight,
  MessageSquare,
  Activity,
  CheckCircle
} from 'lucide-react'
import Link from 'next/link'

interface InterviewSession {
  id: string
  createdAt: string
  type: 'AI_PRACTICE' | 'PEER_PRACTICE' | 'EXPERT_SESSION'
  status: 'COMPLETED' | 'IN_PROGRESS' | 'CANCELLED'
  duration?: number
  hasVideoAnalysis: boolean
  isConversational?: boolean
  overallScore?: string
  analysisData?: {
    overall_score?: {
      overall_score?: number
      grade?: string
      component_scores?: any
    }
    speech_analysis?: {
      transcript?: string
      pace_analysis?: {
        average_pace?: number
      }
      filler_words?: {
        total_count?: number
      }
    }
    facial_analysis?: {
      dominant_emotion?: string
    }
    // Conversational AI analysis data
    analysis?: {
      overallScore?: number
      starMethodAnalysis?: {
        score?: number
        feedback?: string
      }
      communicationSkills?: {
        clarity?: { score?: number }
        structure?: { score?: number }
        conciseness?: { score?: number }
      }
    }
    confidence_analysis?: {
      confidence_score?: number
    }
  }
}

export default function InterviewHistoryPage() {
  const { data: session, status } = useSession()
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated') {
      fetchInterviewHistory()
    }
  }, [status])

  const fetchInterviewHistory = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/interviews/history', {
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch interview history')
      }
      
      const data = await response.json()
      setSessions(data.sessions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading' || loading) {
    return <LoadingAnimation message="Loading your interview history..." fullscreen />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <WingmanHeader title="Interview History" showBackButton />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card className="text-center">
            <CardContent className="pt-6">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchInterviewHistory}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const getSessionTypeDisplay = (type: string) => {
    switch (type) {
      case 'AI_PRACTICE':
        return { label: 'AI Practice', color: 'bg-blue-100 text-blue-800' }
      case 'PEER_PRACTICE':
        return { label: 'Peer Practice', color: 'bg-green-100 text-green-800' }
      case 'EXPERT_SESSION':
        return { label: 'Expert Session', color: 'bg-purple-100 text-purple-800' }
      default:
        return { label: type, color: 'bg-gray-100 text-gray-800' }
    }
  }

  const getScoreColor = (grade?: string) => {
    if (!grade) return 'text-gray-500';
    if (['A+', 'A'].includes(grade)) return 'text-green-600';
    if (['A-', 'B+'].includes(grade)) return 'text-blue-600';
    if (['B', 'B-'].includes(grade)) return 'text-yellow-600';
    if (['C+', 'C'].includes(grade)) return 'text-orange-600';
    return 'text-red-600';
  };

  const getGradeFromScore = (score: number): string => {
    if (score >= 95) return 'A+'
    if (score >= 90) return 'A'
    if (score >= 85) return 'A-'
    if (score >= 80) return 'B+'
    if (score >= 75) return 'B'
    if (score >= 70) return 'B-'
    if (score >= 65) return 'C+'
    if (score >= 60) return 'C'
    if (score >= 55) return 'C-'
    if (score >= 50) return 'D'
    return 'F'
  }

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const getSessionScore = (session: InterviewSession): { score: number; grade: string } | null => {
    let score: number | undefined;
    let grade: string | undefined;

    // Prioritize detailed analysis data if available
    if (session.isConversational && session.analysisData?.analysis?.overallScore) {
      score = session.analysisData.analysis.overallScore;
    } else if (session.analysisData?.overall_score?.overall_score) {
      score = Math.round(session.analysisData.overall_score.overall_score * 100);
      grade = session.analysisData.overall_score.grade;
    } else if (session.overallScore) {
      // Fallback to top-level overallScore (string)
      const parsedScore = parseInt(session.overallScore, 10);
      if (!isNaN(parsedScore)) {
        score = parsedScore;
      }
    }

    if (typeof score === 'number') {
      // If grade is not already set from analysis data, calculate it
      if (!grade) {
        grade = getGradeFromScore(score);
      }
      return { score, grade };
    }

    return null;
  };

  const sessionsWithScores = sessions
    .map(getSessionScore)
    .filter((result): result is { score: number; grade: string } => result !== null);

  const averageScore = sessionsWithScores.length > 0
    ? Math.round(sessionsWithScores.reduce((acc, { score }) => acc + score, 0) / sessionsWithScores.length)
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title="Interview History" 
        subtitle="Review your past interviews and analysis results"
        showBackButton 
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Video className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Sessions</p>
                  <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <BarChart3 className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">With Analysis</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {sessions.filter(s => s.hasVideoAnalysis).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Average Score</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {averageScore !== null ? `${averageScore}%` : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sessions List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Your Interview Sessions</h2>
          </div>

          {sessions.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews yet</h3>
                <p className="text-gray-600 mb-4">Start practicing to see your interview history here.</p>
                <Link href="/practice/ai">
                  <Button>Start First Interview</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => {
                const sessionType = getSessionTypeDisplay(session.type);
                const scoreData = getSessionScore(session);
                const llmScore10 = (() => {
                  try {
                    const os = session.analysisData?.analysis?.overallScore as any;
                    if (typeof os === 'number' && isFinite(os)) return Math.round(os / 10);
                  } catch {}
                  return null as number | null;
                })();
                const wpm = (() => {
                  const p = (session.analysisData?.speech_analysis?.pace_analysis?.average_pace as any);
                  return typeof p === 'number' && isFinite(p) ? Math.round(p) : null as number | null;
                })();
                const filler = (() => {
                  const f = session.analysisData?.speech_analysis?.filler_words?.total_count as any;
                  return typeof f === 'number' && isFinite(f) ? f : null as number | null;
                })();
                const clarity = (() => {
                  const sa = (session.analysisData?.speech_analysis as any);
                  const c = sa?.clarity_score ?? sa?.clarity;
                  return typeof c === 'number' && isFinite(c) ? Math.round(c) : null as number | null;
                })();
                const confidencePct = (() => {
                  const cs = (session.analysisData?.confidence_analysis?.confidence_score as any);
                  // confidence_score is often 0-1; convert to percentage 0-100
                  if (typeof cs === 'number' && isFinite(cs)) return Math.round(cs * 100);
                  return null as number | null;
                })();
                return (
                  <Card key={session.id} className="hover:shadow-md transition-shadow overflow-hidden">
                    <div className="flex flex-col">
                      {/* Session Header */}
                      <div className="flex items-center justify-between p-6">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge className={sessionType.color}>{sessionType.label}</Badge>
                          {session.isConversational && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              <MessageSquare className="w-3 h-3 mr-1" />
                              Conversational AI
                            </Badge>
                          )}
                          <div className="flex items-center text-sm text-gray-500">
                            <Calendar className="w-4 h-4 mr-1.5" />
                            {new Date(session.createdAt).toLocaleDateString()}
                          </div>
                          <div className="flex items-center text-sm text-gray-500">
                            <Clock className="w-4 h-4 mr-1.5" />
                            {formatDuration(session.duration)}
                          </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="px-2 py-0.5 rounded border">SuperAI: {llmScore10 != null ? `${llmScore10}/10` : 'N/A'}</span>
                            <span className="px-2 py-0.5 rounded border">WPM: {wpm != null ? `${wpm}` : 'N/A'}</span>
                            <span className="px-2 py-0.5 rounded border">Filler: {filler != null ? `${filler}` : 'N/A'}</span>
                            <span className="px-2 py-0.5 rounded border">Clarity: {clarity != null ? `${clarity}` : 'N/A'}</span>
                            <span className="px-2 py-0.5 rounded border">Conf: {confidencePct != null ? `${confidencePct}%` : 'N/A'}</span>
                          </div>
                          {scoreData && (
                            <div className="text-right">
                              <p className={`text-xl font-bold ${getScoreColor(scoreData.grade)}`}>{scoreData.grade}</p>
                              <p className="text-sm text-gray-500">{scoreData.score}%</p>
                            </div>
                          )}
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/history/${session.id}`}>View Report</Link>
                          </Button>
                        </div>
                        </div>
                      </div>

                      {/* Analysis KPIs */}
                      {(session.hasVideoAnalysis || session.isConversational) && session.analysisData && (
                        <div className="bg-gray-50/70 border-t border-gray-200 px-6 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            {session.analysisData.speech_analysis?.pace_analysis?.average_pace != null && (
                              <div>
                                <p className="text-xs text-gray-500">Pace</p>
                                <p className="font-semibold text-gray-800 text-sm">{Math.round(session.analysisData.speech_analysis.pace_analysis.average_pace)} WPM</p>
                              </div>
                            )}
                            {session.analysisData.speech_analysis?.filler_words?.total_count != null && (
                              <div>
                                <p className="text-xs text-gray-500">Filler Words</p>
                                <p className="font-semibold text-gray-800 text-sm">{session.analysisData.speech_analysis.filler_words.total_count}</p>
                              </div>
                            )}
                            {session.analysisData.confidence_analysis?.confidence_score != null && (
                              <div>
                                <p className="text-xs text-gray-500">Confidence</p>
                                <p className="font-semibold text-gray-800 text-sm">{Math.round(session.analysisData.confidence_analysis.confidence_score * 100)}%</p>
                              </div>
                            )}
                            {session.analysisData.facial_analysis?.dominant_emotion && (
                              <div>
                                <p className="text-xs text-gray-500">Top Emotion</p>
                                <p className="font-semibold text-gray-800 text-sm capitalize">{session.analysisData.facial_analysis.dominant_emotion.toLowerCase()}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
