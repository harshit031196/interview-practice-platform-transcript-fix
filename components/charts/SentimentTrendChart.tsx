'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface SentimentData {
  timestamp: string;
  joyLikelihood: number;
  sorrowLikelihood: number;
  angerLikelihood: number;
  surpriseLikelihood: number;
}

interface SentimentTrendChartProps {
  data: SentimentData[];
}

export function SentimentTrendChart({ data }: SentimentTrendChartProps) {
  const chartData = data.map(item => ({
    ...item,
    time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} label={{ value: 'Likelihood', angle: -90, position: 'insideLeft' }} />
        <Tooltip
          labelFormatter={(label) => `Time: ${label}`}
          formatter={(value: number, name: string) => [`${value}/5`, name.charAt(0).toUpperCase() + name.slice(1).replace('Likelihood', '')]}
        />
        <Legend />
        <Line type="monotone" dataKey="joyLikelihood" stroke="#22c55e" name="Joy" />
        <Line type="monotone" dataKey="sorrowLikelihood" stroke="#3b82f6" name="Sorrow" />
        <Line type="monotone" dataKey="angerLikelihood" stroke="#ef4444" name="Anger" />
        <Line type="monotone" dataKey="surpriseLikelihood" stroke="#f97316" name="Surprise" />
      </LineChart>
    </ResponsiveContainer>
  );
}
