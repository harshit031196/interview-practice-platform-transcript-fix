'use client'

import { useSession, signOut } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { WingmanHeader } from '@/components/WingmanHeader'
import { LoadingAnimation } from '@/components/LoadingAnimation'
import { 
  MessageSquare, 
  Users, 
  UserCheck, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle, 
  FileText, 
  BookOpen,
  Calendar,
  Brain
} from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const readingMaterials = [
  {
    title: 'Behavioral Interview Questions (2025 Guide)',
    description: 'Latest behavioral questions and sample answers using the STAR method.',
    link: 'https://www.indeed.com/career-advice/interviewing/behavioral-interview-questions',
  },
  {
    title: 'Master the STAR Method',
    description: 'Ace behavioral interviews with a structured response technique.',
    link: 'https://www.indeed.com/career-advice/interviewing/how-to-use-the-star-interview-response-technique',
  },
  {
    title: 'Salary Negotiation: A Practical Playbook',
    description: 'Concrete steps and scripts for negotiating your offer.',
    link: 'https://www.levels.fyi/negotiation',
  },
  {
    title: 'FAANG Interview Questions and Patterns',
    description: 'Patterns and topics frequently tested by big tech companies.',
    link: 'https://www.interviewkickstart.com/interview-questions/faang-interview-questions',
  },
  {
    title: 'System Design Fundamentals',
    description: 'Core concepts and commonly asked system design topics.',
    link: 'https://www.educative.io/blog/complete-guide-to-system-design',
  },
  {
    title: 'Data Structures & Algorithms Refresher',
    description: 'A curated refresher of DSA essentials for coding interviews.',
    link: 'https://www.freecodecamp.org/news/the-top-data-structures-you-should-know-for-your-next-coding-interview-36af0831f5e3/',
  },
  {
    title: 'PM Interview: Latest Trends',
    description: 'Updated guidance on structured PM interviews.',
    link: 'https://www.productplan.com/learn/product-management-interview/',
  },
  {
    title: 'Negotiation Tactics from HBS',
    description: 'Evidence-based tactics to negotiate effectively.',
    link: 'https://online.hbs.edu/blog/post/salary-negotiation-tips',
  },
];

interface AnalyticsData {
  readinessScore: number
  readinessTrend: Array<{ date: string; score: number; session: number }>
  peerPercentile: number
  totalSessions: number
  completedSessions: number
  averageScore: number
  latestFeedback: {
    sessionId: string;
    date: string;
    score: number;
    grade: string;
    analysis?: {
      speech_analysis?: {
        pace_analysis?: { average_pace?: number };
        filler_words?: { total_count?: number };
      }
    }
  } | null;
}

interface UserProfile {
  credits: number
  readinessScore: number
}

interface MentorApplication {
  id: string
  status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  submittedAt: string
  reviewedAt?: string
  feedback?: string
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const [isRoleSwitching, setIsRoleSwitching] = useState(false)
  const userRole = session?.user?.role
  const router = useRouter()

  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const response = await fetch('/api/analytics/overview')
      if (!response.ok) throw new Error('Failed to fetch analytics')
      return response.json()
    },
    enabled: status === 'authenticated'
  })

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: async () => {
      // Mock data for now - would fetch from API
      return {
        credits: 85,
        readinessScore: analytics?.readinessScore || 72
      }
    },
    enabled: !!analytics && status === 'authenticated'
  })

  const { data: mentorApplication } = useQuery<MentorApplication>({
    queryKey: ['mentor-application'],
    queryFn: async () => {
      const response = await fetch('/api/mentor/application/status')
      if (!response.ok) {
        if (response.status === 404) {
          return null // No application found
        }
        throw new Error('Failed to fetch application status')
      }
      return response.json()
    },
    enabled: !!session?.user?.email && status === 'authenticated',
    retry: false
  })

  const handleLogout = async () => {
    await signOut({ 
      callbackUrl: '/',
      redirect: true 
    })
  }

  // If mentor has not submitted an application yet, redirect to mentor onboarding form
  useEffect(() => {
    if (status === 'authenticated' && userRole === 'INTERVIEWER' && mentorApplication === null) {
      router.replace('/onboarding/mentor')
    }
  }, [status, userRole, mentorApplication, router])

  // Show loading animation while checking authentication
  if (status === 'loading') {
    return <LoadingAnimation message="Loading your dashboard..." fullscreen />
  }

  // If user is a mentor and application exists but is not verified, show minimal pending screen only
  if (status === 'authenticated' && mentorApplication && mentorApplication.status !== 'VERIFIED') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-xl w-full">
          <div className="text-center mb-4 text-gray-900 text-xl font-semibold">
            {`Welcome back, ${session?.user?.name || 'Mentor'}!`}
          </div>
          <Card className="w-full border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <Clock className="w-5 h-5" /> Your application is under process
              </CardTitle>
              <CardDescription className="text-yellow-700">
                Your dashboard will be active once you've been accepted by admins.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end">
              <Button variant="outline" onClick={handleLogout}>Logout</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const lastThreeCount = (analytics as any)?.lastThreeCount ?? 0;
  const readinessLastThree = (analytics as any)?.readinessLastThree ?? null;
  const latestScore = typeof readinessLastThree === 'number' ? readinessLastThree : (analytics?.readinessScore || 0);
  const completedWithScores = (analytics as any)?.completedSessions ?? 0;
  const displayReadinessScore = typeof readinessLastThree === 'number'
    ? readinessLastThree
    : (analytics?.averageScore ?? analytics?.readinessScore ?? 0);
  const sessionsThisMonth = (analytics as any)?.sessionsThisMonth ?? 0;
  const peerPercentile = (analytics as any)?.peerPercentileLastThree ?? analytics?.peerPercentile ?? 0;


  const handleRoleSwitch = async (newRole: 'INTERVIEWEE' | 'INTERVIEWER' | 'BOTH') => {
    setIsRoleSwitching(true)
    try {
      const response = await fetch('/api/user/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (response.ok) {
        // Force a hard reload to refresh the session
        window.location.href = '/dashboard'
      }
    } catch (error) {
      console.error('Error switching role:', error)
    } finally {
      setIsRoleSwitching(false)
    }
  }

  const getScoreColor = (grade: string) => {
    if (['A+', 'A', 'A-'].includes(grade)) return 'text-green-600'
    if (['B+', 'B', 'B-'].includes(grade)) return 'text-blue-600'
    if (['C+', 'C', 'C-'].includes(grade)) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getApplicationStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>
      case 'VERIFIED':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>
      case 'REJECTED':
        return <Badge variant="outline" className="text-red-600 border-red-600"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>
      default:
        return null
    }
  }

  // Helpers for interviewee dashboard
  const getReadinessEmojiAndColor = (score: number) => {
    if (score >= 75) {
      return { emoji: '😀', color: 'text-green-600' }
    } else if (score >= 50) {
      return { emoji: '🤐', color: 'text-yellow-600' }
    }
    return { emoji: '😞', color: 'text-red-600' }
  }

  const getPercentileColor = (p: number) => {
    if (p >= 75) return 'text-green-600'
    if (p >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title={`Welcome back, ${session?.user?.name}!`}
        subtitle={userRole === 'INTERVIEWER' 
          ? 'Ready to help candidates improve their skills?' 
          : 'Ready to practice your conversation skills?'}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mentor Application Status */}
        {mentorApplication && mentorApplication.status === 'PENDING' && (
          <div className="mb-6">
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock className="h-5 w-5 text-yellow-600 mr-2" />
                    <div>
                      <p className="font-medium text-yellow-800">Mentor Application Under Review</p>
                      <p className="text-sm text-yellow-600">We're reviewing your application. You'll hear from us soon!</p>
                    </div>
                  </div>
                  {getApplicationStatusBadge(mentorApplication.status)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {userRole === 'INTERVIEWER' && mentorApplication?.status === 'VERIFIED' ? (
            // Expert Dashboard Metrics
            <>
              {/* Earnings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Monthly Earnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">
                      $2,450
                    </div>
                    <div className="text-sm text-muted-foreground">
                      This month
                    </div>
                    <div className="text-xs text-green-600 mt-2">
                      +15% from last month
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sessions Conducted */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sessions Conducted</CardTitle>
                  <CardDescription>Your mentoring impact</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">This Month</span>
                      <span className="font-semibold">24</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <span className="font-semibold">187</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Avg Rating</span>
                      <span className="font-semibold">4.8/5</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Upcoming Sessions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Upcoming Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">
                      7
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Next 7 days
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Next: Today 3:00 PM
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            // Interviewee Dashboard Metrics
            <>
              {/* Readiness Gauge */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Interview Readiness</CardTitle>
                  <CardDescription>
                    {typeof readinessLastThree === 'number' && lastThreeCount >= 3
                      ? 'Average of your last three completed sessions'
                      : 'Average across your completed sessions'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics && (completedWithScores > 0) ? (
                    <div className="text-center">
                      {(() => {
                        const { emoji, color } = getReadinessEmojiAndColor(displayReadinessScore as number)
                        return (
                          <div className="flex items-center justify-center gap-3 mb-2">
                            <span className="text-3xl" aria-hidden>{emoji}</span>
                            <span className={`text-3xl font-bold ${color}`}>{displayReadinessScore}%</span>
                          </div>
                        )
                      })()}
                      <div className="text-sm text-muted-foreground mb-4">
                        {typeof readinessLastThree === 'number' && lastThreeCount >= 3
                          ? 'Average of last 3 sessions'
                          : 'Average of completed sessions'}
                      </div>
                      <Progress value={displayReadinessScore || 0} className="w-full" />
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      Complete at least one session to see your readiness score
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Practice Sessions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Practice Sessions</CardTitle>
                  <CardDescription>Sessions completed this month</CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics && (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">This Month</span>
                        <span className="font-semibold">{sessionsThisMonth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">All Time</span>
                        <span className="font-semibold">{analytics.totalSessions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Avg Score</span>
                        <span className="font-semibold">{analytics.averageScore}%</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Peer Ranking */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Peer Ranking</CardTitle>
                </CardHeader>
                <CardContent>
                  {analytics && (completedWithScores > 0) ? (
                    <div className="text-center">
                      <div className={`text-3xl font-bold mb-2 ${getPercentileColor(peerPercentile as number)}`}>
                        {peerPercentile}%
                      </div>
                      <div className="text-sm text-muted-foreground">Better than peers</div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {typeof readinessLastThree === 'number' && lastThreeCount >= 3
                          ? 'Based on your last 3 sessions'
                          : 'Estimated based on your recent performance'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      Complete at least one session to see your peer percentile
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {userRole !== 'INTERVIEWER' && (
            <>
              <Link href="/practice/ai" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center">
                      <Brain className="h-8 w-8 text-blue-600 mr-3" />
                      <div>
                        <CardTitle>AI Practice Sessions</CardTitle>
                        <CardDescription>Practice with our AI interviewer</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-600">
                        Practice with our conversational AI interviewer
                      </div>
                      <Button variant="outline" size="sm">
                        Start Practice
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>


              <Link href="/history" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center">
                      <FileText className="h-8 w-8 text-green-600 mr-3" />
                      <div>
                        <CardTitle>Interview History</CardTitle>
                        <CardDescription>Review past sessions and analysis</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-600">
                        View detailed analysis and track progress
                      </div>
                      <Button variant="outline" size="sm">
                        View History
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/experts" className="block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center">
                      <Users className="h-8 w-8 text-purple-600 mr-3" />
                      <div>
                        <CardTitle>Book an Expert</CardTitle>
                        <CardDescription>Schedule with industry pros</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-600">
                        Get personalized feedback from verified experts
                      </div>
                      <Button variant="outline" size="sm">
                        Browse Experts
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </>
          )}
        </div>

        {/* Bottom Row - Additional Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Latest Feedback
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.latestFeedback ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Overall Score</span>
                    <div className="text-right">
                      <p className={`font-semibold ${getScoreColor(analytics.latestFeedback.grade)}`}>{analytics.latestFeedback.grade} ({analytics.latestFeedback.score}%)</p>
                    </div>
                  </div>
                  {analytics.latestFeedback.analysis?.speech_analysis?.pace_analysis?.average_pace != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Speaking Pace</span>
                      <span className="font-semibold">{Math.round(analytics.latestFeedback.analysis.speech_analysis.pace_analysis.average_pace)} WPM</span>
                    </div>
                  )}
                  {analytics.latestFeedback.analysis?.speech_analysis?.filler_words?.total_count != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Filler Words</span>
                      <span className="font-semibold">{analytics.latestFeedback.analysis.speech_analysis.filler_words.total_count}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Date</span>
                    <span>{new Date(analytics.latestFeedback.date).toLocaleDateString()}</span>
                  </div>
                  <Button asChild className="w-full !mt-4" size="sm">
                    <Link href={`/history/${analytics.latestFeedback.sessionId}`}>
                      View Full Report
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No recent feedback available.</p>
                  <p className="text-xs">Complete a session to see your feedback.</p>
                  <Button asChild className="mt-4" size="sm">
                    <Link href="/practice/ai">Start First Practice</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Library Picks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Recommended for You
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Show top ~4 with inner scroll for more */}
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                {readingMaterials.map((item, index) => (
                  <Link href={item.link} key={index} target="_blank" rel="noopener noreferrer" className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <h4 className="font-medium text-sm">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
