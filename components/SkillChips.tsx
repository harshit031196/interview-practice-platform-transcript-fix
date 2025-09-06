'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Skill {
  name: string
  self: number
}

interface SkillChipsProps {
  skills: Skill[]
  onSkillsChange: (skills: Skill[]) => void
  suggestions?: string[]
}

export function SkillChips({ skills, onSkillsChange, suggestions = [] }: SkillChipsProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const filteredSuggestions = suggestions.filter(
    suggestion => 
      suggestion.toLowerCase().includes(inputValue.toLowerCase()) &&
      !skills.some(skill => skill.name.toLowerCase() === suggestion.toLowerCase())
  )

  const addSkill = (skillName: string) => {
    if (skillName.trim() && !skills.some(skill => skill.name.toLowerCase() === skillName.toLowerCase())) {
      const newSkills = [...skills, { name: skillName.trim(), self: 3 }]
      onSkillsChange(newSkills)
      setInputValue('')
      setShowSuggestions(false)
    }
  }

  const removeSkill = (skillName: string) => {
    const newSkills = skills.filter(skill => skill.name !== skillName)
    onSkillsChange(newSkills)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSkill(inputValue)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <Badge key={skill.name} variant="secondary" className="flex items-center gap-1 px-3 py-1">
            {skill.name}
            <button
              onClick={() => removeSkill(skill.name)}
              className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="relative">
        <div className="flex gap-2">
          <Input
            placeholder="Add a skill..."
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setShowSuggestions(e.target.value.length > 0)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(inputValue.length > 0)}
            className="flex-1"
          />
          <Button
            type="button"
            onClick={() => addSkill(inputValue)}
            disabled={!inputValue.trim()}
            size="sm"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-background border rounded-md shadow-lg max-h-40 overflow-y-auto">
            {filteredSuggestions.slice(0, 8).map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => addSkill(suggestion)}
                className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Popular skills:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 6).map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => addSkill(suggestion)}
                disabled={skills.some(skill => skill.name.toLowerCase() === suggestion.toLowerCase())}
                className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
