'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { X, Plus } from 'lucide-react'

const mentorApplicationSchema = z.object({
  bio: z.string().min(50, 'Bio must be at least 50 characters'),
  yearsExp: z.number().min(1, 'Years of experience must be at least 1'),
  currentCompany: z.string().min(1, 'Current company is required'),
  currentRole: z.string().min(1, 'Current role is required'),
  linkedinUrl: z.string().url('Please enter a valid LinkedIn URL').optional().or(z.literal('')),
  expertiseTags: z.array(z.string()).min(1, 'At least one expertise tag is required'),
})

type MentorApplicationForm = z.infer<typeof mentorApplicationSchema>

export default function MentorOnboardingPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [expertiseTags, setExpertiseTags] = useState<string[]>([])
  const { data: session } = useSession()
  const router = useRouter()

  const form = useForm<MentorApplicationForm>({
    resolver: zodResolver(mentorApplicationSchema),
    defaultValues: {
      expertiseTags: [],
    }
  })

  const addExpertiseTag = () => {
    if (newTag.trim() && !expertiseTags.includes(newTag.trim())) {
      const updatedTags = [...expertiseTags, newTag.trim()]
      setExpertiseTags(updatedTags)
      form.setValue('expertiseTags', updatedTags)
      setNewTag('')
    }
  }

  const removeExpertiseTag = (tagToRemove: string) => {
    const updatedTags = expertiseTags.filter(tag => tag !== tagToRemove)
    setExpertiseTags(updatedTags)
    form.setValue('expertiseTags', updatedTags)
  }

  const handleSubmit = async (data: MentorApplicationForm) => {
    if (!session?.user?.email) {
      router.push('/auth/signin')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/mentor/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          expertiseTags,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to submit application')
      }

      // Force a page reload to refresh the session with new role
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <img 
              src="/images/wingman-logo.png" 
              alt="Wingman Logo" 
              className="w-16 h-16"
            />
            <span className="text-4xl font-bold text-gray-900">Wingman</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Become a Mentor
          </h1>
          <p className="text-lg text-gray-600">
            Help others succeed while sharing your expertise
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mentor Application</CardTitle>
            <CardDescription>
              Tell us about your experience and expertise. We'll review your application and get back to you within 2-3 business days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio">Professional Bio *</Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us about your professional background, achievements, and what makes you a great mentor..."
                  className="min-h-[120px]"
                  {...form.register('bio')}
                  disabled={isLoading}
                />
                {form.formState.errors.bio && (
                  <p className="text-sm text-red-600">{form.formState.errors.bio.message}</p>
                )}
              </div>

              {/* Years of Experience */}
              <div className="space-y-2">
                <Label htmlFor="yearsExp">Years of Professional Experience *</Label>
                <Input
                  id="yearsExp"
                  type="number"
                  min="1"
                  {...form.register('yearsExp', { valueAsNumber: true })}
                  disabled={isLoading}
                />
                {form.formState.errors.yearsExp && (
                  <p className="text-sm text-red-600">{form.formState.errors.yearsExp.message}</p>
                )}
              </div>

              {/* Current Company */}
              <div className="space-y-2">
                <Label htmlFor="currentCompany">Current Company *</Label>
                <Input
                  id="currentCompany"
                  placeholder="e.g., Google, Microsoft, Meta"
                  {...form.register('currentCompany')}
                  disabled={isLoading}
                />
                {form.formState.errors.currentCompany && (
                  <p className="text-sm text-red-600">{form.formState.errors.currentCompany.message}</p>
                )}
              </div>

              {/* Current Role */}
              <div className="space-y-2">
                <Label htmlFor="currentRole">Current Role *</Label>
                <Input
                  id="currentRole"
                  placeholder="e.g., Senior Software Engineer, Product Manager"
                  {...form.register('currentRole')}
                  disabled={isLoading}
                />
                {form.formState.errors.currentRole && (
                  <p className="text-sm text-red-600">{form.formState.errors.currentRole.message}</p>
                )}
              </div>

              {/* LinkedIn URL */}
              <div className="space-y-2">
                <Label htmlFor="linkedinUrl">LinkedIn Profile URL</Label>
                <Input
                  id="linkedinUrl"
                  placeholder="https://linkedin.com/in/yourprofile"
                  {...form.register('linkedinUrl')}
                  disabled={isLoading}
                />
                {form.formState.errors.linkedinUrl && (
                  <p className="text-sm text-red-600">{form.formState.errors.linkedinUrl.message}</p>
                )}
              </div>

              {/* Expertise Tags */}
              <div className="space-y-2">
                <Label>Areas of Expertise *</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., System Design, JavaScript, Product Strategy"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addExpertiseTag())}
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addExpertiseTag}
                    disabled={isLoading || !newTag.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                {expertiseTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {expertiseTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeExpertiseTag(tag)}
                          className="ml-1 hover:text-red-600"
                          disabled={isLoading}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                
                {form.formState.errors.expertiseTags && (
                  <p className="text-sm text-red-600">{form.formState.errors.expertiseTags.message}</p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/auth/role-selection')}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || expertiseTags.length === 0}
                  className="flex-1"
                >
                  {isLoading ? 'Submitting Application...' : 'Submit Application'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 bg-green-50 border-green-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-green-800 mb-2">What happens next?</h3>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• We'll review your application within 2-3 business days</li>
              <li>• If approved, you'll get access to your mentor dashboard</li>
              <li>• You can set your availability and start helping mentees</li>
              <li>• Track your application status in your dashboard</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
