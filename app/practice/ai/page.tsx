'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Brain, Mic, Video, Clock, Coins } from 'lucide-react'
import { WingmanHeader } from '@/components/WingmanHeader'

export default function AIPracticePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  
  const [settings, setSettings] = useState({
    interviewType: 'behavioral',
    difficulty: 'medium',
    duration: [10],
    jdId: '',
    allowHints: true,
    showTimer: true,
  })

  const interviewTypes = [
    { value: 'behavioral', label: 'Behavioral', description: 'STAR method, leadership, teamwork' },
    { value: 'technical', label: 'Technical', description: 'Coding, algorithms, system design' },
    { value: 'product', label: 'Product', description: 'Strategy, metrics, user research' },
    { value: 'system-design', label: 'System Design', description: 'Architecture, scalability, trade-offs' },
  ]

  const difficulties = [
    { value: 'easy', label: 'Easy', description: 'Entry level questions' },
    { value: 'medium', label: 'Medium', description: 'Mid-level complexity' },
    { value: 'hard', label: 'Hard', description: 'Senior level challenges' },
  ]

  const creditCost = settings.duration[0] <= 15 ? 10 : settings.duration[0] <= 30 ? 15 : 20

  const handleStartSession = async () => {
    if (!settings.interviewType || !settings.difficulty) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/ai/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewType: settings.interviewType,
          difficulty: settings.difficulty,
          duration: settings.duration[0],
          isConversational: true,
          jdId: settings.jdId || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start session')
      }

      const { sessionId } = await response.json()
      console.log('Session created:', sessionId, 'isConversational: true')
      
      // Redirect to the session page which will handle conversational interviews
      router.push(`/practice/ai/session/${sessionId}`)
    } catch (error) {
      console.error('Error starting session:', error)
      alert(`Failed to start interview: ${error instanceof Error ? error.message : 'Please check your connection and try again.'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const canStart = settings.interviewType && settings.difficulty

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title="AI Interview Practice"
        subtitle="Get instant feedback with our AI interviewer"
        showBackButton={true}
        backHref="/dashboard"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Interview Type */}
            <Card>
              <CardHeader>
                <CardTitle>Interview Type</CardTitle>
                <CardDescription>Choose the type of interview you want to practice</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {interviewTypes.map((type) => (
                    <div
                      key={type.value}
                      className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                        settings.interviewType === type.value
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200'
                      }`}
                      onClick={() => setSettings({ ...settings, interviewType: type.value })}
                    >
                      <h3 className="font-medium">{type.label}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Difficulty & Duration */}
            <Card>
              <CardHeader>
                <CardTitle>Session Settings</CardTitle>
                <CardDescription>Configure your practice session</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Difficulty Level</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {difficulties.map((diff) => (
                      <div
                        key={diff.value}
                        className={`p-3 border rounded-lg cursor-pointer text-center transition-all ${
                          settings.difficulty === diff.value
                            ? 'border-primary bg-primary/5'
                            : 'border-gray-200'
                        }`}
                        onClick={() => setSettings({ ...settings, difficulty: diff.value })}
                      >
                        <div className="font-medium">{diff.label}</div>
                        <div className="text-xs text-muted-foreground mt-1">{diff.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Duration</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {[5, 10].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setSettings({ ...settings, duration: [mins] })}
                        className={`p-3 border rounded-lg text-center transition-all ${settings.duration[0] === mins ? 'border-primary bg-primary/5' : 'border-gray-200'}`}
                      >
                        <div className="font-medium">{mins} minutes</div>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Interview Features */}
            <Card>
              <CardHeader>
                <CardTitle>AI Interview Features</CardTitle>
                <CardDescription>Experience our advanced conversational AI interviewer</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border-2 border-primary bg-primary/5 rounded-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <Mic className="w-5 h-5 text-purple-600" />
                      <div className="font-medium">Conversational AI Interview</div>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Real-time voice conversation with AI interviewer
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Dynamic follow-up questions based on your responses
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        Comprehensive video and speech analysis
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                        STAR method feedback and improvement tips
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Cost & Start */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  Session Cost
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-4">
                  <div className="text-3xl font-bold text-primary">{creditCost} credits</div>
                  <div className="text-sm text-muted-foreground">
                    {settings.duration[0]} minute {settings.difficulty} {settings.interviewType} interview
                  </div>
                  
                  <Button
                    onClick={handleStartSession}
                    disabled={!canStart || isLoading}
                    className="w-full"
                    size="lg"
                  >
                    {isLoading ? 'Starting...' : 'Start Interview'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Permissions Check */}
            <Card>
              <CardHeader>
                <CardTitle>Before You Start</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mic className="w-4 h-4 text-green-600" />
                    <span>Microphone access required</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Video className="w-4 h-4 text-green-600" />
                    <span>Camera access required for video recording</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Find a quiet environment</span>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-800">
                    💡 <strong>Tip:</strong> Treat this like a real interview. Speak clearly and take your time to think through answers.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Recent Practice removed */}
          </div>
        </div>
      </div>
    </div>
  )
}
