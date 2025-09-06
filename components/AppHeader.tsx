'use client'

import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface AppHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  showBackButton?: boolean
  backHref?: string
  rightContent?: React.ReactNode
}

export function AppHeader({ 
  title, 
  subtitle, 
  icon, 
  showBackButton = false, 
  backHref = '/dashboard',
  rightContent 
}: AppHeaderProps) {
  const { data: session } = useSession()

  const handleLogout = async () => {
    await signOut({ 
      callbackUrl: '/',
      redirect: true 
    })
  }

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
            )}
            {icon && (
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                {icon}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              {subtitle && <p className="text-gray-600">{subtitle}</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {rightContent}
            {session && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
