'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type SignInForm = z.infer<typeof signInSchema>

function SignInPageContent() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  const form = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
  })

  useEffect(() => {
    // Check if user is already signed in
    getSession().then((session) => {
      if (session) {
        router.push(callbackUrl)
      }
    })
  }, [router, callbackUrl])

  const handleSignIn = async (data: SignInForm) => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('🔄 Starting sign in process for:', data.email)
      
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
        callbackUrl: callbackUrl,
      })

      console.log('📝 Sign in result:', { ok: result?.ok, error: result?.error })

      if (result?.error) {
        throw new Error('Invalid email or password')
      }

      if (result?.ok) {
        // For database sessions, wait longer with exponential backoff
        let session = null
        let retries = 0
        const maxRetries = 8
        
        while (!session && retries < maxRetries) {
          const delay = Math.min(200 * Math.pow(1.5, retries), 2000) // Exponential backoff with 2s max
          console.log(`⏱️ Waiting ${delay}ms for session (attempt ${retries + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          session = await getSession()
          console.log('🔍 Session check result:', session ? 'Found' : 'Not found')
          retries++
        }
        
        if (session) {
          console.log('✅ Session created successfully:', session.user?.email)
          router.push(callbackUrl)
          return
        } else {
          console.error('❌ Session creation failed after', maxRetries, 'retries')
          
          // Try one more time with direct navigation
          console.log('🔄 Attempting direct navigation to:', callbackUrl)
          router.push(callbackUrl)
          return
        }
      } else {
        throw new Error('Authentication failed')
      }
    } catch (err) {
      console.error('❌ Sign in error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'microsoft') => {
    setIsLoading(true)
    try {
      await signIn(provider, { callbackUrl })
    } catch (err) {
      setError('Failed to sign in with ' + provider)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Or{' '}
            <Link href="/auth/signup" className="font-medium text-primary hover:text-primary/80">
              create a new account
            </Link>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={form.handleSubmit(handleSignIn)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register('email')}
                  disabled={isLoading}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...form.register('password')}
                  disabled={isLoading}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => handleOAuthSignIn('google')}
                disabled={isLoading}
              >
                Google
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOAuthSignIn('microsoft')}
                disabled={isLoading}
              >
                Microsoft
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-600">Loading sign-in...</div>
        </div>
      }
    >
      <SignInPageContent />
    </Suspense>
  )
}
