'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface PaceToneLineChartProps {
  data: Array<{
    time: number
    wpm: number
    confidence: number
  }>
}

export function PaceToneLineChart({ data }: PaceToneLineChartProps) {
  const chartData = data.map(item => ({
    time: `${Math.floor(item.time / 60)}:${(item.time % 60).toString().padStart(2, '0')}`,
    wpm: item.wpm,
    confidence: Math.round(item.confidence * 100)
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="time" 
          tick={{ fontSize: 12 }}
        />
        <YAxis 
          yAxisId="wpm"
          orientation="left"
          tick={{ fontSize: 12 }}
          label={{ value: 'Words per Minute', angle: -90, position: 'insideLeft' }}
        />
        <YAxis 
          yAxisId="confidence"
          orientation="right"
          tick={{ fontSize: 12 }}
          label={{ value: 'Confidence %', angle: 90, position: 'insideRight' }}
        />
        <Tooltip 
          formatter={(value, name) => [
            name === 'wpm' ? `${value} WPM` : `${value}%`,
            name === 'wpm' ? 'Speaking Pace' : 'Confidence'
          ]}
          labelFormatter={(label) => `Time: ${label}`}
        />
        <Legend />
        <Line
          yAxisId="wpm"
          type="monotone"
          dataKey="wpm"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          name="wpm"
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="confidence"
          type="monotone"
          dataKey="confidence"
          stroke="hsl(var(--destructive))"
          strokeWidth={2}
          name="confidence"
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
