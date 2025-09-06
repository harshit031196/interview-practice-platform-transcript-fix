'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Star, Clock, DollarSign, CheckCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ExpertCardProps {
  expert: {
    id: string
    name: string
    bio: string
    expertiseTags: string[]
    yearsExp: number
    verified: boolean
    rateCents?: number
    nextSlots: Array<{
      start: Date
      end: Date
    }>
  }
  onBook?: (expertId: string) => void
}

export function ExpertCard({ expert, onBook }: ExpertCardProps) {
  const nextAvailable = expert.nextSlots[0]
  const availableSlots = expert.nextSlots.length

  return (
    <Card className="h-full hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{expert.name}</CardTitle>
              {expert.verified && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span>{expert.yearsExp} years exp</span>
              {expert.rateCents && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {formatCurrency(expert.rateCents)}/hr
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            <span>4.8</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {expert.bio}
        </p>

        <div className="flex flex-wrap gap-1">
          {expert.expertiseTags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {expert.expertiseTags.length > 4 && (
            <Badge variant="outline" className="text-xs">
              +{expert.expertiseTags.length - 4} more
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {availableSlots > 0 ? (
              <span>{availableSlots} slots available</span>
            ) : (
              <span>No slots available</span>
            )}
          </div>

          <Button 
            size="sm" 
            onClick={() => onBook?.(expert.id)}
            disabled={availableSlots === 0}
          >
            Book Session
          </Button>
        </div>

        {nextAvailable && (
          <div className="text-xs text-muted-foreground">
            Next: {new Date(nextAvailable.start).toLocaleDateString()} at{' '}
            {new Date(nextAvailable.start).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
