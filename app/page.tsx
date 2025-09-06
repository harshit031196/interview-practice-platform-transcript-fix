'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LoadingAnimation } from '@/components/LoadingAnimation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthModal } from '@/components/AuthModal'
import { Brain, Users, TrendingUp, Star, CheckCircle } from 'lucide-react'

export default function LandingPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signup')
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated' && session) {
      router.push('/dashboard')
    }
  }, [status, session, router])

  const openAuthModal = (tab: 'signin' | 'signup') => {
    setAuthTab(tab)
    setAuthModalOpen(true)
  }

  // Typewriter/backspace effect for hero section
  const text1 = 'Worried about your next interview?'
  const text2 = 'Wingman is here to help you get your dream job'
  const [displayText, setDisplayText] = useState('')
  const [phase, setPhase] = useState<'typing1' | 'holding1' | 'backspacing1' | 'typing2' | 'done'>('typing1')

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const typeDelay = 50
    const eraseDelay = 35
    const holdDelay = 900

    if (phase === 'typing1') {
      if (displayText.length < text1.length) {
        t = setTimeout(() => setDisplayText(text1.slice(0, displayText.length + 1)), typeDelay)
      } else {
        t = setTimeout(() => setPhase('holding1'), holdDelay)
      }
    } else if (phase === 'holding1') {
      t = setTimeout(() => setPhase('backspacing1'), holdDelay)
    } else if (phase === 'backspacing1') {
      if (displayText.length > 0) {
        t = setTimeout(() => setDisplayText(displayText.slice(0, -1)), eraseDelay)
      } else {
        setPhase('typing2')
      }
    } else if (phase === 'typing2') {
      if (displayText.length < text2.length) {
        t = setTimeout(() => setDisplayText(text2.slice(0, displayText.length + 1)), typeDelay)
      } else {
        setPhase('done')
      }
    }

    return () => { if (t) clearTimeout(t) }
  }, [phase, displayText])

  // Show loading while checking authentication
  if (status === 'loading') {
    return <LoadingAnimation fullscreen message="Loading..." />
  }

  // Don't render landing page if user is authenticated
  if (status === 'authenticated') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/images/wingman-logo.png" 
              alt="Wingman Logo" 
              className="w-12 h-12"
            />
            <span className="text-3xl font-bold">Wingman</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => openAuthModal('signin')}>
              Sign In
            </Button>
            <Button onClick={() => openAuthModal('signup')}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Wingman's got your back!
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Get coached by Superintelligent AI that sees and hears what others miss
          </p>
          
          {/* Typewriter / keyboard effect */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8 mx-auto max-w-2xl">
            <div className="min-h-[3rem] text-2xl md:text-3xl font-semibold text-gray-900 text-center">
              {displayText}
              <span className={`inline-block align-middle w-[2px] h-6 ml-1 bg-gray-800 ${phase !== 'done' ? 'animate-blink' : ''}`} />
            </div>
            <style jsx>{`
              @keyframes blink { 0% { opacity: 1 } 50% { opacity: 0 } 100% { opacity: 1 } }
              .animate-blink { animation: blink 1s step-start infinite; }
            `}</style>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => openAuthModal('signup')} className="text-lg px-8 py-3">
              Start Practicing Free
            </Button>
            <Button size="lg" variant="outline" onClick={() => openAuthModal('signin')} className="text-lg px-8 py-3">
              Continue as Guest
            </Button>
          </div>
        </div>
      </section>

      {/* Value Proposition Cards */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain className="w-8 h-8 text-blue-600" />
              </div>
              <CardTitle className="text-xl">AI-Powered Practice</CardTitle>
              <CardDescription>
                Practice with intelligent AI that adapts to your skill level and provides real-time feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-left space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Personalized question sets
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Voice and speech analysis
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Instant feedback reports
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-xl">Expert Interviewers</CardTitle>
              <CardDescription>
                Book sessions with verified industry professionals from top companies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-left space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  FAANG+ company experts
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Industry-specific guidance
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Detailed written feedback
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
              <CardTitle className="text-xl">Track Progress</CardTitle>
              <CardDescription>
                Monitor your improvement with detailed analytics and readiness scores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-left space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Readiness score tracking
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Skill-based analytics
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Peer comparisons
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Trusted by Job Seekers Worldwide
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">10,000+</div>
              <div className="text-gray-600">Successful Interviews</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">500+</div>
              <div className="text-gray-600">Expert Interviewers</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-6 h-6 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <div className="text-gray-600">4.9/5 Average Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-primary-foreground mb-4">
            Ready to Ace Your Next Interview?
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join thousands of successful job seekers who improved their interview skills with our platform.
          </p>
          <Button 
            size="lg" 
            variant="secondary" 
            onClick={() => openAuthModal('signup')}
            className="text-lg px-8 py-3"
          >
            Start Your Free Trial
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img 
                  src="/images/wingman-logo.png" 
                  alt="Wingman Logo" 
                  className="w-12 h-12"
                />
                <span className="text-3xl font-bold">Wingman</span>
              </div>
              <p className="text-gray-400">
                Helps you prepare for difficult conversations.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li>AI Practice</li>
                <li>Expert Sessions</li>
                <li>Progress Tracking</li>
                <li>Feedback Reports</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li>About Us</li>
                <li>Careers</li>
                <li>Contact</li>
                <li>Blog</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li>Help Center</li>
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
                <li>Status</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Wingman. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <AuthModal 
        open={authModalOpen} 
        onOpenChange={setAuthModalOpen}
        defaultTab={authTab}
      />
    </div>
  )
}
