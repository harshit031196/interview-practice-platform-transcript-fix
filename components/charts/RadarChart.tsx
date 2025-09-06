'use client'

import { Radar, RadarChart as RechartsRadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'

interface RadarChartProps {
  data: {
    communication: number
    problemSolving: number
    confidence: number
    jdRelevance: number
    technicalDepth: number
    leadership: number
  }
}

export function RadarChart({ data }: RadarChartProps) {
  const chartData = [
    { skill: 'Communication', value: data.communication, fullMark: 100 },
    { skill: 'Problem Solving', value: data.problemSolving, fullMark: 100 },
    { skill: 'Confidence', value: data.confidence, fullMark: 100 },
    { skill: 'JD Relevance', value: data.jdRelevance, fullMark: 100 },
    { skill: 'Technical Depth', value: data.technicalDepth, fullMark: 100 },
    { skill: 'Leadership', value: data.leadership, fullMark: 100 },
  ]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsRadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis 
          angle={90} 
          domain={[0, 100]} 
          tick={{ fontSize: 10 }}
          tickCount={6}
        />
        <Radar
          name="Score"
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.1}
          strokeWidth={2}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  )
}
