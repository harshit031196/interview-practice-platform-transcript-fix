'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye } from 'lucide-react';

interface EyeContactFeedbackProps {
  data: Array<{ eyeContact: boolean }>;
}

export function EyeContactFeedback({ data }: EyeContactFeedbackProps) {
  if (!data || data.length === 0) {
    return null;
  }

  const eyeContactCount = data.filter(frame => frame.eyeContact).length;
  const totalFrames = data.length;
  const eyeContactPercentage = Math.round((eyeContactCount / totalFrames) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="w-5 h-5" />
          Eye Contact
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold">{eyeContactPercentage}%</div>
        <p className="text-sm text-muted-foreground">
          You maintained eye contact for {eyeContactPercentage}% of the analyzed frames.
        </p>
      </CardContent>
    </Card>
  );
}
