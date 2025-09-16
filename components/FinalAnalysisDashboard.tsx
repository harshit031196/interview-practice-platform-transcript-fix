'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { LoadingAnimation } from '@/components/LoadingAnimation'
import { CheckCircle, AlertCircle, Clock, BarChart2, Activity, MessageSquare } from 'lucide-react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
// Numbers-only flow: we no longer import VideoAnalysisResults; we will display numeric metrics directly

interface FinalAnalysisDashboardProps {
  sessionId: string
  onBack?: () => void
}

interface GeminiMetric {
  name: string
  score10: number
  explanation: string
}

interface GeminiFeedback {
  overallScore10: number
  interviewType: string
  metrics: GeminiMetric[]
  mistakes: Array<{ quote?: string; whyItMatters?: string; fix?: string }>
  summary: string
  nextSteps: string[]
}

export default function FinalAnalysisDashboard({ sessionId, onBack }: FinalAnalysisDashboardProps) {
  const [videoData, setVideoData] = useState<any | null>(null)
  const [geminiData, setGeminiData] = useState<GeminiFeedback | null>(null)
  const [videoStatus, setVideoStatus] = useState<'pending' | 'ready' | 'error'>('pending')
  const [geminiStatus, setGeminiStatus] = useState<'pending' | 'ready' | 'error'>('pending')
  const [error, setError] = useState<string | null>(null)
  const feedbackTriggeredRef = useRef(false)
  const [dbTranscript, setDbTranscript] = useState<string | null>(null)
  const [regenLoading, setRegenLoading] = useState(false)
  const [sqlLoading, setSqlLoading] = useState(false)
  const videoReadyRef = useRef(false)
  const geminiReadyRef = useRef(false)
  const informedRef = useRef(false)
  const [videoNums, setVideoNums] = useState<{ wpm: number | null, filler: number | null, clarity: number | null }>({ wpm: null, filler: null, clarity: null })
  const [geminiText, setGeminiText] = useState<string | null>(null)
  const [visionSummary, setVisionSummary] = useState<{ eyeContactScore10: number | null, smileScore10: number | null, count: number } | null>(null)
  // LLM overall score (quant) to replace top number
  const [llmOverall10, setLlmOverall10] = useState<number | null>(null)
  const llmRequestedRef = useRef(false)

  useEffect(() => { videoReadyRef.current = (videoStatus === 'ready') }, [videoStatus])
  useEffect(() => { geminiReadyRef.current = (geminiStatus === 'ready') }, [geminiStatus])

  // Helpers shared across effects
  const isErrorishText = (s?: string | null): boolean => {
    if (!s) return false
    const t = String(s).trim()
    if (!t) return false
    if (/^error\s*:/i.test(t)) return true
    if (/failed to generate analysis/i.test(t)) return true
    if (t.startsWith('{')) {
      try {
        const obj = JSON.parse(t)
        if (obj && typeof obj === 'object' && typeof obj.error === 'string') return true
      } catch {}
    }
    return false
  }

  const isMeaningfulGemini = (d: GeminiFeedback | null): boolean => {
    if (!d) return false
    if ((d.overallScore10 ?? 0) > 0) return true
    if (Array.isArray(d.metrics) && d.metrics.some(m => (m?.score10 ?? 0) > 0 || (m?.explanation || '').trim().length > 0)) return true
    if ((d.summary || '').trim().length > 0 && !isErrorishText(d.summary)) return true
    if (Array.isArray(d.mistakes) && d.mistakes.length > 0) return true
    if (Array.isArray(d.nextSteps) && d.nextSteps.length > 0) return true
    return false
  }

  const buildNarrativeFromNorm = (d: GeminiFeedback | null): string | null => {
    if (!d) return null
    const lines: string[] = []
    if (d.summary && !isErrorishText(d.summary)) { lines.push('', 'Summary:', String(d.summary)) }
    if (Array.isArray(d.metrics) && d.metrics.length) {
      lines.push('', 'Metrics:')
      for (const m of d.metrics) {
        const expl = m?.explanation ? ` — ${m.explanation}` : ''
        lines.push(`- ${m.name}: ${m.score10}/10${expl}`)
      }
    }
    if (Array.isArray(d.mistakes) && d.mistakes.length) {
      lines.push('', 'Key Mistakes & Fixes:')
      for (const mk of d.mistakes.slice(0, 5)) {
        if (!mk) continue
        const q = mk.quote ? `“${mk.quote}”` : ''
        const why = mk.whyItMatters ? ` Why: ${mk.whyItMatters}` : ''
        const fix = mk.fix ? ` Fix: ${mk.fix}` : ''
        lines.push(`- ${q}${why}${fix}`.trim())
      }
    }
    return lines.join('\n')
  }

  // Helper: refresh feedback from server after a write to DB
  const refreshFeedback = async () => {
    try {
      const res = await fetch(`/api/interviews/${sessionId}/feedback`, { credentials: 'include' })
      if (!res.ok) return false
      const payload = await res.json()
      const fb = payload?.feedback
      let found = false
      if (fb?.transcript && typeof fb.transcript === 'string' && fb.transcript.trim().length > 0) {
        setDbTranscript(fb.transcript)
        try { localStorage.setItem(`transcript_${sessionId}`, fb.transcript) } catch {}
        found = true
      }
      const wpm = typeof fb?.speakingPaceWpm === 'number' && isFinite(fb.speakingPaceWpm) ? fb.speakingPaceWpm : null
      const filler = typeof fb?.fillerWordCount === 'number' && isFinite(fb.fillerWordCount) ? fb.fillerWordCount : null
      const clarity = typeof fb?.clarityScore === 'number' && isFinite(fb.clarityScore) ? fb.clarityScore : null
      if (wpm !== null || filler !== null || clarity !== null) {
        setVideoNums({ wpm, filler, clarity })
        setVideoStatus('ready')
      }
      const serverNorm = payload?.normalized as GeminiFeedback | undefined
      if (serverNorm && typeof serverNorm.overallScore10 === 'number' && isMeaningfulGemini(serverNorm)) {
        try { localStorage.setItem(`gemini_feedback_${sessionId}`, JSON.stringify(serverNorm)) } catch {}
        setGeminiData(serverNorm)
        setGeminiStatus('ready')
        setError(null)
        const text = buildNarrativeFromNorm(serverNorm)
        if (text && text.trim()) setGeminiText(text)
        return true
      }
      if (payload?.renderedText && typeof payload.renderedText === 'string' && payload.renderedText.trim().length) {
        setGeminiText(payload.renderedText)
        setGeminiStatus('ready')
        return true
      }
      return found
    } catch {
      return false
    }
  }

  // Immediate fallback: use locally cached Gemini feedback if present (normalized)
  useEffect(() => {
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(`gemini_feedback_${sessionId}`) : null
      if (cached) {
        let parsed: any = null
        try { parsed = JSON.parse(cached) } catch {}
        if (parsed) {
          const maybe = parsed && parsed.analysis ? parsed.analysis : parsed
          const extractNumberFromString = (s: string): number | null => {
            const m = s.match(/\d+(?:\.\d+)?/)
            if (!m) return null
            const n = Number(m[0])
            return isFinite(n) ? n : null
          }

          const toScore10 = (val: any): number | null => {
            if (val == null) return null
            let n = typeof val === 'string' ? extractNumberFromString(val) : Number(val)
            if (typeof n !== 'number' || !isFinite(n)) return null
            if (n <= 10) return Math.max(0, Math.min(10, Math.round(n)))
            if (n <= 1) return Math.max(0, Math.min(10, Math.round(n * 10)))
            return Math.max(0, Math.min(10, Math.round(n / 10)))
          }
          const candidate = maybe?.overallScore10 ?? maybe?.overallScore ?? maybe?.overall ?? maybe?.score
          let score10 = toScore10(candidate)
          if (score10 == null && Array.isArray(maybe?.metrics) && maybe.metrics.length > 0) {
            const nums = maybe.metrics
              .map((m: any) => toScore10(m?.score10 ?? m?.score))
              .filter((v: any) => typeof v === 'number')
            if (nums.length > 0) {
              score10 = Math.max(0, Math.min(10, Math.round(nums.reduce((a: number, b: number) => a + b, 0) / nums.length)))
            }
          }
          if (score10 != null) {
            const normalized = { ...maybe, overallScore10: score10 } as GeminiFeedback
            if (isMeaningfulGemini(normalized)) {
              setGeminiData(normalized)
              setGeminiStatus('ready')
              const text = buildNarrativeFromNorm(normalized)
              if (text && text.trim()) setGeminiText(text)
            } else {
              // Clear any stale cache if present
              try { localStorage.removeItem(`gemini_feedback_${sessionId}`) } catch {}
            }
          }
        }
      }
    } catch (_) {
      // ignore cache errors
    }
  }, [sessionId])

  // Hydrate transcript once on mount/refresh if missing, regardless of Gemini readiness
  useEffect(() => {
    if (!dbTranscript) {
      refreshFeedback().catch(() => {})
    }
  }, [sessionId])

  // Restore cached transcript on mount to keep chat visible across refreshes
  useEffect(() => {
    try {
      const cachedT = typeof window !== 'undefined' ? localStorage.getItem(`transcript_${sessionId}`) : null
      if (cachedT && cachedT.trim() && !dbTranscript) {
        setDbTranscript(cachedT)
      }
    } catch {
      // ignore
    }
  }, [sessionId])

  // Fetch a robust overall LLM score (quant) to replace the top number
  useEffect(() => {
    if (llmRequestedRef.current) return
    llmRequestedRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/ai/feedback-quant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId })
        })
        if (res.ok) {
          const body = await res.json()
          const score = typeof body?.metrics?.overallPerformance10 === 'number' ? body.metrics.overallPerformance10 : null
          if (score != null) setLlmOverall10(Math.max(0, Math.min(10, Math.round(score))))
        }
      } catch (_) {
        // ignore
      }
    })()
  }, [sessionId])

  // Fetch vision summary (eye contact and smile) and raw video analysis JSON (if available)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const vs = await fetch(`/api/vision/summary?sessionId=${sessionId}`)
        if (mounted && vs.ok) {
          const data = await vs.json()
          setVisionSummary({ eyeContactScore10: data.eyeContactScore10 ?? null, smileScore10: data.smileScore10 ?? null, count: data.count ?? 0 })
          if ((data?.count ?? 0) > 0) setVideoStatus('ready')
        }
      } catch {}
      try {
        const vr = await fetch(`/api/video-analysis/results/${sessionId}`)
        if (mounted && vr.ok) {
          const payload = await vr.json()
          // Normalize to array-of-segments shape expected by downstream code
          const arr: any[] = Array.isArray(payload) ? payload : [{ results: payload }]
          setVideoData(arr)
          // Opportunistically compute clarity (0-100) from speech_analysis if not already present
          try {
            const latest = arr.length ? arr[arr.length - 1] : null
            const src = latest?.results ?? latest?.analysisData
            const obj = typeof src === 'string' ? JSON.parse(src) : (typeof src === 'object' ? src : null)
            const clarity01 = obj?.speech_analysis?.clarity_score
            if (typeof clarity01 === 'number' && isFinite(clarity01)) {
              const clarityPct = Math.round(Math.max(0, Math.min(100, clarity01 * 100)))
              setVideoNums(prev => ({ ...prev, clarity: clarityPct }))
            }
          } catch {}
        }
      } catch {}
    })()
    return () => { mounted = false }
  }, [sessionId])

  // Ensure transcript + feedback get stored as soon as we have a transcript (even if video isn't ready)
  useEffect(() => {
    if (geminiStatus === 'ready' || feedbackTriggeredRef.current) return

    const extractTranscriptLocal = (data: any): string | null => {
      if (!data) return null
      try {
        // Common shapes:
        // 1) data.videoAnalysis.speechTranscription.transcript (new video API)
        // 2) data.speech_analysis.transcript (aggregated)
        // 3) data.speechAnalysis.transcript (camelCase)
        // 4) If array of segments, pick first non-empty transcript
        const t1 = data?.videoAnalysis?.speechTranscription?.transcript
        const t2 = data?.speech_analysis?.transcript
        const t3 = data?.speechAnalysis?.transcript
        if (typeof t1 === 'string' && t1.trim()) return t1.trim()
        if (typeof t2 === 'string' && t2.trim()) return t2.trim()
        if (typeof t3 === 'string' && t3.trim()) return t3.trim()
        if (Array.isArray(data)) {
          for (const seg of data) {
            const s1 = seg?.analysisData?.videoAnalysis?.speechTranscription?.transcript
            const s2 = seg?.results?.speech_analysis?.transcript
            if (typeof s1 === 'string' && s1.trim()) return s1.trim()
            if (typeof s2 === 'string' && s2.trim()) return s2.trim()
          }
        }
      } catch {}
      return null
    }

    let transcript = dbTranscript || extractTranscriptLocal(videoData)
    if (!transcript && typeof window !== 'undefined') {
      try { const c = localStorage.getItem(`transcript_${sessionId}`); if (c && c.trim()) transcript = c } catch {}
    }
    if (!transcript || transcript.length < 20) return

    // Persist transcript early so chat shows even before server writes
    try { localStorage.setItem(`transcript_${sessionId}`, transcript) } catch {}
    if (!dbTranscript) setDbTranscript(transcript)

    feedbackTriggeredRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/ai/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId, conversationTranscript: transcript })
        })
        let gotStructured = false
        if (res.ok) {
          const body = await res.json()
          const norm = body?.normalized as GeminiFeedback | undefined
          if (norm && typeof norm === 'object' && typeof norm.overallScore10 === 'number') {
            if (isMeaningfulGemini(norm)) {
              try { localStorage.setItem(`gemini_feedback_${sessionId}`, JSON.stringify(norm)) } catch {}
              setGeminiData(norm as GeminiFeedback)
              setGeminiStatus('ready')
              setError(null)
              const text = buildNarrativeFromNorm(norm)
              if (text && text.trim()) setGeminiText(text)
              gotStructured = true
            } else {
              const text = buildNarrativeFromNorm(norm)
              if (text && text.trim()) { setGeminiText(text); setGeminiStatus('ready') }
              gotStructured = true
            }
          }
          // Fallback legacy numeric path
          const vals = Array.isArray(body?.values) ? (body.values as number[]) : null
          const labels = Array.isArray(body?.labels) ? (body.labels as string[]) : null
          if (!gotStructured && vals && vals.length >= 6) {
            const metricLabels = labels && labels.length >= 6 ? labels.slice(1) : ['Metric 1','Metric 2','Metric 3','Metric 4','Metric 5']
            const normalized: GeminiFeedback = {
              overallScore10: vals[0],
              interviewType: 'general',
              metrics: metricLabels.map((name, i) => ({ name, score10: vals[i + 1] ?? 0, explanation: '' })),
              mistakes: [],
              summary: '',
              nextSteps: [],
            }
            if (isMeaningfulGemini(normalized)) {
              try { localStorage.setItem(`gemini_feedback_${sessionId}`, JSON.stringify(normalized)) } catch {}
              setGeminiData(normalized)
              setGeminiStatus('ready')
              setError(null)
              const text = buildNarrativeFromNorm(normalized)
              if (text && text.trim()) setGeminiText(text)
              gotStructured = true
            }
          }
        }
        // If still not structured, try SQL-based generation and refresh
        if (!gotStructured) {
          try {
            const sqlRes = await fetch('/api/ai/feedback-sql', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ sessionId, conversationTranscript: transcript })
            })
            if (sqlRes.ok) {
              await refreshFeedback()
            }
          } catch {}
        }
      } catch (_) {
        // ignore
      }
    })()
  }, [geminiStatus, videoData, sessionId, dbTranscript])

  // If Gemini is READY but clearly a fallback (parsing error), auto-regenerate once
  useEffect(() => {
    const isFallbackFeedback = (d: GeminiFeedback | null): boolean => {
      if (!d) return false
      const s = (d.summary || '').toLowerCase()
      if (s.includes('could not parse model output') || s.includes('fallback structure')) return true
      if (Array.isArray(d.metrics)) {
        for (const m of d.metrics) {
          const e = (m?.explanation || '').toLowerCase()
          if (e.includes('parsing error fallback') || e.includes('model unavailable fallback')) return true
        }
      }
      return false
    }

    if (geminiStatus === 'ready' && isFallbackFeedback(geminiData) && !feedbackTriggeredRef.current) {
      feedbackTriggeredRef.current = true
      try { localStorage.removeItem(`gemini_feedback_${sessionId}`) } catch {}
      const extractTranscript = (data: any): string | null => {
        if (!data) return null
        try {
          const t1 = data?.videoAnalysis?.speechTranscription?.transcript
          const t2 = data?.speech_analysis?.transcript
          const t3 = data?.speechAnalysis?.transcript
          if (typeof t1 === 'string' && t1.trim()) return t1.trim()
          if (typeof t2 === 'string' && t2.trim()) return t2.trim()
          if (typeof t3 === 'string' && t3.trim()) return t3.trim()
        } catch {}
        return null
      }
      const transcript = dbTranscript || extractTranscript(videoData)
      if (!transcript || transcript.length < 20) return
      try { localStorage.setItem(`transcript_${sessionId}`, transcript) } catch {}
      if (!dbTranscript) setDbTranscript(transcript)
      ;(async () => {
        try {
          const res = await fetch('/api/ai/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sessionId, conversationTranscript: transcript })
          })
          if (res.ok) {
            const body = await res.json()
            const norm = body?.normalized as GeminiFeedback | undefined
            if (norm && typeof norm === 'object' && typeof norm.overallScore10 === 'number') {
              if (isMeaningfulGemini(norm)) {
                try { localStorage.setItem(`gemini_feedback_${sessionId}`, JSON.stringify(norm)) } catch {}
                setGeminiData(norm as GeminiFeedback)
                setGeminiStatus('ready')
                setError(null)
                const text = buildNarrativeFromNorm(norm)
                if (text && text.trim()) setGeminiText(text)
                return
              } else {
                const text = buildNarrativeFromNorm(norm)
                if (text && text.trim()) { setGeminiText(text); setGeminiStatus('ready') }
              }
            }
            // Fallback legacy numeric path
            const vals = Array.isArray(body?.values) ? (body.values as number[]) : null
            const labels = Array.isArray(body?.labels) ? (body.labels as string[]) : null
            if (vals && vals.length >= 6) {
              const metricLabels = labels && labels.length >= 6 ? labels.slice(1) : ['Metric 1','Metric 2','Metric 3','Metric 4','Metric 5']
              const normalized: GeminiFeedback = {
                overallScore10: vals[0],
                interviewType: 'general',
                metrics: metricLabels.map((name, i) => ({ name, score10: vals[i + 1] ?? 0, explanation: '' })),
                mistakes: [],
                summary: '',
                nextSteps: [],
              }
              if (isMeaningfulGemini(normalized)) {
                try { localStorage.setItem(`gemini_feedback_${sessionId}`, JSON.stringify(normalized)) } catch {}
                setGeminiData(normalized)
                setGeminiStatus('ready')
                setError(null)
                const text = buildNarrativeFromNorm(normalized)
                if (text && text.trim()) setGeminiText(text)
              }
            }
          }
        } finally {
          // allow manual regenerate if needed later
          feedbackTriggeredRef.current = false
        }
      })()
    }
  }, [geminiStatus, geminiData, dbTranscript, videoData, sessionId])

  // Poll both video analysis and conversational feedback
  useEffect(() => {
    let mounted = true

    // We no longer poll the separate video-analysis endpoint. We'll use numeric fields from feedback GET.

    const extractNumberFromString = (s: string): number | null => {
      const m = s.match(/\d+(?:\.\d+)?/)
      if (!m) return null
      const n = Number(m[0])
      if (!isFinite(n)) return null
      return n
    }

    const toScore10 = (val: any): number | null => {
      if (val == null) return null
      let n = typeof val === 'string' ? extractNumberFromString(val) : Number(val)
      if (typeof n !== 'number' || !isFinite(n)) return null
      if (!isFinite(n)) return null
      if (n <= 10) return Math.max(0, Math.min(10, Math.round(n)))
      if (n <= 1) return Math.max(0, Math.min(10, Math.round(n * 10)))
      // assume 0-100
      return Math.max(0, Math.min(10, Math.round(n / 10)))
    }

    const coalesce = (...vals: any[]) => vals.find(v => v !== undefined && v !== null)

    const normalizeGemini = (raw: any): GeminiFeedback | null => {
      if (!raw || typeof raw !== 'object') return null
      const maybe = raw && raw.analysis ? raw.analysis : raw

      // Score normalization
      const candidateScore = coalesce(
        maybe?.overallScore10,
        maybe?.overall_score_10,
        maybe?.overallScore,
        maybe?.overall_score,
        maybe?.overall,
        maybe?.score
      )
      let score10 = toScore10(candidateScore)
      // If missing, compute from metrics
      if (score10 == null && Array.isArray(maybe?.metrics) && maybe.metrics.length > 0) {
        const nums = maybe.metrics
          .map((m: any) => toScore10(coalesce(m?.score10, m?.score_10, m?.score, m?.value)))
          .filter((v: any) => typeof v === 'number')
        if (nums.length > 0) {
          score10 = Math.max(0, Math.min(10, Math.round(nums.reduce((a: number, b: number) => a + b, 0) / nums.length)))
        }
      }
      if (score10 == null) return null

      // Metrics normalization (optional)
      const metricsRaw = Array.isArray(maybe?.metrics) ? maybe.metrics : []
      const metrics = metricsRaw.map((m: any) => ({
        name: coalesce(m?.name, m?.metric, m?.metric_name, '') as string,
        score10: toScore10(coalesce(m?.score10, m?.score_10, m?.score, m?.value)) ?? 0,
        explanation: (coalesce(m?.explanation, m?.details, m?.reason, '') as string) || ''
      }))

      const interviewType = coalesce(maybe?.interviewType, maybe?.interview_type, 'general')
      const summary = coalesce(maybe?.summary, maybe?.overall_summary, maybe?.overview, '') || ''
      let nextSteps = coalesce(maybe?.nextSteps, maybe?.next_steps, maybe?.next, maybe?.recommendations) as any
      if (!Array.isArray(nextSteps)) nextSteps = []
      nextSteps = nextSteps.filter((s: any) => typeof s === 'string')

      return {
        overallScore10: score10,
        interviewType: typeof interviewType === 'string' ? interviewType : 'general',
        metrics,
        mistakes: Array.isArray(maybe?.mistakes) ? maybe.mistakes : [],
        summary,
        nextSteps,
      }
    }

    const isMeaningfulGemini = (d: GeminiFeedback | null): boolean => {
      if (!d) return false
      if ((d.overallScore10 ?? 0) > 0) return true
      if (Array.isArray(d.metrics) && d.metrics.some(m => (m?.score10 ?? 0) > 0 || (m?.explanation || '').trim().length > 0)) return true
      if ((d.summary || '').trim().length > 0) return true
      if (Array.isArray(d.mistakes) && d.mistakes.length > 0) return true
      if (Array.isArray(d.nextSteps) && d.nextSteps.length > 0) return true
      return false
    }

    const pollGemini = async () => {
      try {
        const res = await fetch(`/api/interviews/${sessionId}/feedback`, { credentials: 'include' })
        if (res.ok) {
          const payload = await res.json()
          // If backend signals that video analysis exists, flip the video status immediately
          if (payload && payload.videoReady && mounted) {
            setVideoStatus('ready')
          }
          // If server provides rendered narrative text, store it and consider feedback ready
          if (payload?.renderedText && typeof payload.renderedText === 'string' && payload.renderedText.trim().length > 0) {
            setGeminiText(payload.renderedText)
            setGeminiStatus('ready')
          }
          const fb = payload?.feedback
          if (fb?.transcript && typeof fb.transcript === 'string' && fb.transcript.trim().length > 0) {
            setDbTranscript(fb.transcript)
            try { localStorage.setItem(`transcript_${sessionId}`, fb.transcript) } catch {}
          }
          // Pull simple video numbers from feedback (no extra API calls)
          const wpmRaw = fb?.speakingPaceWpm
          const fillerRaw = fb?.fillerWordCount
          const clarityRaw = fb?.clarityScore
          const wpm = typeof wpmRaw === 'number' && isFinite(wpmRaw) ? wpmRaw : null
          const filler = typeof fillerRaw === 'number' && isFinite(fillerRaw) ? fillerRaw : null
          const clarity = typeof clarityRaw === 'number' && isFinite(clarityRaw) ? clarityRaw : null
          if (wpm !== null || filler !== null || clarity !== null) {
            setVideoNums({ wpm, filler, clarity })
            setVideoStatus('ready')
          }
          // Prefer server-normalized payload if present
          const serverNorm = payload?.normalized
          const values = Array.isArray(payload?.values) ? (payload.values as number[]) : null
          const numbersMode = !!payload?.numbersMode
          const anyPositive = Array.isArray(values) && values.some(v => typeof v === 'number' && v > 0)
          if (serverNorm && typeof serverNorm === 'object' && typeof serverNorm.overallScore10 === 'number' && (!numbersMode || anyPositive) && isMeaningfulGemini(serverNorm as GeminiFeedback)) {
            if (mounted) {
              try { localStorage.setItem(`gemini_feedback_${sessionId}`, JSON.stringify(serverNorm)) } catch {}
              setGeminiData(serverNorm as GeminiFeedback)
              setGeminiStatus('ready')
              setError(null)
              const text = buildNarrativeFromNorm(serverNorm as GeminiFeedback)
              if (text && text.trim()) setGeminiText(text)
            }
            try {
              console.debug('[Feedback] Using server-normalized feedback:', { score10: serverNorm.overallScore10 })
            } catch {}
            return true
          }
          let parsed: any = null
          if (fb && fb.contentFeedback != null) {
            const src = fb.contentFeedback
            if (typeof src === 'string') {
              try {
                parsed = JSON.parse(src)
                // Handle double-encoded JSON where first parse yields a string
                if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
                  try { parsed = JSON.parse(parsed) } catch {}
                }
              } catch {
                parsed = null
              }
            } else if (typeof src === 'object') {
              parsed = src
            }
          }
          // Some APIs wrap the final analysis under an 'analysis' key; unwrap if present
          const normalized = normalizeGemini(parsed)
          // Debug: Log once when found/not found
          try {
            console.debug('[Feedback] Parsed contentFeedback:', { hasParsed: !!parsed, hasNormalized: !!normalized, score10: normalized?.overallScore10 })
          } catch {}
          if (mounted) {
            if (normalized && isMeaningfulGemini(normalized)) {
              try { localStorage.setItem(`gemini_feedback_${sessionId}`, JSON.stringify(normalized)) } catch {}
              setGeminiData(normalized as GeminiFeedback)
              setGeminiStatus('ready')
              setError(null)
              const text = buildNarrativeFromNorm(normalized as GeminiFeedback)
              if (text && text.trim()) setGeminiText(text)
            } else if (payload?.renderedText && typeof payload.renderedText === 'string' && payload.renderedText.trim().length > 0) {
              setGeminiText(payload.renderedText)
              setGeminiStatus('ready')
            }
          }
          const transcriptPresent = typeof fb?.transcript === 'string' && fb.transcript.trim().length > 0
          // Keep polling until transcript is present; normalized/rendered text alone is not enough for chat
          return transcriptPresent
        }
        if (res.status === 404) return false
        return false
      } catch (e) {
        return false
      }
    }

    // Start polling loop with backoff up to 4 minutes (only feedback GET)
    const startTime = Date.now()
    let delayMs = 5000
    let stopped = false
    const MAX_MS = 4 * 60 * 1000 // 4 minutes
    let timerId: any

    const tick = async () => {
      if (!mounted || stopped) return
      // Keep polling if transcript is missing, even if gemini appears ready from cache
      const g = (geminiReadyRef.current && !!dbTranscript) ? true : await pollGemini()
      if (g) { stopped = true; return }
      const elapsed = Date.now() - startTime
      if (elapsed >= 60 * 1000 && !informedRef.current) {
        setError('Analysis is taking longer than expected. Please check back in a few minutes.')
        informedRef.current = true
      }
      if (elapsed >= MAX_MS) { stopped = true; return }
      delayMs = Math.min(Math.round(delayMs * 1.5), 30000)
      timerId = setTimeout(tick, delayMs)
    }

    timerId = setTimeout(tick, 0)

    return () => {
      mounted = false
      stopped = true
      if (timerId) clearTimeout(timerId)
    }
  }, [sessionId])

  const progress = useMemo(() => {
    const stepsReady = (videoStatus === 'ready' ? 1 : 0) + (geminiStatus === 'ready' ? 1 : 0)
    return (stepsReady / 2) * 100
  }, [videoStatus, geminiStatus])

  const statusText = useMemo(() => {
    if (videoStatus === 'ready' && geminiStatus === 'ready') return 'All analyses complete'
    if (videoStatus === 'ready' && geminiStatus !== 'ready') return 'Video analysis ready. Generating conversational feedback...'
    if (videoStatus !== 'ready' && geminiStatus === 'ready') return 'Conversational feedback ready. Processing video analysis...'
    return 'Processing your interview... This can take up to 4-5 minutes.'
  }, [videoStatus, geminiStatus])

  // Results should be considered truly ready only when we have concrete outputs
  // Either: raw video analysis JSON present, or numeric metrics available AND vision frames saved
  const videoResultsReady = useMemo(() => {
    const hasVideoJson = Array.isArray(videoData) && videoData.length > 0
    const hasNums = (videoNums.wpm != null) || (videoNums.filler != null) || (videoNums.clarity != null)
    const hasVisionFrames = (visionSummary?.count ?? 0) > 0
    return hasVideoJson || (hasNums && hasVisionFrames)
  }, [videoData, videoNums, visionSummary])

  // Helpers to display interview chat nicely from plain transcript
  const parseTranscriptToTurns = (t: string): Array<{ role: 'interviewer' | 'ai' | 'system' | 'candidate'; text: string }> => {
    const lines = String(t || '').split(/\r?\n/)
    type Role = 'interviewer' | 'ai' | 'system' | 'candidate'
    const mapRole = (s: string): Role => {
      const k = s.toLowerCase()
      if (k.startsWith('interviewer')) return 'interviewer'
      if (k.startsWith('assistant') || k.startsWith('ai')) return 'ai'
      if (k.startsWith('system')) return 'system'
      return 'candidate'
    }
    const turns: Array<{ role: Role; text: string }> = []
    let curRole: Role = 'candidate'
    let buf: string[] = []
    const flush = () => {
      const text = buf.join(' ').trim()
      if (text) turns.push({ role: curRole, text })
      buf = []
    }
    for (const raw of lines) {
      const s = String(raw || '').trim()
      if (!s) { flush(); continue }
      const m = s.match(/^([a-zA-Z ]{2,20})\s*:\s*(.*)$/)
      if (m) {
        flush()
        curRole = mapRole(m[1])
        const rest = String(m[2] || '').trim()
        if (rest) buf.push(rest)
        continue
      }
      buf.push(s)
    }
    flush()
    // Merge consecutive turns of the same role
    const merged: typeof turns = []
    for (const t of turns) {
      const last = merged[merged.length - 1]
      if (last && last.role === t.role) last.text += ' ' + t.text
      else merged.push({ ...t })
    }
    return merged
  }

  const roleLabel = (r: 'interviewer' | 'ai' | 'system' | 'candidate') => (
    r === 'ai' ? 'AI' : r === 'interviewer' ? 'Interviewer' : r === 'system' ? 'System' : 'You'
  )
  const roleStyle = (r: 'interviewer' | 'ai' | 'system' | 'candidate') => (
    r === 'ai' ? 'bg-blue-50 border-blue-200' : r === 'interviewer' ? 'bg-gray-50 border-gray-200' : r === 'system' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
  )

  // Parse transcript into chat turns for a nicer chat view
  const chatTurns = useMemo(() => {
    if (!dbTranscript) return [] as Array<{ role: 'interviewer' | 'ai' | 'system' | 'candidate'; text: string }>
    return parseTranscriptToTurns(dbTranscript)
  }, [dbTranscript])

  // Opportunistically hydrate transcript from local videoData when available
  useEffect(() => {
    if (!dbTranscript && videoData) {
      try {
        const t = (function extractTranscriptLocal(data: any): string | null {
          if (!data) return null
          try {
            const t1 = data?.videoAnalysis?.speechTranscription?.transcript
            const t2 = data?.speech_analysis?.transcript
            const t3 = data?.speechAnalysis?.transcript
            if (typeof t1 === 'string' && t1.trim()) return t1.trim()
            if (typeof t2 === 'string' && t2.trim()) return t2.trim()
            if (typeof t3 === 'string' && t3.trim()) return t3.trim()
            if (Array.isArray(data)) {
              for (const seg of data) {
                const s1 = seg?.analysisData?.videoAnalysis?.speechTranscription?.transcript
                const s2 = seg?.results?.speech_analysis?.transcript
                if (typeof s1 === 'string' && s1.trim()) return s1.trim()
                if (typeof s2 === 'string' && s2.trim()) return s2.trim()
              }
            }
          } catch {}
          return null
        })(videoData)
        if (t && t.length >= 20) {
          setDbTranscript(t)
          try { localStorage.setItem(`transcript_${sessionId}`, t) } catch {}
        }
      } catch {}
    }
  }, [videoData, dbTranscript, sessionId])

  // Extract key metrics from the latest raw JSON results (if present)
  const extractedFromRaw = useMemo(() => {
    try {
      const arr = Array.isArray(videoData) ? videoData : null
      const latest = arr && arr.length ? arr[arr.length - 1] : null
      const src = latest?.results ?? latest?.analysisData ?? null
      const obj = typeof src === 'string' ? JSON.parse(src) : (typeof src === 'object' ? src : null)
      if (!obj) return { confidencePct: null as number | null, faceCount: null as number | null, eyeContactPct: null as number | null, wpm: null as number | null, fillerCount: null as number | null }

      // Support both shapes: { videoAnalysis: {...} } (Next API) and cloud-function keys
      const va = (obj as any).videoAnalysis || (obj as any).video_analysis || null
      const confAnalysis = (obj as any).confidence_analysis || null
      const speech = (obj as any).speech_analysis || (va?.speechTranscription ? { words_per_minute: va?.speechTranscription?.words_per_minute, filler_words: { count: va?.speechTranscription?.fillerCount } } : null)

      // Confidence: prefer faceDetection.averageConfidence; fallback to va.confidence or confAnalysis.confidence_score
      let confidence = null as number | null
      if (va?.faceDetection?.averageConfidence != null) confidence = Number(va.faceDetection.averageConfidence)
      else if (va?.confidence != null) confidence = Number(va.confidence)
      else if (confAnalysis?.confidence_score != null) confidence = Number(confAnalysis.confidence_score)
      const confidencePct = confidence != null && isFinite(confidence) ? Math.round(Math.max(0, Math.min(100, confidence * (confidence <= 1 ? 100 : 1)))) : null

      // Face count — fall back to facial_analysis if faceDetection.count not present
      let faceCount: number | null = null
      if (va?.faceDetection?.count != null) {
        faceCount = Number(va.faceDetection.count)
      } else if ((obj as any)?.facial_analysis?.total_frames_analyzed != null) {
        faceCount = Number((obj as any).facial_analysis.total_frames_analyzed)
      } else if (Array.isArray((obj as any)?.facial_analysis?.emotion_timeline)) {
        faceCount = ((obj as any).facial_analysis.emotion_timeline as any[]).length
      }

      // Eye contact percentage
      let eye = null as number | null
      if (confAnalysis?.average_eye_contact_score != null) eye = Number(confAnalysis.average_eye_contact_score)
      const eyeContactPct = eye != null && isFinite(eye) ? Math.round(Math.max(0, Math.min(100, eye * (eye <= 1 ? 100 : 1)))) : null

      // Words per minute
      let wpm = null as number | null
      if (speech?.words_per_minute != null) wpm = Math.round(Number(speech.words_per_minute))
      else if (speech?.pacing_analysis?.average_wpm != null) wpm = Math.round(Number(speech.pacing_analysis.average_wpm))

      // Filler word count
      let fillerCount = null as number | null
      if (speech?.filler_words?.count != null) fillerCount = Math.round(Number(speech.filler_words.count))

      return { confidencePct, faceCount, eyeContactPct, wpm, fillerCount }
    } catch {
      return { confidencePct: null as number | null, faceCount: null as number | null, eyeContactPct: null as number | null, wpm: null as number | null, fillerCount: null as number | null }
    }
  }, [videoData])

  // Layout now focuses on concise quick stats; detailed pace/fillers live below.

  // Analyze deeper signals from raw JSON: Eye contact, Facial expressiveness, Pace (WPM), Filler & Hedging
  const behaviorSignals = useMemo(() => {
    try {
      const arr = Array.isArray(videoData) ? videoData : null
      const latest = arr && arr.length ? arr[arr.length - 1] : null
      const src = latest?.results ?? latest?.analysisData ?? null
      const obj = typeof src === 'string' ? JSON.parse(src) : (typeof src === 'object' ? src : null)
      if (!obj) return null

      const videoAnalysis = (obj as any).videoAnalysis || (obj as any).video_analysis || {}
      const speechTranscription = (videoAnalysis as any).speechTranscription || (obj as any).speechTranscription || {}

      // Helpers
      const tsToSeconds = (ts: any): number => {
        if (!ts) return 0
        if (typeof ts === 'string') {
          const m = ts.match(/([0-9.]+)s/i)
          return m ? parseFloat(m[1]) : 0
        }
        const s = Number(ts.seconds || 0)
        const n = Number(ts.nanos || 0)
        return s + n / 1e9
      }
      const pickEmotion = (emotions: any[] = [], name: string): number | null => {
        try {
          const e = emotions.find((x) => x && (x.name === name || x.attribute === name))
          const v = e ? Number(e.confidence || e.value || 0) : null
          return v != null && isFinite(v) ? v : null
        } catch { return null }
      }
      const labelByThresholds = (value: number | null, thresholds: Array<{ min: number; label: string }>): string => {
        if (value == null || !isFinite(value)) return 'unknown'
        for (const t of thresholds) { if (value >= t.min) return t.label }
        return 'unknown'
      }
      const textFromTranscription = (st: any): string => {
        try {
          if (st?.transcript) return String(st.transcript)
          const segments = Array.isArray(st?.results) ? st.results : []
          const parts: string[] = []
          for (const seg of segments) {
            const alt0 = Array.isArray(seg?.alternatives) && seg.alternatives[0] ? seg.alternatives[0] : null
            if (alt0?.transcript) parts.push(String(alt0.transcript))
          }
          return parts.join(' ').trim()
        } catch { return '' }
      }
      const extractWordTimeline = (st: any): { firstStart: number; lastEnd: number; wordsTotal: number } => {
        let firstStart: number | null = null
        let lastEnd: number | null = null
        let wordsTotal = 0
        try {
          const segments = Array.isArray(st?.results) ? st.results : []
          for (const seg of segments) {
            const alt0 = Array.isArray(seg?.alternatives) && seg.alternatives[0] ? seg.alternatives[0] : null
            const words = Array.isArray(alt0?.words) ? alt0.words : []
            wordsTotal += words.length
            for (const w of words) {
              const stS = tsToSeconds(w?.startTime)
              const etS = tsToSeconds(w?.endTime)
              if (stS || etS) {
                if (firstStart === null || stS < firstStart) firstStart = stS
                if (lastEnd === null || etS > lastEnd) lastEnd = etS
              }
            }
          }
          if (!wordsTotal && isFinite(Number(st?.wordCount))) wordsTotal = Number(st.wordCount)
          if (firstStart == null) firstStart = 0
          if (lastEnd == null || lastEnd < firstStart) lastEnd = firstStart
        } catch {
          firstStart = 0; lastEnd = 0; wordsTotal = 0
        }
        return { firstStart, lastEnd, wordsTotal }
      }
      const countPhrases = (text: string, phrases: string[]) => {
        const counts: Record<string, number> = {}
        for (const p of phrases) {
          const pattern = '\\b' + p.trim().replace(/\s+/g, '\\s+') + '\\b'
          const re = new RegExp(pattern, 'gi')
          const matches = text.match(re)
          counts[p] = matches ? matches.length : 0
        }
        return counts
      }
      const sumObj = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

      // Eye contact & facial expressiveness from face emotions (if present)
      const faces = Array.isArray(videoAnalysis?.faceDetection?.faces) ? videoAnalysis.faceDetection.faces : []
      let eyeContactScore: number | null = null
      let smileScore: number | null = null
      if (faces.length) {
        const looking: number[] = []
        const smiles: number[] = []
        for (const f of faces) {
          const e = Array.isArray(f?.emotions) ? f.emotions : []
          const look = pickEmotion(e, 'looking_at_camera')
          if (look != null) looking.push(look)
          const sml = pickEmotion(e, 'smiling')
          if (sml != null) smiles.push(sml)
        }
        if (looking.length) eyeContactScore = looking.reduce((a, b) => a + b, 0) / looking.length
        if (smiles.length) smileScore = smiles.reduce((a, b) => a + b, 0) / smiles.length
      }
      // Fallback expressiveness from facial_analysis.emotion_statistics.joy.average (0..1)
      if (smileScore == null) {
        const joyAvg = (obj as any)?.facial_analysis?.emotion_statistics?.joy?.average
        if (typeof joyAvg === 'number' && isFinite(joyAvg)) {
          smileScore = joyAvg
        }
      }
      // Fallback eye contact from confidence analysis average score (0..1)
      if (eyeContactScore == null && (obj as any).confidence_analysis?.average_eye_contact_score != null) {
        const val = Number((obj as any).confidence_analysis.average_eye_contact_score)
        eyeContactScore = isFinite(val) ? val : null
      }

      const eyeContactLabel = labelByThresholds(eyeContactScore, [
        { min: 0.85, label: 'strong' },
        { min: 0.60, label: 'moderate' },
        { min: 0.0,  label: 'weak' },
      ])
      const expressivenessLabel = labelByThresholds(smileScore, [
        { min: 0.40, label: 'high' },
        { min: 0.20, label: 'medium' },
        { min: 0.0,  label: 'low' },
      ])

      // Pace (WPM)
      const { firstStart, lastEnd, wordsTotal } = extractWordTimeline(speechTranscription)
      const durationSec = Math.max(0, lastEnd - firstStart)
      const wpm = durationSec > 0 ? (wordsTotal / (durationSec / 60)) : null

      // Filler & Hedging
      const transcriptText = String(textFromTranscription(speechTranscription) || '').toLowerCase()
      const fillerTerms = ['um','uh','er','ah','hmm','like','so','and','you know']
      const hedgingTerms = ['i think','maybe','probably','sort of','kind of','i guess','i believe','i feel','in my opinion']
      const fillerCounts = countPhrases(transcriptText, fillerTerms)
      const hedgingCounts = countPhrases(transcriptText, hedgingTerms)
      const fillerTotal = sumObj(fillerCounts)
      const hedgingTotal = sumObj(hedgingCounts)
      const combined = fillerTotal + hedgingTotal
      const perMinute = durationSec > 0 ? combined / (durationSec / 60) : null
      const per100Words = wordsTotal > 0 ? (combined / wordsTotal) * 100 : null

      const sortCounts = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])

      return {
        eyeContact: { score: eyeContactScore, label: eyeContactLabel },
        facialExpressiveness: { smileScore, label: expressivenessLabel },
        pace: { wordsPerMinute: wpm, wordCount: wordsTotal, durationSeconds: durationSec },
        fillerAndHedging: {
          totals: { filler: fillerTotal, hedging: hedgingTotal, combined, perMinute, per100Words },
          topFillers: sortCounts(fillerCounts).slice(0, 5),
          topHedging: sortCounts(hedgingCounts).slice(0, 5),
        }
      }
    } catch { return null }
  }, [videoData])

  return (
    <div className="space-y-6">
      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" /> Final Analysis Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={progress} className="mb-3" />
          <div className="text-sm text-muted-foreground mb-3">{statusText}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              {videoStatus === 'ready' ? <CheckCircle className="w-4 h-4 text-green-600" /> : videoStatus === 'error' ? <AlertCircle className="w-4 h-4 text-red-600" /> : <Clock className="w-4 h-4 text-yellow-600" />}
              <span>Video Analysis</span>
              <Badge variant="outline" className={videoStatus === 'ready' ? 'border-green-600 text-green-700' : videoStatus === 'error' ? 'border-red-600 text-red-700' : 'border-yellow-600 text-yellow-700'}>
                {videoStatus.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {geminiStatus === 'ready' ? <CheckCircle className="w-4 h-4 text-green-600" /> : geminiStatus === 'error' ? <AlertCircle className="w-4 h-4 text-red-600" /> : <Clock className="w-4 h-4 text-yellow-600" />}
              <span>Conversational Feedback</span>
              <Badge variant="outline" className={geminiStatus === 'ready' ? 'border-green-600 text-green-700' : geminiStatus === 'error' ? 'border-red-600 text-red-700' : 'border-yellow-600 text-yellow-700'}>
                {geminiStatus.toUpperCase()}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {(geminiData && isMeaningfulGemini(geminiData)) || geminiText || (dbTranscript && dbTranscript.trim().length > 0) ? (
        <Card className="border-2 border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" /> SuperAI Feedback
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* High-level numbers */}
            <div className="flex items-center gap-4">
              {(llmOverall10 != null || (geminiData && (geminiData.overallScore10 ?? 0) > 0)) ? (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Overall (Conversation)</div>
                  <div className="text-3xl font-bold">{(llmOverall10 ?? geminiData?.overallScore10)}/10</div>
                </div>
              ) : geminiText ? (
                <div className="text-sm text-muted-foreground">Numeric scores are unavailable. Narrative shown below.</div>
              ) : null}
              {geminiData && (
                <Badge variant="secondary" className="capitalize">{geminiData.interviewType || 'general'}</Badge>
              )}
            </div>

            {/* Metrics grid: clarity, structure, technical depth (if present) */}
            {geminiData && Array.isArray(geminiData.metrics) && geminiData.metrics.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Overall Performance as first metric card */}
                {(() => {
                  const overall = (llmOverall10 ?? geminiData?.overallScore10) as number | null;
                  return (overall != null) ? (
                    <div key="overall" className="p-3 rounded-md border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium flex items-center gap-2">
                          <BarChart2 className="w-4 h-4" /> Overall Performance
                        </div>
                        <Badge>{overall}/10</Badge>
                      </div>
                      <Progress value={Math.max(0, Math.min(100, (overall ?? 0) * 10))} />
                    </div>
                  ) : null;
                })()}
                {geminiData.metrics.map((m, idx) => (
                  <div key={idx} className="p-3 rounded-md border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium flex items-center gap-2">
                        <BarChart2 className="w-4 h-4" /> {m.name}
                      </div>
                      <Badge>{m.score10}/10</Badge>
                    </div>
                    <Progress value={Math.max(0, Math.min(100, (m.score10 ?? 0) * 10))} />
                  </div>
                ))}
              </div>
            )}

            {/* Detailed Narrative (optional) */}
            {geminiText && (
              <div>
                <div className="font-semibold mb-2">Narrative Summary</div>
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{geminiText}</pre>
              </div>
            )}

            {/* Interview Chat (parsed transcript) with fallback */}
            {dbTranscript && (
              <div>
                <div className="font-semibold mb-2">Interview Chat</div>
                {chatTurns.length > 0 ? (
                  <div className="max-h-64 overflow-auto space-y-2">
                    {chatTurns.map((t, i) => (
                      <div key={i} className={`p-2 rounded border ${roleStyle(t.role)}`}>
                        <div className="text-[11px] font-semibold mb-1">{roleLabel(t.role)}</div>
                        <div className="text-sm whitespace-pre-wrap">{t.text}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="max-h-64 overflow-auto p-3 bg-muted rounded border">
                    <pre className="whitespace-pre-wrap text-xs">{dbTranscript}</pre>
                  </div>
                )}
                <div className="mt-2">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="raw-transcript">
                      <AccordionTrigger>Raw Transcript</AccordionTrigger>
                      <AccordionContent>
                        <div className="max-h-64 overflow-auto p-3 bg-muted rounded border">
                          <pre className="whitespace-pre-wrap text-xs">{dbTranscript}</pre>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <LoadingAnimation message="Preparing conversational feedback..." />
            <p className="text-sm text-gray-600 mt-3">This usually takes under a minute.</p>
          </CardContent>
        </Card>
      )}

      {/* Video Analysis Feedback Segment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5" /> Video Analysis Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Analysis Tracker */}
          <div className="rounded-md border p-3 bg-muted/50">
            <div className="text-sm font-medium mb-2">Analysis Tracker</div>
            <ol className="list-decimal pl-5 text-sm space-y-1 text-muted-foreground">
              <li>
                Uploading video — {Array.isArray(videoData) && videoData.length > 0 ? <span className="text-green-700">Done</span> : <span>Pending/Processing</span>}
              </li>
              <li>
                Running analysis — {Array.isArray(videoData) && videoData.length > 0 ? <span className="text-green-700">Done</span> : <span>In progress</span>}
              </li>
              <li>
                Results ready — {videoResultsReady ? <span className="text-green-700">Done</span> : <span>Waiting</span>}
              </li>
            </ol>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Stats</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-md border">
                <div className="font-medium mb-1">Confidence</div>
                <div className="text-2xl font-bold">{extractedFromRaw.confidencePct != null ? `${extractedFromRaw.confidencePct}%` : '—'}</div>
              </div>
              <div className="p-3 rounded-md border">
                <div className="font-medium mb-1">Faces Detected</div>
                <div className="text-2xl font-bold">{extractedFromRaw.faceCount != null ? extractedFromRaw.faceCount : '—'}</div>
              </div>
              <div className="p-3 rounded-md border">
                <div className="font-medium">Clarity (0-100)</div>
                <div className="text-2xl font-bold">{videoNums.clarity ?? '—'}</div>
              </div>
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2">Communication Signals</div>
          {/* Communication Signals (from raw JSON analysis) */}
          {behaviorSignals && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
              <div className="p-3 rounded-md border">
                <div className="font-medium mb-1">Eye Contact</div>
                <div className="text-2xl font-bold capitalize">{behaviorSignals.eyeContact.label}</div>
                {typeof behaviorSignals.eyeContact.score === 'number' && isFinite(behaviorSignals.eyeContact.score) && (
                  <div className="text-xs text-muted-foreground">{Math.round(Math.max(0, Math.min(100, behaviorSignals.eyeContact.score * (behaviorSignals.eyeContact.score <= 1 ? 100 : 1))))}%</div>
                )}
              </div>
              <div className="p-3 rounded-md border">
                <div className="font-medium mb-1">Facial Expressiveness</div>
                <div className="text-2xl font-bold capitalize">{behaviorSignals.facialExpressiveness.label}</div>
                {typeof behaviorSignals.facialExpressiveness.smileScore === 'number' && isFinite(behaviorSignals.facialExpressiveness.smileScore) && (
                  <div className="text-xs text-muted-foreground">{Math.round(Math.max(0, Math.min(100, behaviorSignals.facialExpressiveness.smileScore * (behaviorSignals.facialExpressiveness.smileScore <= 1 ? 100 : 1))))}% smiling</div>
                )}
              </div>
              <div className="p-3 rounded-md border">
                <div className="font-medium mb-1">Pace (WPM)</div>
                <div className="text-2xl font-bold">{behaviorSignals.pace.wordsPerMinute != null ? Math.round(behaviorSignals.pace.wordsPerMinute) : (extractedFromRaw.wpm ?? '—')}</div>
                <div className="text-xs text-muted-foreground">{behaviorSignals.pace.wordCount} words • {Math.round(behaviorSignals.pace.durationSeconds)}s</div>
              </div>
              <div className="p-3 rounded-md border">
                <div className="font-medium mb-1">Filler & Hedging</div>
                <div className="text-2xl font-bold">{behaviorSignals.fillerAndHedging.totals.combined}</div>
                <div className="text-xs text-muted-foreground">
                  {behaviorSignals.fillerAndHedging.totals.perMinute != null ? `${behaviorSignals.fillerAndHedging.totals.perMinute.toFixed(1)}/min` : '—'}
                  {' • '}
                  {behaviorSignals.fillerAndHedging.totals.per100Words != null ? `${behaviorSignals.fillerAndHedging.totals.per100Words.toFixed(1)}/100w` : '—'}
                </div>
                {(behaviorSignals.fillerAndHedging.topFillers?.length > 0 || behaviorSignals.fillerAndHedging.topHedging?.length > 0) && (
                  <div className="text-xs mt-2 text-muted-foreground">
                    {behaviorSignals.fillerAndHedging.topFillers?.length > 0 && (
                      <div>Top fillers: {behaviorSignals.fillerAndHedging.topFillers.slice(0,3).map(([k,v]: any) => `${k}(${v})`).join(', ')}</div>
                    )}
                    {behaviorSignals.fillerAndHedging.topHedging?.length > 0 && (
                      <div>Top hedging: {behaviorSignals.fillerAndHedging.topHedging.slice(0,3).map(([k,v]: any) => `${k}(${v})`).join(', ')}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-2">
            <Accordion type="single" collapsible>
              <AccordionItem value="raw-json">
                <AccordionTrigger>Raw Video Analysis JSON</AccordionTrigger>
                <AccordionContent>
                  <div className="max-h-64 overflow-auto p-3 bg-muted rounded border text-xs">
                    <pre className="whitespace-pre text-[11px]">{videoData ? JSON.stringify(videoData, null, 2) : 'No analysis JSON available yet.'}</pre>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="py-6 text-center text-red-600 flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={() => window.location.reload()} variant="outline">Refresh</Button>
        {onBack && <Button variant="secondary" onClick={onBack}>Back</Button>}
      </div>
    </div>
  )
}
