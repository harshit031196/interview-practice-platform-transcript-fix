// Shared analysis aggregation utility to be used from both server and client code

// Define a type for individual analysis results for clarity (kept broad for now)
export type AnalysisSegment = any;

export function aggregateAnalysisResults(results: any[]) {
  if (!results || results.length === 0) {
    console.log('⚠️ No analysis results to aggregate');
    return {};
  }

  console.log(`🔄 Aggregating ${results.length} analysis segments`);

  // Validate results array to ensure all items are valid objects
  const validResults = results.filter((result) => {
    if (!result || typeof result !== 'object') {
      console.error('⚠️ Invalid result item:', result);
      return false;
    }
    return true;
  });

  if (validResults.length === 0) {
    console.error('⚠️ No valid results to aggregate after filtering');
    return {};
  }

  // Sort results by segmentIndex to ensure proper order
  validResults.sort((a, b) => {
    const indexA = a.segmentIndex !== undefined ? Number(a.segmentIndex) : 0;
    const indexB = b.segmentIndex !== undefined ? Number(b.segmentIndex) : 0;
    return indexA - indexB;
  });

  // Log segment information for debugging
  validResults.forEach((result: any, i: number) => {
    console.log(
      `Segment ${i}: index=${result.segmentIndex || 0}, id=${
        result.id ? result.id.substring(0, 8) : 'unknown'
      }`
    );
  });

  const aggregated = {
    speech_analysis: {
      transcript: '',
      total_words: 0,
      words_per_minute: 0,
      clarity_score: 0,
      filler_words: { count: 0, percentage: 0, details: [] as any[] },
      pacing_analysis: { wpm_timeline: [] as any[] },
      utterances: [] as any[],
    },
    facial_analysis: {
      emotion_timeline: [] as any[],
      emotion_statistics: {
        joy: { average: 0, max: 0, min: 1, std: 0 },
        sorrow: { average: 0, max: 0, min: 1, std: 0 },
        anger: { average: 0, max: 0, min: 1, std: 0 },
        surprise: { average: 0, max: 0, min: 1, std: 0 },
      },
      total_frames_analyzed: 0,
      average_detection_confidence: 0,
    },
    confidence_analysis: {
      average_eye_contact_score: 0,
      eye_contact_consistency: 0,
      head_stability_score: 0,
      confidence_score: 0,
    },
    overall_score: {
      overall_score: 0,
      grade: '',
      component_scores: {} as Record<string, any>,
    },
    annotationResults: [] as any[],
    durationSec: 0,
  };

  const numResults = results.length;

  validResults.forEach((result: any) => {
    try {
      // Extract results from either direct results field or nested in analysisData
      const analysis = result.results || result.analysisData || {};
      aggregated.durationSec += analysis.durationSec || 0;

      // Aggregate speech analysis
      if (analysis.speech_analysis) {
        aggregated.speech_analysis.transcript +=
          analysis.speech_analysis.transcript + ' ';
        aggregated.speech_analysis.total_words +=
          analysis.speech_analysis.total_words || 0;
        aggregated.speech_analysis.words_per_minute +=
          (analysis.speech_analysis.words_per_minute || 0) / numResults;
        aggregated.speech_analysis.clarity_score +=
          (analysis.speech_analysis.clarity_score || 0) / numResults;
        if (analysis.speech_analysis.filler_words) {
          aggregated.speech_analysis.filler_words.count +=
            analysis.speech_analysis.filler_words.count || 0;
          aggregated.speech_analysis.filler_words.details.push(
            ...(analysis.speech_analysis.filler_words.details || [])
          );
        }
        if (analysis.speech_analysis.pacing_analysis) {
          aggregated.speech_analysis.pacing_analysis.wpm_timeline.push(
            ...(analysis.speech_analysis.pacing_analysis.wpm_timeline || [])
          );
        }
        if (analysis.speech_analysis.utterances) {
          aggregated.speech_analysis.utterances.push(
            ...(analysis.speech_analysis.utterances || [])
          );
        }
      }

      // Aggregate facial analysis
      if (analysis.facial_analysis) {
        aggregated.facial_analysis.total_frames_analyzed +=
          analysis.facial_analysis.total_frames_analyzed || 0;
        aggregated.facial_analysis.average_detection_confidence +=
          (analysis.facial_analysis.average_detection_confidence || 0) /
          numResults;
        if (analysis.facial_analysis.emotion_statistics) {
          for (const emotion in aggregated.facial_analysis.emotion_statistics) {
            const key = emotion as keyof typeof aggregated.facial_analysis.emotion_statistics;
            if (analysis.facial_analysis.emotion_statistics[key]) {
              aggregated.facial_analysis.emotion_statistics[key].average +=
                analysis.facial_analysis.emotion_statistics[key].average /
                numResults;
              aggregated.facial_analysis.emotion_statistics[key].max = Math.max(
                aggregated.facial_analysis.emotion_statistics[key].max,
                analysis.facial_analysis.emotion_statistics[key].max
              );
              aggregated.facial_analysis.emotion_statistics[key].min = Math.min(
                aggregated.facial_analysis.emotion_statistics[key].min,
                analysis.facial_analysis.emotion_statistics[key].min
              );
            }
          }
        }
      }

      // Aggregate confidence analysis
      if (analysis.confidence_analysis) {
        aggregated.confidence_analysis.average_eye_contact_score +=
          (analysis.confidence_analysis.average_eye_contact_score || 0) /
          numResults;
        aggregated.confidence_analysis.eye_contact_consistency +=
          (analysis.confidence_analysis.eye_contact_consistency || 0) /
          numResults;
        aggregated.confidence_analysis.head_stability_score +=
          (analysis.confidence_analysis.head_stability_score || 0) /
          numResults;
        aggregated.confidence_analysis.confidence_score +=
          (analysis.confidence_analysis.confidence_score || 0) / numResults;
      }

      // Combine raw annotation results for debugging and detailed views
      if (result.annotationResults) {
        aggregated.annotationResults.push(...result.annotationResults);
      }
    } catch (error) {
      console.error('Error processing segment data:', error, 'Segment:', result);
    }
  });

  // Final calculations
  if (aggregated.speech_analysis.total_words > 0) {
    aggregated.speech_analysis.filler_words.percentage =
      (aggregated.speech_analysis.filler_words.count /
        aggregated.speech_analysis.total_words) * 100;
  }

  // Ensure transcript is a string before trimming
  if (typeof aggregated.speech_analysis.transcript === 'string') {
    aggregated.speech_analysis.transcript =
      aggregated.speech_analysis.transcript.trim();
  } else {
    aggregated.speech_analysis.transcript = '';
  }

  console.log('✅ Analysis aggregation completed successfully');
  return { videoAnalysis: aggregated };
}
