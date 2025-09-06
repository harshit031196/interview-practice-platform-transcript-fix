'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getReadinessColor } from '@/lib/utils'

interface MiniTrendProps {
  current: number
  previous: number
  label?: string
}

export function MiniTrend({ current, previous, label = 'Score' }: MiniTrendProps) {
  const change = current - previous
  const isPositive = change > 0
  const isNeutral = change === 0
  
  const TrendIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown
  const trendColor = isNeutral ? 'text-gray-500' : isPositive ? 'text-green-600' : 'text-red-600'
  
  return (
    <div className="flex items-center gap-2">
      <div className={`${getReadinessColor(current)} font-semibold`}>
        {current}
      </div>
      <div className={`flex items-center gap-1 ${trendColor}`}>
        <TrendIcon className="h-3 w-3" />
        <span className="text-xs">
          {isNeutral ? '0' : `${isPositive ? '+' : ''}${change}`}
        </span>
      </div>
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </div>
  )
}
