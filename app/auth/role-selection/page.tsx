'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, GraduationCap } from 'lucide-react'

export default function RoleSelectionPage() {
  const [isLoading, setIsLoading] = useState(false)
  const { data: session } = useSession()
  const router = useRouter()

  const handleRoleSelection = async (role: 'INTERVIEWEE' | 'INTERVIEWER') => {
    if (!session?.user?.email) {
      router.push('/auth/signin')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/user/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      if (!response.ok) {
        throw new Error('Failed to set role')
      }

      // Redirect based on role selection
      if (role === 'INTERVIEWEE') {
        router.push('/onboarding/interviewee')
      } else {
        router.push('/onboarding/mentor')
      }
    } catch (error) {
      console.error('Error setting role:', error)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-6">
            <img 
              src="/images/wingman-logo.png" 
              alt="Wingman Logo" 
              className="w-20 h-20"
            />
            <span className="text-5xl font-bold text-gray-900">Wingman</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Choose Your Path
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Are you looking to practice interviews or help others by becoming a mentor?
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Mentee Card */}
          <Card className="relative overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-blue-500">
            <div 
              className="absolute inset-0 bg-gradient-to-br from-blue-50 to-blue-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              onClick={() => handleRoleSelection('INTERVIEWEE')}
            />
            <CardContent className="relative p-8 text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-blue-200 transition-colors">
                <GraduationCap className="w-10 h-10 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">I'm a Mentee</h2>
              <p className="text-gray-600 mb-6">
                I want to practice interviews, get feedback, and improve my skills with AI and expert mentors.
              </p>
              <ul className="text-sm text-left space-y-2 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  Practice with AI interviews
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  Book sessions with expert mentors
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  Track progress and get detailed feedback
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  Access curated learning resources
                </li>
              </ul>
              <Button 
                onClick={() => handleRoleSelection('INTERVIEWEE')}
                disabled={isLoading}
                className="w-full group-hover:bg-blue-600"
              >
                {isLoading ? 'Setting up...' : 'Continue as Mentee'}
              </Button>
            </CardContent>
          </Card>

          {/* Mentor Card */}
          <Card className="relative overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-green-500">
            <div 
              className="absolute inset-0 bg-gradient-to-br from-green-50 to-green-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              onClick={() => handleRoleSelection('INTERVIEWER')}
            />
            <CardContent className="relative p-8 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-green-200 transition-colors">
                <Users className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">I want to be a Mentor</h2>
              <p className="text-gray-600 mb-6">
                I want to help others by conducting mock interviews and sharing my industry experience.
              </p>
              <ul className="text-sm text-left space-y-2 mb-8">
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Share your industry expertise
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Conduct mock interviews
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Earn money helping others
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Flexible scheduling
                </li>
              </ul>
              <Button 
                onClick={() => handleRoleSelection('INTERVIEWER')}
                disabled={isLoading}
                variant="outline"
                className="w-full group-hover:bg-green-600 group-hover:text-white group-hover:border-green-600"
              >
                {isLoading ? 'Setting up...' : 'Apply to be a Mentor'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer Note */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            Don't worry, you can always switch between roles later in your dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
