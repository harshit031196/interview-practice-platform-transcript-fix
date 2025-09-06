'use client'

import { useParams } from 'next/navigation';
import { WingmanHeader } from '@/components/WingmanHeader';
import FinalAnalysisDashboard from '@/components/FinalAnalysisDashboard';

export default function SessionReportPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader title="Interview Report" subtitle={`Session ID: ${sessionId}`} showBackButton />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FinalAnalysisDashboard sessionId={sessionId} />
      </div>
    </div>
  );
}
