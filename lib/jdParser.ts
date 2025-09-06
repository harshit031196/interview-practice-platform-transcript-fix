// Simple job description parser with keyword extraction
export function parseJobDescription(jdText: string) {
  // Simple TF-IDF-ish keyword extraction
  const commonWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall',
    'this', 'that', 'these', 'those', 'we', 'you', 'they', 'our', 'your', 'their'
  ])

  // Extract words and filter
  const words = jdText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.has(word))

  // Count word frequency
  const wordCount = new Map<string, number>()
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1)
  })

  // Get top keywords (words appearing more than once)
  const keywords = Array.from(wordCount.entries())
    .filter(([_, count]) => count > 1)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 15)
    .map(([word, _]) => word)

  // Extract responsibilities (lines starting with action words)
  const actionWords = ['develop', 'build', 'create', 'design', 'implement', 'manage', 'lead', 'collaborate', 'work', 'drive', 'execute', 'analyze', 'research']
  const lines = jdText.split('\n').map(line => line.trim())
  const responsibilities = lines
    .filter(line => 
      line.length > 10 && 
      actionWords.some(action => line.toLowerCase().includes(action))
    )
    .slice(0, 8)

  return {
    keywords: keywords.map(k => k.charAt(0).toUpperCase() + k.slice(1)),
    responsibilities
  }
}
