'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserCheck, Users } from 'lucide-react'

interface RoleSelectorProps {
  onRoleSelect: (role: 'INTERVIEWEE' | 'INTERVIEWER' | 'BOTH') => void
  isLoading?: boolean
}

export function RoleSelector({ onRoleSelect, isLoading }: RoleSelectorProps) {
  const [selectedRole, setSelectedRole] = useState<'INTERVIEWEE' | 'INTERVIEWER' | 'BOTH' | null>(null)

  const handleRoleSelect = (role: 'INTERVIEWEE' | 'INTERVIEWER' | 'BOTH') => {
    setSelectedRole(role)
    onRoleSelect(role)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose Your Role</h2>
        <p className="text-muted-foreground mt-2">
          Select how you'd like to use the Interview Practice Platform
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedRole === 'INTERVIEWEE' ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => handleRoleSelect('INTERVIEWEE')}
        >
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <UserCheck className="w-6 h-6 text-blue-600" />
            </div>
            <CardTitle>Interviewee</CardTitle>
            <CardDescription>
              Practice interviews and get feedback to improve your skills
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• AI-powered interview practice</li>
              <li>• Book sessions with expert interviewers</li>
              <li>• Get detailed feedback reports</li>
              <li>• Track your progress over time</li>
            </ul>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedRole === 'INTERVIEWER' ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => handleRoleSelect('INTERVIEWER')}
        >
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <CardTitle>Interviewer</CardTitle>
            <CardDescription>
              Conduct interviews and help others improve their skills
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Set your availability and expertise</li>
              <li>• Conduct mock interviews</li>
              <li>• Provide valuable feedback</li>
              <li>• Earn money helping others</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="text-center">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md max-w-md mx-auto ${
            selectedRole === 'BOTH' ? 'ring-2 ring-primary' : ''
          }`}
          onClick={() => handleRoleSelect('BOTH')}
        >
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <div className="flex">
                <UserCheck className="w-5 h-5 text-purple-600 -mr-1" />
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <CardTitle>Both Roles</CardTitle>
            <CardDescription>
              Practice interviews and help others as an interviewer
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {selectedRole && (
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            You can always change your role later in your profile settings
          </p>
          <Button 
            onClick={() => onRoleSelect(selectedRole)}
            disabled={isLoading}
            size="lg"
          >
            {isLoading ? 'Setting up...' : `Continue as ${selectedRole === 'BOTH' ? 'Both' : selectedRole === 'INTERVIEWEE' ? 'Interviewee' : 'Interviewer'}`}
          </Button>
        </div>
      )}
    </div>
  )
}
