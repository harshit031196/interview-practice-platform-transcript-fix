'use client'

import { Coins } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface CreditsBadgeProps {
  credits: number
  size?: 'sm' | 'md' | 'lg'
}

export function CreditsBadge({ credits, size = 'md' }: CreditsBadgeProps) {
  const isLow = credits < 20
  const variant = isLow ? 'destructive' : 'secondary'
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2'
  }

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  return (
    <Badge variant={variant} className={`flex items-center gap-1 ${sizeClasses[size]}`}>
      <Coins className={iconSizes[size]} />
      {credits} credits
      {isLow && <span className="ml-1 text-xs">(Low)</span>}
    </Badge>
  )
}
