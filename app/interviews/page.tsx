'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { WingmanHeader } from '@/components/WingmanHeader'
import { Calendar, Clock, User, Brain, Play, Eye } from 'lucide-react'
import Link from 'next/link'

interface Interview {
  id: string
  type: string
  interviewType?: string
  difficulty?: string
  duration?: number
  status: string
  createdAt: string
  hasFeedback: boolean
  overallScore?: number
}

export default function InterviewsPage() {
  const { data: session } = useSession()
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchInterviews()
  }, [])

  const fetchInterviews = async () => {
    try {
      const response = await fetch('/api/interviews')
      if (response.ok) {
        const data = await response.json()
        setInterviews(data.interviews || [])
      }
    } catch (error) {
      console.error('Error fetching interviews:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800'
      case 'SCHEDULED': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading interviews...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title="Interview History"
        subtitle="View your past interviews and feedback"
        showBackButton={true}
        backHref="/dashboard"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Quick Actions */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-2 border-dashed border-blue-300 hover:border-blue-400 transition-colors">
            <CardContent className="pt-6">
              <div className="text-center">
                <Brain className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Start AI Interview</h3>
                <p className="text-gray-600 mb-4">Practice with our AI interviewer</p>
                <Button asChild className="w-full">
                  <Link href="/practice/ai">
                    <Play className="w-4 h-4 mr-2" />
                    Start Practice
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-dashed border-green-300 hover:border-green-400 transition-colors">
            <CardContent className="pt-6">
              <div className="text-center">
                <User className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Book Expert Session</h3>
                <p className="text-gray-600 mb-4">Get feedback from real interviewers</p>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/experts">
                    <Calendar className="w-4 h-4 mr-2" />
                    Browse Experts
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Interview History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Interviews</CardTitle>
            <CardDescription>
              {interviews.length === 0 
                ? "No interviews yet. Start your first practice session!"
                : `${interviews.length} interview${interviews.length === 1 ? '' : 's'} completed`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {interviews.length === 0 ? (
              <div className="text-center py-12">
                <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews yet</h3>
                <p className="text-gray-500 mb-6">Start practicing to see your interview history here</p>
                <Button asChild>
                  <Link href="/practice/ai">Start Your First Interview</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {interviews.map((interview) => (
                  <div key={interview.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            {interview.type === 'AI' ? (
                              <Brain className="w-5 h-5 text-blue-600" />
                            ) : (
                              <User className="w-5 h-5 text-green-600" />
                            )}
                            <span className="font-medium">
                              {interview.type} Interview
                            </span>
                          </div>
                          
                          <Badge className={getStatusColor(interview.status)}>
                            {interview.status.replace('_', ' ')}
                          </Badge>
                          
                          {interview.hasFeedback && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Feedback Available
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          {interview.interviewType && (
                            <span>{interview.interviewType}</span>
                          )}
                          {interview.difficulty && (
                            <span>{interview.difficulty}</span>
                          )}
                          {interview.duration && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{interview.duration} min</span>
                            </div>
                          )}
                          <span>{formatDate(interview.createdAt)}</span>
                        </div>
                        
                        {interview.overallScore && (
                          <div className="mt-2">
                            <span className="text-sm text-gray-600">Overall Score: </span>
                            <span className="font-semibold text-blue-600">{interview.overallScore}%</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {interview.hasFeedback && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/feedback/${interview.id}`}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Feedback
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
