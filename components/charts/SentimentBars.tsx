'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface SentimentBarsProps {
  data: {
    positive: number
    neutral: number
    negative: number
  }
}

export function SentimentBars({ data }: SentimentBarsProps) {
  const chartData = [
    { name: 'Positive', value: data.positive, color: '#22c55e' },
    { name: 'Neutral', value: data.neutral, color: '#64748b' },
    { name: 'Negative', value: data.negative, color: '#ef4444' },
  ]

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
        <Tooltip 
          formatter={(value) => [`${value}%`, 'Percentage']}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
