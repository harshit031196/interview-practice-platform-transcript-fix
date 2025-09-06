'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function TestAIPage() {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)

  const runMockAnalysis = async () => {
    setIsAnalyzing(true)
    setAnalysisResult(null)

    // Simulate analysis time
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Mock analysis result
    const mockResult = {
      transcript: "The candidate provided a comprehensive answer discussing their experience with React and Node.js development. They mentioned working on several full-stack projects and demonstrated good understanding of modern web development practices. The response included specific examples of challenges faced and how they were overcome, showing problem-solving skills and technical depth.",
      speaking_metrics: {
        speaking_rate: 145,
        pause_count: 8,
        confidence: 0.87,
        duration: 180
      },
      content_analysis: {
        clarity: 8,
        relevance: 9,
        depth: 7,
        examples: 8
      },
      communication_skills: {
        articulation: 8,
        confidence: 7,
        engagement: 9
      },
      strengths: [
        "Clear and articulate communication",
        "Relevant technical examples",
        "Good understanding of the subject matter",
        "Confident delivery"
      ],
      areas_for_improvement: [
        "Could provide more specific metrics or results",
        "Consider structuring responses with clear intro-body-conclusion",
        "Add more details about challenges faced and overcome"
      ],
      overall_feedback: "The candidate demonstrated strong technical knowledge and communication skills. The response was well-structured and relevant to the question. To improve further, consider providing more specific examples with quantifiable results and impact.",
      overall_score: 78,
      detailed_scores: {
        technical_knowledge: 85,
        communication: 75,
        problem_solving: 80,
        cultural_fit: 72
      },
      recommendations: [
        "Practice the STAR method (Situation, Task, Action, Result) for behavioral questions",
        "Prepare specific metrics and achievements to quantify your impact",
        "Work on reducing filler words and pauses for smoother delivery"
      ]
    }

    setAnalysisResult(mockResult)
    setIsAnalyzing(false)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">AI Analysis Demo</h1>
        <p className="text-gray-600 mb-6">
          This demonstrates the AI-powered interview analysis functionality
        </p>
        
        <Button 
          onClick={runMockAnalysis} 
          disabled={isAnalyzing}
          size="lg"
          className="mb-8"
        >
          {isAnalyzing ? 'Analyzing Interview...' : 'Run AI Analysis Demo'}
        </Button>
      </div>

      {isAnalyzing && (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center space-x-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-lg">Analyzing interview response...</p>
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <p>• Processing audio and video content</p>
              <p>• Generating transcript using Speech-to-Text</p>
              <p>• Analyzing communication patterns</p>
              <p>• Evaluating content quality with AI</p>
              <p>• Generating personalized feedback</p>
            </div>
          </CardContent>
        </Card>
      )}

      {analysisResult && (
        <div className="space-y-6">
          {/* Overall Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Overall Performance
                <Badge className={`text-lg px-4 py-2 ${getScoreColor(analysisResult.overall_score)}`}>
                  {analysisResult.overall_score}/100
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700">{analysisResult.overall_feedback}</p>
            </CardContent>
          </Card>

          {/* Detailed Scores */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Scores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(analysisResult.detailed_scores).map(([key, score]) => (
                  <div key={key} className="text-center">
                    <div className={`rounded-lg p-4 ${getScoreColor(score as number)}`}>
                      <div className="text-2xl font-bold">{String(score)}</div>
                      <div className="text-sm capitalize">
                        {key.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Speaking Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Speaking Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {analysisResult.speaking_metrics.speaking_rate}
                  </div>
                  <div className="text-sm text-gray-600">Words/min</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(analysisResult.speaking_metrics.confidence * 100)}%
                  </div>
                  <div className="text-sm text-gray-600">Confidence</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {analysisResult.speaking_metrics.pause_count}
                  </div>
                  <div className="text-sm text-gray-600">Pauses</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {Math.floor(analysisResult.speaking_metrics.duration / 60)}m {analysisResult.speaking_metrics.duration % 60}s
                  </div>
                  <div className="text-sm text-gray-600">Duration</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strengths and Improvements */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-green-700">Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysisResult.strengths.map((strength: string, index: number) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-orange-700">Areas for Improvement</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysisResult.areas_for_improvement.map((improvement: string, index: number) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-orange-500 mt-1">→</span>
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {analysisResult.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex items-start space-x-3">
                    <Badge variant="outline" className="mt-1 min-w-fit">
                      {index + 1}
                    </Badge>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle>Interview Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700 leading-relaxed">
                  "{analysisResult.transcript}"
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
