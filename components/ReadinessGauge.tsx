'use client'

import { Progress } from '@/components/ui/progress'
import { getReadinessColor, getReadinessBgColor } from '@/lib/utils'

interface ReadinessGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function ReadinessGauge({ score, size = 'md', showLabel = true }: ReadinessGaugeProps) {
  const getScoreText = (score: number) => {
    if (score >= 75) return 'Ready'
    if (score >= 50) return 'Getting There'
    return 'Needs Work'
  }

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-4',
    lg: 'h-6'
  }

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  }

  return (
    <div className="space-y-2">
      {showLabel && (
        <div className="flex justify-between items-center">
          <span className={`font-medium ${textSizeClasses[size]}`}>
            Interview Readiness
          </span>
          <span className={`${getReadinessColor(score)} font-semibold ${textSizeClasses[size]}`}>
            {score}% - {getScoreText(score)}
          </span>
        </div>
      )}
      
      <div className="relative">
        <Progress 
          value={score} 
          className={`${sizeClasses[size]} ${getReadinessBgColor(score)}`}
        />
        
        {/* Threshold markers */}
        <div className="absolute top-0 left-1/2 w-px h-full bg-gray-300 opacity-50" />
        <div className="absolute top-0 left-3/4 w-px h-full bg-gray-300 opacity-50" />
        
        {size !== 'sm' && (
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        )}
      </div>
    </div>
  )
}
