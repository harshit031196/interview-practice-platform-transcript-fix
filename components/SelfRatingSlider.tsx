'use client'

import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'

interface Skill {
  name: string
  self: number
}

interface SelfRatingSliderProps {
  skills: Skill[]
  onSkillsChange: (skills: Skill[]) => void
}

const ratingLabels = {
  1: 'Beginner',
  2: 'Basic',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert'
}

export function SelfRatingSlider({ skills, onSkillsChange }: SelfRatingSliderProps) {
  const updateSkillRating = (skillName: string, rating: number) => {
    const updatedSkills = skills.map(skill =>
      skill.name === skillName ? { ...skill, self: rating } : skill
    )
    onSkillsChange(updatedSkills)
  }

  if (skills.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Add some skills first to rate your proficiency
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Rate your proficiency level for each skill (1 = Beginner, 5 = Expert)
      </div>
      
      {skills.map((skill) => (
        <div key={skill.name} className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="font-medium">{skill.name}</Label>
            <div className="text-sm text-muted-foreground">
              {skill.self}/5 - {ratingLabels[skill.self as keyof typeof ratingLabels]}
            </div>
          </div>
          
          <Slider
            value={[skill.self]}
            onValueChange={([value]) => updateSkillRating(skill.name, value)}
            min={1}
            max={5}
            step={1}
            className="w-full"
          />
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Beginner</span>
            <span>Basic</span>
            <span>Intermediate</span>
            <span>Advanced</span>
            <span>Expert</span>
          </div>
        </div>
      ))}
    </div>
  )
}
