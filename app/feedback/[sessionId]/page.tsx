'use client'

import FinalAnalysisDashboard from '@/components/FinalAnalysisDashboard'
import { WingmanHeader } from '@/components/WingmanHeader'

export default function FeedbackPage({ params }: { params: { sessionId: string } }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader 
        title="Interview Feedback"
        subtitle="AI-powered analysis of your interview performance"
        showBackButton={true}
        backHref="/dashboard"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FinalAnalysisDashboard sessionId={params.sessionId} />
      </div>
    </div>
  )
}
