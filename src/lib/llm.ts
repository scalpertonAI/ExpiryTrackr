/**
 * LLM Service for Expiry Detection
 * Uses OpenAI or Anthropic Claude to extract expiry information from text
 */

import { ExtractedDate } from './supabaseClient';

// Rate limiting
const rateLimiter = {
  requests: [] as number[],
  maxRequestsPerMinute: parseInt(process.env.LLM_RATE_LIMIT_PER_MINUTE || '10'),

  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old requests
    this.requests = this.requests.filter((time) => time > oneMinuteAgo);

    if (this.requests.length >= this.maxRequestsPerMinute) {
      return false;
    }

    this.requests.push(now);
    return true;
  },
};

/**
 * LLM Response Type
 */
export interface LLMExtractionResult {
  item_title: string | null;
  item_type:
    | 'document'
    | 'subscription'
    | 'warranty'
    | 'membership'
    | 'policy'
    | 'domain'
    | 'prescription'
    | 'coupon'
    | 'event'
    | 'permit'
    | 'other';
  dates: ExtractedDate[];
  primary_expiry: string | null; // YYYY-MM-DD
  auto_renew: boolean | null;
  suggested_renewal_link: string | null;
  source_hint: 'email' | 'sms' | 'upload' | 'calendar' | 'web' | 'manual';
  extraction_summary: string;
}

/**
 * System prompt for LLM
 */
const SYSTEM_PROMPT = `You are a precise expiry-date extractor. Given raw text from an upload, email, or message, return a strict JSON object:

{
  "item_title": string or null,
  "item_type": one of ['document','subscription','warranty','membership','policy','domain','prescription','coupon','event','permit','other'],
  "dates": [ { "text": "raw matched text", "parsed_date": "YYYY-MM-DD", "confidence": 0.0-1.0 } ],
  "primary_expiry": "YYYY-MM-DD" or null,
  "auto_renew": true/false/null,
  "suggested_renewal_link": "https://..." or null,
  "source_hint": "email|sms|upload|calendar|web|manual",
  "extraction_summary": "one-sentence explanation of how expiry was detected"
}

Rules:
- Extract ALL dates found in the text
- Identify the most likely expiry date as primary_expiry
- Confidence should be between 0.0 and 1.0
- Only include valid URLs in suggested_renewal_link
- If no expiry found, return { dates:[], primary_expiry:null }
- Output ONLY valid JSON, no markdown or extra text`;

/**
 * Extract expiry information using OpenAI
 */
async function extractWithOpenAI(text: string): Promise<LLMExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Raw text: ${text}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return JSON.parse(content) as LLMExtractionResult;
}

/**
 * Extract expiry information using Anthropic Claude
 */
async function extractWithClaude(text: string): Promise<LLMExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Raw text: ${text}` }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  if (!content) {
    throw new Error('No response from Claude');
  }

  // Claude may return markdown-wrapped JSON, so clean it
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from Claude');
  }

  return JSON.parse(jsonMatch[0]) as LLMExtractionResult;
}

/**
 * Mock LLM extraction for testing (when no API key is available)
 */
function mockExtraction(text: string): LLMExtractionResult {
  return {
    item_title: 'Unknown Item',
    item_type: 'other',
    dates: [],
    primary_expiry: null,
    auto_renew: null,
    suggested_renewal_link: null,
    source_hint: 'manual',
    extraction_summary: 'Mock extraction - configure LLM API keys for actual extraction',
  };
}

/**
 * Main extraction function with fallback logic
 */
export async function extractExpiryWithLLM(
  text: string,
  preferredProvider: 'openai' | 'claude' | 'auto' = 'auto'
): Promise<LLMExtractionResult> {
  // Check rate limit
  const canProceed = await rateLimiter.checkLimit();
  if (!canProceed) {
    throw new Error('LLM rate limit exceeded. Please try again in a minute.');
  }

  // Truncate text if too long (to save tokens)
  const maxLength = 3000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

  try {
    // Try preferred provider or auto-select
    if (preferredProvider === 'openai' || (preferredProvider === 'auto' && process.env.OPENAI_API_KEY)) {
      return await extractWithOpenAI(truncatedText);
    } else if (preferredProvider === 'claude' || (preferredProvider === 'auto' && process.env.ANTHROPIC_API_KEY)) {
      return await extractWithClaude(truncatedText);
    } else {
      // No API keys configured, use mock
      console.warn('No LLM API keys configured. Using mock extraction.');
      return mockExtraction(truncatedText);
    }
  } catch (error) {
    console.error('LLM extraction error:', error);

    // Fallback to alternative provider
    try {
      if (preferredProvider !== 'claude' && process.env.ANTHROPIC_API_KEY) {
        return await extractWithClaude(truncatedText);
      } else if (preferredProvider !== 'openai' && process.env.OPENAI_API_KEY) {
        return await extractWithOpenAI(truncatedText);
      }
    } catch (fallbackError) {
      console.error('Fallback LLM extraction also failed:', fallbackError);
    }

    // Final fallback to mock
    return mockExtraction(truncatedText);
  }
}

/**
 * Combine regex and LLM results for best accuracy
 */
export function mergeExtractionResults(
  regexDates: ExtractedDate[],
  llmResult: LLMExtractionResult
): {
  dates: ExtractedDate[];
  primaryExpiry: string | null;
  confidence: number;
} {
  // Merge date arrays, removing duplicates
  const allDates = [...regexDates];
  const seenDates = new Set(regexDates.map((d) => d.parsed_date));

  for (const llmDate of llmResult.dates) {
    if (!seenDates.has(llmDate.parsed_date)) {
      allDates.push(llmDate);
      seenDates.add(llmDate.parsed_date);
    }
  }

  // Sort by confidence
  allDates.sort((a, b) => b.confidence - a.confidence);

  // Determine primary expiry
  let primaryExpiry: string | null = null;
  let confidence = 0;

  // Prefer LLM's primary_expiry if high confidence
  if (llmResult.primary_expiry && llmResult.dates.length > 0) {
    const llmPrimaryDate = llmResult.dates.find((d) => d.parsed_date === llmResult.primary_expiry);
    if (llmPrimaryDate && llmPrimaryDate.confidence > 0.7) {
      primaryExpiry = llmResult.primary_expiry;
      confidence = llmPrimaryDate.confidence;
    }
  }

  // Otherwise use highest confidence date from merged results
  if (!primaryExpiry && allDates.length > 0) {
    primaryExpiry = allDates[0].parsed_date;
    confidence = allDates[0].confidence;
  }

  return {
    dates: allDates,
    primaryExpiry,
    confidence,
  };
}

/**
 * Validate LLM extraction result
 */
export function validateLLMResult(result: LLMExtractionResult): boolean {
  // Check required fields
  if (typeof result.item_type !== 'string') return false;
  if (!Array.isArray(result.dates)) return false;

  // Validate dates
  for (const date of result.dates) {
    if (!date.parsed_date || !date.text || typeof date.confidence !== 'number') {
      return false;
    }
    if (date.confidence < 0 || date.confidence > 1) return false;
  }

  // Validate primary_expiry format if present
  if (result.primary_expiry && !/^\d{4}-\d{2}-\d{2}$/.test(result.primary_expiry)) {
    return false;
  }

  return true;
}
