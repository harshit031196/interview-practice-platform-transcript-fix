'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Play, Filter, Video, Brain, User, Clock, Calendar } from 'lucide-react'
import { WingmanHeader } from '@/components/WingmanHeader'

interface Recording {
  id: string
  url: string
  durationSec: number
  consent: boolean
  session: {
    id: string
    type: string
    startedAt: string
    endedAt: string
    interviewee: { name: string }
    interviewer?: { name: string }
    jd?: { title: string }
  }
}

export default function RecordingsPage() {
  const [filter, setFilter] = useState('all')

  const { data: recordings, isLoading } = useQuery<Recording[]>({
    queryKey: ['recordings'],
    queryFn: async () => {
      const response = await fetch('/api/recordings')
      if (!response.ok) throw new Error('Failed to fetch recordings')
      return response.json()
    },
  })

  const filteredRecordings = recordings?.filter(recording => {
    if (filter === 'all') return true
    return recording.session.type.toLowerCase() === filter
  }) || []

  const handlePlayRecording = (recordingId: string) => {
    // In a real app, this would open a video player modal
    console.log('Playing recording:', recordingId)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title="Interview Recordings"
        subtitle="Review your past interview sessions"
        showBackButton={true}
        backHref="/dashboard"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-32 bg-gray-200 rounded"></div>
                    <div className="h-8 bg-gray-200 rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredRecordings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecordings.map((recording) => (
              <Card key={recording.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {recording.session.type === 'AI' && <Brain className="w-5 h-5 text-blue-600" />}
                        {recording.session.type === 'HUMAN' && <User className="w-5 h-5 text-green-600" />}
                        {recording.session.type === 'PEER' && <User className="w-5 h-5 text-purple-600" />}
                        {recording.session.jd?.title || `${recording.session.type} Interview`}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(recording.session.startedAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.floor(recording.durationSec / 60)}:{(recording.durationSec % 60).toString().padStart(2, '0')}
                        </span>
                      </CardDescription>
                    </div>
                    <Badge variant={recording.session.type === 'AI' ? 'secondary' : 'default'}>
                      {recording.session.type}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Video Thumbnail */}
                  <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center relative group cursor-pointer">
                    <div className="absolute inset-0 bg-black/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-12 h-12 text-white" />
                    </div>
                    <Video className="w-16 h-16 text-gray-400" />
                  </div>

                  {/* Session Details */}
                  <div className="space-y-2 text-sm">
                    {recording.session.interviewer && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Interviewer:</span>
                        <span>{recording.session.interviewer.name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span>{Math.floor(recording.durationSec / 60)}:{(recording.durationSec % 60).toString().padStart(2, '0')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Consent:</span>
                      <Badge variant={recording.consent ? 'default' : 'destructive'} className="text-xs">
                        {recording.consent ? 'Given' : 'Not Given'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handlePlayRecording(recording.id)}
                      className="flex-1"
                      disabled={!recording.consent}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Play
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.location.href = `/feedback/${recording.session.id}`}
                    >
                      View Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No recordings found</h3>
              <p className="text-muted-foreground mb-4">
                {filter === 'all' 
                  ? "You haven't completed any interview sessions yet."
                  : `No ${filter} sessions found. Try a different filter.`
                }
              </p>
              <Button onClick={() => window.location.href = '/practice/ai'}>
                Start Your First Interview
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-blue-900 mb-2">About Interview Recordings</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Recordings are only available if you gave consent during the session</li>
                  <li>• Click on chart spikes in feedback reports to jump to specific moments</li>
                  <li>• All recordings are securely stored and only accessible by you</li>
                  <li>• Use recordings to review your performance and track improvement over time</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
