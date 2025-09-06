'use client'
import { useSession, signOut } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CreditsBadge } from '@/components/CreditsBadge'
import { LogOut, ArrowLeft } from 'lucide-react'

interface WingmanHeaderProps {
  showBackButton?: boolean
  backHref?: string
  className?: string
  title?: string
  subtitle?: string
  showUserControls?: boolean
}

interface UserProfile {
  credits: number
  readinessScore: number
}

export function WingmanHeader({ 
  showBackButton = false, 
  backHref = '/', 
  className = '',
  title,
  subtitle,
  showUserControls = true
}: WingmanHeaderProps) {
  const { data: session } = useSession()

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: async () => {
      return {
        credits: 85,
        readinessScore: 72
      }
    },
    enabled: !!session?.user?.email && showUserControls
  })

  const handleLogout = async () => {
    await signOut({ 
      callbackUrl: '/',
      redirect: true 
    })
  }

  return (
    <header className={`bg-white shadow-sm border-b ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center gap-4">
            {showBackButton && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
            )}
            <Link href="/dashboard" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
              <img 
                src="/images/wingman-logo.png" 
                alt="Wingman Logo" 
                className="w-16 h-16"
              />
              <span className="text-4xl font-bold text-gray-900">Wingman</span>
            </Link>
            {title && (
              <div className="ml-4">
                <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
                {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
              </div>
            )}
          </div>
          
          {showUserControls && session && (
            <div className="flex items-center gap-4">
              {profile && <CreditsBadge credits={profile.credits} />}

              <Button 
                variant="outline" 
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
