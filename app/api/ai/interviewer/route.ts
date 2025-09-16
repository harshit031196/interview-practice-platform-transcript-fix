import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vertex AI client will be created lazily inside the request handler to avoid build-time env issues

// Use the originally working model and API surface in us-central1
// Primary model restored per request
const PRIMARY_MODEL = 'gemini-2.5-flash';
// Keep a conservative fallback in case of regional/access issues
const FALLBACK_MODEL = 'gemini-1.5-pro-001';

// Build a deterministic, contextual fallback to avoid random questions mid-interview
function buildContextualFallback(
  interviewType: string,
  userResponse?: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): string {
  const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.role === 'assistant')?.content || '';
  const lastUserMsg = (userResponse || '').toLowerCase();
  const lastAssistantLower = lastAssistantMsg.toLowerCase();

  if (interviewType === 'product') {
    // Heuristics tailored to PM conversations
    if (
      lastUserMsg.includes('metric') ||
      lastUserMsg.includes('kpi') ||
      lastUserMsg.includes('north star')
    ) {
      return 'Which success metrics would you define for this and why?';
    }
    if (
      lastUserMsg.includes('favorite product') ||
      lastAssistantLower.includes('favorite product')
    ) {
      return 'What is one concrete improvement you would propose and how would you validate it?';
    }
    if (
      lastUserMsg.includes('root cause') ||
      lastAssistantLower.includes('root cause') ||
      lastUserMsg.includes('problem') ||
      lastUserMsg.includes('pain')
    ) {
      return 'What hypotheses would you test to identify the root cause, and how would you prioritize next steps?';
    }
    // Default PM follow-up keeps momentum and avoids randomness
    return 'What metrics would you track to measure the success of your approach?';
  }

  if (interviewType === 'behavioral') {
    return 'What was the outcome, and what did you learn from it?';
  }

  if (interviewType === 'technical') {
    return 'Can you outline your step-by-step approach and key trade-offs?';
  }

  if (interviewType === 'system-design' || interviewType === 'system design') {
    return 'What are the main bottlenecks and how would you scale this system?';
  }

  // Generic deterministic fallback
  return 'Could you summarize your approach in one or two sentences?';
}

// Map interview type to appropriate job role and guideline emphasis
function deriveRoleAndGuidelines(
  interviewType: string,
  incomingRole?: string
): { role: string; guidelines: string } {
  const t = (interviewType || '').toLowerCase().replace(/\s+/g, '-');

  if (t === 'product') {
    return {
      role: 'Product Manager',
      guidelines: [
        '- Focus on product strategy, defining problems, and user-centric thinking',
        '- Ask about success metrics (North Star, KPIs), experimentation, and measurement',
        '- Explore prioritization frameworks (e.g., RICE/ICE), trade-offs, and roadmap reasoning',
        '- Include favorite product critique, root-cause analysis, and hypothesis-driven approaches',
        '- Avoid coding or low-level system design topics; keep it PM-focused'
      ].join('\n')
    };
  }

  if (t === 'technical') {
    return {
      role: 'Software Engineer',
      guidelines: [
        '- Focus on algorithms, data structures, complexity, and debugging approaches',
        '- Probe for edge cases, testing strategy, and code quality practices',
        '- Keep questions practical and implementation-oriented (no product strategy topics)'
      ].join('\n')
    };
  }

  if (t === 'system-design') {
    return {
      role: 'Software Engineer',
      guidelines: [
        '- Focus on architecture, scalability, reliability, and trade-offs',
        '- Ask about components, APIs, data modeling, consistency, and bottlenecks',
        '- Keep it SWE-focused (avoid PM-only topics like go-to-market or product strategy)'
      ].join('\n')
    };
  }

  // Behavioral supports both roles; optionally honor an explicit incoming role
  const normalizedIncoming = (incomingRole || '').toLowerCase();
  const explicitRole = /product\s*manager|pm/.test(normalizedIncoming)
    ? 'Product Manager'
    : /software\s*(engineer|developer)|swe|sde/.test(normalizedIncoming)
      ? 'Software Engineer'
      : 'Software Engineer or Product Manager';
  return {
    role: explicitRole,
    guidelines: [
      '- Focus on past experiences using the STAR method (Situation, Task, Action, Result)',
      '- Cover leadership, teamwork, conflict resolution, ownership, and communication',
      '- If the candidate\'s target role (PM vs SWE) is unclear, start with one brief clarifying question and then tailor follow-ups accordingly'
    ].join('\n')
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/ai/interviewer - Checking authentication');
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions);
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id;
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
      // If not found, check for database-specific session token (for hybrid fallback)
      if (!sessionToken) {
        sessionToken = request.cookies.get('next-auth.database-session')?.value;
        if (sessionToken) {
          console.log('[API] Found database-specific session token');
        }
      }
      
      if (sessionToken) {
        console.log('[API] Checking database session with token');
        try {
          const dbSession = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          });
          
          if (dbSession && dbSession.expires > new Date()) {
            userId = dbSession.userId;
            console.log('[API] Authenticated via database session for user ID:', userId);
          } else {
            console.log('[API] Database session invalid or expired');
          }
        } catch (error) {
          console.error('[API] Error checking database session:', error);
        }
      }
    }
    
    if (!userId) {
      console.error('[API] Unauthorized AI interviewer request - no valid session');
      return NextResponse.json({ error: 'Unauthorized - please sign in' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for AI interviewer: ${userId}`);

    const body = await request.json();
    const { 
      userResponse, 
      conversationHistory = [], 
      jobRole: incomingJobRole = 'Software Engineer',
      company = 'FAANG',
      interviewType = 'behavioral'
    } = body;

    const { role: effectiveJobRole, guidelines: typeGuidelines } = deriveRoleAndGuidelines(interviewType, incomingJobRole);

    console.log('Interviewer API called with:', { userResponse, conversationHistory, incomingJobRole, effectiveJobRole, company, interviewType });

    // System prompt for the AI interviewer
    const systemPrompt = `You are an experienced ${company} interviewer conducting a ${interviewType} interview for a ${effectiveJobRole} position. 

Your role:
- Ask CONCISE, direct questions (1-2 sentences maximum)
- Be brief and to the point - avoid lengthy explanations
- Focus on clear, specific questions that get straight to the point
- Maintain a professional tone
- Ask one question at a time
- Build upon previous responses naturally

Interview Type Guidelines:
${typeGuidelines}`;

    // Prepare the conversation context
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...conversationHistory,
    ];

    // Add user response if provided, but avoid duplicating the last user message
    if (userResponse) {
      const lastMsg = messages[messages.length - 1];
      const normalizedLast = (lastMsg?.role === 'user' && typeof lastMsg.content === 'string')
        ? lastMsg.content.trim()
        : '';
      const normalizedIncoming = typeof userResponse === 'string' ? userResponse.trim() : '';
      const shouldAppend = normalizedIncoming.length > 0 && normalizedIncoming !== normalizedLast;
      if (shouldAppend) {
        messages.push({ role: 'user', content: normalizedIncoming });
      } else {
        console.log('[API] Skipping appending userResponse to avoid duplicate last user message');
      }
    }

    // Lazily resolve Vertex AI project and location. Fallback to metadata server if envs are not set.
    const ENV_PROJECT = process.env.GOOGLE_CLOUD_PROJECT 
      || process.env.GOOGLE_CLOUD_PROJECT_ID 
      || (process.env as any).GCLOUD_PROJECT 
      || (process.env as any).GCP_PROJECT 
      || (process.env as any).PROJECT_ID;

    const V_LOCATION = process.env.GOOGLE_CLOUD_LOCATION 
      || (process.env as any).GOOGLE_CLOUD_REGION 
      || (process.env as any).CLOUD_REGION 
      || 'us-central1';

    const resolveProject = async (): Promise<string | null> => {
      if (ENV_PROJECT && typeof ENV_PROJECT === 'string') return ENV_PROJECT;
      try {
        const resp = await fetch('http://metadata.google.internal/computeMetadata/v1/project/project-id', {
          headers: { 'Metadata-Flavor': 'Google' },
        });
        if (resp.ok) {
          const txt = await resp.text();
          return (txt || '').trim() || null;
        }
      } catch {}
      return null;
    };

    const PROJECT_ID = await resolveProject();
    console.log('[VertexAI] init', { project: PROJECT_ID, location: V_LOCATION });

    let vertex_ai: VertexAI;
    try {
      if (!PROJECT_ID) {
        throw new Error('Missing project id for VertexAI');
      }
      vertex_ai = new VertexAI({ project: PROJECT_ID, location: V_LOCATION });
    } catch (e) {
      console.error('[VertexAI] initialization failed:', e);
      const contextual = buildContextualFallback(interviewType, userResponse, conversationHistory);
      return NextResponse.json({ question: contextual });
    }

    // Generate AI response using Gemini (preview surface for 2.5 models)
    let generativeModel = vertex_ai.preview.getGenerativeModel({
      model: PRIMARY_MODEL,
      generationConfig: {
        maxOutputTokens: 800, // Increased to ensure complete responses
        temperature: 0.5, // Lower temperature for more consistent responses
        topP: 0.8, // Balanced topP for controlled diversity
        topK: 30, // Adjusted topK for better sampling
        stopSequences: [], // No stop sequences to ensure complete responses
      },
      // Add safety settings to avoid empty responses due to safety filters
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
        }
      ],
    });

    // Convert messages to Gemini format
    const prompt = messages.map((msg: {role: string, content: string}) => {
      if (msg.role === 'system') return `System: ${msg.content}`;
      if (msg.role === 'user') return `Candidate: ${msg.content}`;
      return `Interviewer: ${msg.content}`;
    }).join('\n\n');

    console.log('Sending prompt to Gemini:', prompt);

    // Concise fallback questions by interview type
    const fallbackQuestions: Record<string, string[]> = {
      behavioral: [
        "Describe a challenge you overcame at work.",
        "How did you handle a difficult team member?",
        "Share a decision you made with limited information.",
        "What's a failure you learned from?",
        "Tell me about a time you led a project.",
        "Describe a situation where you had to meet a tight deadline.",
        "How have you handled disagreements with your manager?",
        "Tell me about a time you went above and beyond.",
        "How do you handle stress or pressure?",
        "Describe a time you had to adapt to a significant change.",
        "Tell me about a time you received difficult feedback.",
        "How have you resolved conflicts in your team?",
        "Describe a situation where you influenced others without authority.",
        "Tell me about a time you had to make an unpopular decision."
      ],
      technical: [
        "How do you debug complex issues?",
        "How do you stay updated with new technologies?",
        "What technical project are you most proud of?",
        "How do you ensure code maintainability?"
      ],
      'system-design': [
        "How would you design a URL shortening service like bit.ly?",
        "Can you walk me through how you would design a distributed cache?",
        "How would you design a notification system that can handle millions of users?",
        "What considerations would you make when designing a real-time chat application?"
      ],
      product: [
        "How do you prioritize product features?",
        "Describe a product trade-off you had to make.",
        "How do you measure feature success?",
        "How do you understand user needs?"
      ]
    };
    
    let aiResponse;
    try {
      console.log('[API] Calling Gemini API (preview) with model:', PRIMARY_MODEL);
      let result;
      try {
        result = await generativeModel.generateContent(prompt);
      } catch (err: any) {
        const msg = (err && (err.message || err.toString())) || ''
        const is404 = (err?.code === 404) || /NOT_FOUND|was not found|404/i.test(msg)
        if (is404) {
          console.warn('[API] Primary model not found or not accessible, falling back to:', FALLBACK_MODEL)
          generativeModel = vertex_ai.preview.getGenerativeModel({
            model: FALLBACK_MODEL,
            generationConfig: {
              maxOutputTokens: 800,
              temperature: 0.5,
              topP: 0.8,
              topK: 30,
              stopSequences: [],
            },
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
              }
            ],
          })
          result = await generativeModel.generateContent(prompt)
        } else {
          throw err
        }
      }
      const response = result.response;
      
      // Log the response structure for debugging
      console.log('[API] Gemini response structure:', {
        hasResponse: !!response,
        hasCandidates: !!response?.candidates && Array.isArray(response?.candidates),
        candidatesLength: response?.candidates?.length || 0,
        hasContent: !!response?.candidates?.[0]?.content,
        hasParts: !!response?.candidates?.[0]?.content?.parts,
        partsLength: response?.candidates?.[0]?.content?.parts?.length || 0,
        hasText: !!response?.candidates?.[0]?.content?.parts?.[0]?.text
      });
      
      // Note: Gemini responses commonly have content.role === 'model'.
      // Do NOT prematurely fallback based solely on missing parts.
      // We will first attempt robust text extraction; only fallback if no text is found.
      
      // Check if parts array exists and has text content
      const hasParts = !!response?.candidates?.[0]?.content?.parts && 
                      Array.isArray(response?.candidates?.[0]?.content?.parts) && 
                      response?.candidates?.[0]?.content?.parts.length > 0;
      
      // Try multiple ways to extract text from the response
      let extractedResponse = null;
      
      // Method 0: Join all parts' text if present
      if (hasParts && response?.candidates?.[0]?.content?.parts) {
        const parts = response.candidates[0].content.parts as any[];
        const joined = parts
          .map((p: any) => (p && typeof p.text === 'string' ? p.text : ''))
          .filter((t: string) => t && t.trim().length > 0)
          .join(' ')
          .trim();
        if (joined) {
          extractedResponse = joined;
          console.log('[API] Extracted text using Method 0 (joined parts):', extractedResponse);
        }
      }
      
      // Method 1: Standard parts[0].text extraction
      if (!extractedResponse && hasParts && response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        extractedResponse = response.candidates[0].content.parts[0].text;
        console.log('[API] Extracted text using Method 1:', extractedResponse);
      } 
      // Method 2: Check if parts has any text property in any element
      else if (!extractedResponse && hasParts && response?.candidates?.[0]?.content?.parts) {
        const parts = response.candidates[0].content.parts;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
            extractedResponse = part.text;
            console.log('[API] Extracted text using Method 2:', extractedResponse);
            break;
          }
        }
      }
      // Method 3: Check if content has any string property we can use
      else if (!extractedResponse && response?.candidates?.[0]?.content) {
        const content = response.candidates[0].content;
        // Try to find any string property in the content object
        for (const key in content) {
          if (typeof (content as any)[key] === 'string' && (content as any)[key].length > 0) {
            extractedResponse = (content as any)[key];
            console.log('[API] Extracted text using Method 3:', key);
            break;
          }
        }
      }
      // Method 4: Use response.text() convenience if available
      if (!extractedResponse && typeof (response as any)?.text === 'function') {
        try {
          const textVal = (response as any).text();
          if (typeof textVal === 'string' && textVal.trim().length > 0) {
            extractedResponse = textVal;
            console.log('[API] Extracted text using Method 4 (response.text())');
          }
        } catch (e) {
          // ignore
        }
      }
      
      // Assign the extracted response to aiResponse
      aiResponse = extractedResponse;
      
      // Dump the full response structure for debugging
      console.log('[API] Full response structure:', JSON.stringify(response?.candidates?.[0]?.content, null, 2));
      
      // Validate response content: if empty, retry once before contextual fallback
      if (!aiResponse || aiResponse.trim() === '') {
        console.warn('[API] Empty text extracted from Gemini. Retrying once...');
        try {
          const retry = await generativeModel.generateContent(prompt);
          const retryResp = retry.response;

          // Try text() first if available
          let retryText: string | null = null;
          if (typeof (retryResp as any)?.text === 'function') {
            try {
              const t = (retryResp as any).text();
              if (typeof t === 'string' && t.trim().length > 0) {
                retryText = t;
              }
            } catch {}
          }

          if (!retryText) {
            const retryParts = retryResp?.candidates?.[0]?.content?.parts as any[] | undefined;
            if (Array.isArray(retryParts)) {
              const joined = retryParts
                .map((p: any) => (p && typeof p.text === 'string' ? p.text : ''))
                .filter((t: string) => t && t.trim().length > 0)
                .join(' ')
                .trim();
              if (joined) retryText = joined;
            }
          }

          if (!retryText) {
            const c = retryResp?.candidates?.[0]?.content as any;
            if (c && typeof c === 'object') {
              for (const k in c) {
                if (typeof c[k] === 'string' && c[k].trim().length > 0) {
                  retryText = c[k];
                  break;
                }
              }
            }
          }

          if (retryText && retryText.trim().length > 0) {
            aiResponse = retryText.trim();
            console.log('[API] Retry succeeded with text from Gemini');
          } else {
            console.error('[API] Retry still produced no text. Falling back deterministically.');
            const contextual = buildContextualFallback(interviewType, userResponse, conversationHistory);
            return NextResponse.json({ question: contextual });
          }
        } catch (e) {
          console.error('[API] Retry errored. Falling back deterministically.', e);
          const contextual = buildContextualFallback(interviewType, userResponse, conversationHistory);
          return NextResponse.json({ question: contextual });
        }
      }
    } catch (error) {
      console.error('[API] Error generating content from Gemini:', error);
      
      // Deterministic fallback on error (no randomness)
      aiResponse = buildContextualFallback(interviewType, userResponse, conversationHistory);
      console.log(`[API] Using deterministic contextual fallback for ${interviewType} interview:`, aiResponse);
    }

    // Store the extracted response in a local variable to prevent it from being lost
    const extractedAiResponse = aiResponse;
    console.log('Generated AI response:', extractedAiResponse);

    // Ensure we have a valid response
    let finalResponse = extractedAiResponse;
    if (!finalResponse || finalResponse.trim() === '') {
      console.error('[API] Final aiResponse is empty or undefined, using deterministic contextual fallback');
      finalResponse = buildContextualFallback(interviewType, userResponse, conversationHistory);
      console.log('[API] Using deterministic contextual fallback:', finalResponse);
    }

    // Sanitize leading role prefixes like "Interviewer:" or "Candidate:" in the AI output
    const stripRolePrefix = (s: string) => {
      if (!s) return s;
      let out = s.trim();
      // Remove one leading role prefix if present
      out = out.replace(/^\s*(Interviewer|Candidate|Assistant|System)\s*[:\-—]\s*/i, '');
      return out.trim();
    }

    finalResponse = stripRolePrefix(finalResponse);

    // Create updated conversation history for the response
    // We don't need to persist this in the database as the frontend maintains the conversation state
    const updatedHistory = [
      ...messages,
      {
        role: 'assistant',
        content: finalResponse
      }
    ];
    
    // Log the updated conversation history
    console.log('[API] Updated conversation history:', updatedHistory.length, 'messages');

    // Return the final response
    return NextResponse.json({ question: finalResponse });

  } catch (error) {
    console.error('[API] AI Interviewer error:', error);
    return NextResponse.json(
      { error: 'Failed to generate interview question', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
