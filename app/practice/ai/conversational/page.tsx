'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import UnifiedInterviewSession from '@/components/UnifiedInterviewSession';

interface SessionData {
  id: string;
  interviewType: string;
  difficulty: string;
  duration: number;
  isConversational: boolean;
}

function ConversationalInterviewContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get('sessionId');
    const interviewType = searchParams.get('interviewType') || 'behavioral';
    const difficulty = searchParams.get('difficulty') || 'medium';
    const duration = parseInt(searchParams.get('duration') || '5');

    if (sessionId) {
      setSessionData({
        id: sessionId,
        interviewType,
        difficulty,
        duration,
        isConversational: true
      });
    }
    setLoading(false);
  }, [searchParams]);

  const handleComplete = (results: any) => {
    console.log('Conversational interview completed:', results);
    
    if (results.sessionId) {
      // Store results in session storage for feedback page
      sessionStorage.setItem(`session_${results.sessionId}_results`, JSON.stringify(results));
      
      // Redirect to feedback page
      router.push(`/feedback/${results.sessionId}`);
    } else {
      // Fallback to dashboard if no session ID
      router.push('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Invalid session data. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto px-4 max-w-[1600px]">
        <UnifiedInterviewSession
          sessionId={sessionData.id}
          interviewType={sessionData.interviewType}
          difficulty={sessionData.difficulty}
          duration={sessionData.duration}
          isConversational={true}
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}

export default function ConversationalInterviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-600">Loading...</p></div>}>
      <ConversationalInterviewContent />
    </Suspense>
  );
}
