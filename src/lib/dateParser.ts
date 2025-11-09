/**
 * Date Parser Utility
 * Extracts and parses expiry dates from text using regex and heuristics
 */

import { format, parse, addDays, addMonths, addYears, isValid } from 'date-fns';

export interface ParsedDate {
  text: string;
  parsed_date: string; // YYYY-MM-DD
  confidence: number; // 0.0 - 1.0
}

/**
 * Common date patterns to match
 */
const DATE_PATTERNS = [
  // DD/MM/YYYY or DD-MM-YYYY
  {
    regex: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
    parse: (match: RegExpMatchArray) => {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      return { day, month, year };
    },
    confidence: 0.9,
  },
  // YYYY-MM-DD
  {
    regex: /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g,
    parse: (match: RegExpMatchArray) => {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);
      return { day, month, year };
    },
    confidence: 0.95,
  },
  // Month DD, YYYY (e.g., "January 15, 2024")
  {
    regex: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
    parse: (match: RegExpMatchArray) => {
      const monthName = match[1];
      const day = parseInt(match[2]);
      const year = parseInt(match[3]);
      const month = getMonthNumber(monthName);
      return { day, month, year };
    },
    confidence: 0.92,
  },
  // DD Month YYYY (e.g., "15 January 2024")
  {
    regex: /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})\b/gi,
    parse: (match: RegExpMatchArray) => {
      const day = parseInt(match[1]);
      const monthName = match[2];
      const year = parseInt(match[3]);
      const month = getMonthNumber(monthName);
      return { day, month, year };
    },
    confidence: 0.92,
  },
  // Month YYYY (e.g., "January 2024")
  {
    regex: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    parse: (match: RegExpMatchArray) => {
      const monthName = match[1];
      const year = parseInt(match[2]);
      const month = getMonthNumber(monthName);
      return { day: 1, month, year }; // Default to first day of month
    },
    confidence: 0.75,
  },
  // Short date format (e.g., "Jan 15, 2024")
  {
    regex: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi,
    parse: (match: RegExpMatchArray) => {
      const monthName = match[1];
      const day = parseInt(match[2]);
      const year = parseInt(match[3]);
      const month = getShortMonthNumber(monthName);
      return { day, month, year };
    },
    confidence: 0.88,
  },
];

/**
 * Relative date patterns (e.g., "valid for 1 year", "expires in 30 days")
 */
const RELATIVE_PATTERNS = [
  {
    regex: /\b(?:valid for|expires in)\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)\b/gi,
    parse: (match: RegExpMatchArray) => {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      return calculateRelativeDate(amount, unit);
    },
    confidence: 0.7,
  },
  {
    regex: /\b(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+(?:validity|from now|remaining)\b/gi,
    parse: (match: RegExpMatchArray) => {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      return calculateRelativeDate(amount, unit);
    },
    confidence: 0.65,
  },
];

/**
 * Keywords that indicate expiry dates
 */
const EXPIRY_KEYWORDS = [
  'expires',
  'expiry',
  'expiration',
  'valid until',
  'valid till',
  'validity',
  'due date',
  'renewal date',
  'end date',
  'valid through',
];

/**
 * Main function to extract dates from text
 */
export function extractDatesFromText(text: string): ParsedDate[] {
  const dates: ParsedDate[] = [];
  const seenDates = new Set<string>();

  // Normalize text
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  // Try all date patterns
  for (const pattern of DATE_PATTERNS) {
    const matches = normalizedText.matchAll(pattern.regex);

    for (const match of matches) {
      try {
        const { day, month, year } = pattern.parse(match);

        // Validate date
        if (!isValidDate(day, month, year)) continue;

        const date = new Date(year, month - 1, day);
        const dateStr = format(date, 'yyyy-MM-dd');

        // Skip duplicates
        if (seenDates.has(dateStr)) continue;
        seenDates.add(dateStr);

        // Check context for expiry keywords
        const contextConfidence = checkExpiryContext(normalizedText, match.index || 0);
        const finalConfidence = pattern.confidence * contextConfidence;

        dates.push({
          text: match[0],
          parsed_date: dateStr,
          confidence: finalConfidence,
        });
      } catch (error) {
        // Skip invalid dates
        continue;
      }
    }
  }

  // Try relative patterns
  for (const pattern of RELATIVE_PATTERNS) {
    const matches = normalizedText.matchAll(pattern.regex);

    for (const match of matches) {
      try {
        const date = pattern.parse(match);
        if (!date) continue;

        const dateStr = format(date, 'yyyy-MM-dd');

        if (seenDates.has(dateStr)) continue;
        seenDates.add(dateStr);

        dates.push({
          text: match[0],
          parsed_date: dateStr,
          confidence: pattern.confidence,
        });
      } catch (error) {
        continue;
      }
    }
  }

  // Sort by confidence
  return dates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get the best expiry date from extracted dates
 */
export function getBestExpiryDate(dates: ParsedDate[]): ParsedDate | null {
  if (dates.length === 0) return null;

  // Filter out past dates
  const today = new Date();
  const futureDates = dates.filter((d) => {
    const date = new Date(d.parsed_date);
    return date >= today;
  });

  // Return highest confidence future date, or highest confidence date if no future dates
  return futureDates.length > 0 ? futureDates[0] : dates[0];
}

/**
 * Helper: Get month number from month name
 */
function getMonthNumber(monthName: string): number {
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  return months[monthName.toLowerCase()] || 1;
}

/**
 * Helper: Get month number from short month name
 */
function getShortMonthNumber(monthName: string): number {
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return months[monthName.toLowerCase()] || 1;
}

/**
 * Helper: Validate date components
 */
function isValidDate(day: number, month: number, year: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Check actual date validity
  const date = new Date(year, month - 1, day);
  return isValid(date) && date.getDate() === day;
}

/**
 * Helper: Calculate relative date
 */
function calculateRelativeDate(amount: number, unit: string): Date | null {
  const today = new Date();
  const normalizedUnit = unit.toLowerCase().replace(/s$/, ''); // Remove plural 's'

  switch (normalizedUnit) {
    case 'day':
      return addDays(today, amount);
    case 'week':
      return addDays(today, amount * 7);
    case 'month':
      return addMonths(today, amount);
    case 'year':
      return addYears(today, amount);
    default:
      return null;
  }
}

/**
 * Helper: Check if date appears in expiry context
 */
function checkExpiryContext(text: string, datePosition: number): number {
  const contextWindow = 50; // Characters to check before and after
  const before = text.substring(Math.max(0, datePosition - contextWindow), datePosition).toLowerCase();
  const after = text.substring(datePosition, Math.min(text.length, datePosition + contextWindow)).toLowerCase();

  const context = before + after;

  // Check for expiry keywords
  for (const keyword of EXPIRY_KEYWORDS) {
    if (context.includes(keyword)) {
      return 1.1; // Boost confidence by 10%
    }
  }

  return 1.0; // No boost
}

/**
 * Format date for display
 */
export function formatDisplayDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return format(date, 'MMM dd, yyyy');
  } catch {
    return dateStr;
  }
}

/**
 * Calculate days until expiry
 */
export function daysUntilExpiry(expiryDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if date is expired
 */
export function isExpired(expiryDate: string): boolean {
  return daysUntilExpiry(expiryDate) < 0;
}

/**
 * Get urgency level based on days remaining
 */
export function getUrgencyLevel(
  expiryDate: string
): 'expired' | 'critical' | 'warning' | 'normal' {
  const days = daysUntilExpiry(expiryDate);

  if (days < 0) return 'expired';
  if (days <= 3) return 'critical';
  if (days <= 7) return 'warning';
  return 'normal';
}
