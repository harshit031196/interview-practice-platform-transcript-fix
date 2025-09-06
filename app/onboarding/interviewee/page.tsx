'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkillChips } from '@/components/SkillChips'
import { SelfRatingSlider } from '@/components/SelfRatingSlider'
import { Progress } from '@/components/ui/progress'
import { WingmanHeader } from '@/components/WingmanHeader'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Skill {
  name: string
  self: number
}

const SKILL_SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'System Design',
  'Product Strategy', 'Data Analysis', 'User Research', 'Project Management', 'Leadership',
  'Communication', 'Problem Solving', 'SQL', 'AWS', 'Docker', 'Kubernetes'
]

export default function IntervieweeOnboardingPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  // Form data
  const [formData, setFormData] = useState({
    currentRole: '',
    yearsExp: '',
    industry: '',
    skills: [] as Skill[],
    targetRoles: [] as string[],
    targetRoleInput: '',
  })

  const totalSteps = 4
  const progress = (currentStep / totalSteps) * 100

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      // Create interviewee profile
      const response = await fetch('/api/profile/interviewee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentRole: formData.currentRole,
          yearsExp: parseInt(formData.yearsExp),
          industry: formData.industry,
          skills: formData.skills,
          targetRoles: formData.targetRoles,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create profile')
      }

      router.push('/dashboard')
    } catch (error) {
      console.error('Error creating profile:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addTargetRole = () => {
    if (formData.targetRoleInput.trim() && !formData.targetRoles.includes(formData.targetRoleInput.trim())) {
      setFormData({
        ...formData,
        targetRoles: [...formData.targetRoles, formData.targetRoleInput.trim()],
        targetRoleInput: ''
      })
    }
  }

  const removeTargetRole = (role: string) => {
    setFormData({
      ...formData,
      targetRoles: formData.targetRoles.filter(r => r !== role)
    })
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.currentRole && formData.yearsExp && formData.industry
      case 2:
        return formData.skills.length > 0
      case 3:
        return formData.skills.every(skill => skill.self > 0)
      case 4:
        return formData.targetRoles.length > 0
      default:
        return false
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Wingman Header */}
        <div className="mb-8">
          <WingmanHeader showBackButton backHref="/auth/role-selection" className="mb-6" showUserControls={false} />
        </div>
        
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold">Complete Your Profile</h1>
            <span className="text-lg text-muted-foreground">
              Step {currentStep} of {totalSteps}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {currentStep === 1 && 'Basic Information'}
              {currentStep === 2 && 'Your Skills'}
              {currentStep === 3 && 'Rate Your Skills'}
              {currentStep === 4 && 'Target Roles'}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 && 'Tell us about your current role and experience'}
              {currentStep === 2 && 'Add skills relevant to your target roles'}
              {currentStep === 3 && 'Rate your proficiency level for each skill'}
              {currentStep === 4 && 'What roles are you targeting?'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentRole">Current Role</Label>
                  <Input
                    id="currentRole"
                    placeholder="e.g., Software Engineer, Product Manager"
                    value={formData.currentRole}
                    onChange={(e) => setFormData({ ...formData, currentRole: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="yearsExp">Years of Experience</Label>
                  <Select
                    value={formData.yearsExp}
                    onValueChange={(value) => setFormData({ ...formData, yearsExp: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select experience level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0-1 years</SelectItem>
                      <SelectItem value="2">2-3 years</SelectItem>
                      <SelectItem value="4">4-5 years</SelectItem>
                      <SelectItem value="6">6-8 years</SelectItem>
                      <SelectItem value="9">9-12 years</SelectItem>
                      <SelectItem value="13">13+ years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select
                    value={formData.industry}
                    onValueChange={(value) => setFormData({ ...formData, industry: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Technology">Technology</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Healthcare">Healthcare</SelectItem>
                      <SelectItem value="Consulting">Consulting</SelectItem>
                      <SelectItem value="E-commerce">E-commerce</SelectItem>
                      <SelectItem value="Media">Media & Entertainment</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 2: Skills */}
            {currentStep === 2 && (
              <SkillChips
                skills={formData.skills}
                onSkillsChange={(skills) => setFormData({ ...formData, skills })}
                suggestions={SKILL_SUGGESTIONS}
              />
            )}

            {/* Step 3: Skill Ratings */}
            {currentStep === 3 && (
              <SelfRatingSlider
                skills={formData.skills}
                onSkillsChange={(skills) => setFormData({ ...formData, skills })}
              />
            )}

            {/* Step 4: Target Roles */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="targetRole">Add Target Role</Label>
                  <div className="flex gap-2">
                    <Input
                      id="targetRole"
                      placeholder="e.g., Senior Software Engineer"
                      value={formData.targetRoleInput}
                      onChange={(e) => setFormData({ ...formData, targetRoleInput: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && addTargetRole()}
                    />
                    <Button onClick={addTargetRole} disabled={!formData.targetRoleInput.trim()}>
                      Add
                    </Button>
                  </div>
                </div>

                {formData.targetRoles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Target Roles</Label>
                    <div className="flex flex-wrap gap-2">
                      {formData.targetRoles.map((role) => (
                        <div
                          key={role}
                          className="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-md"
                        >
                          {role}
                          <button
                            onClick={() => removeTargetRole(role)}
                            className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          {/* Navigation */}
          <div className="flex justify-between p-6 pt-0">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Button
              onClick={handleNext}
              disabled={!canProceed() || isLoading}
            >
              {currentStep === totalSteps ? (
                isLoading ? 'Creating Profile...' : 'Complete Setup'
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
