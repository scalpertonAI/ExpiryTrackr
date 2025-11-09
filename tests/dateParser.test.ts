import { extractDatesFromText, getBestExpiryDate, daysUntilExpiry, getUrgencyLevel } from '../src/lib/dateParser';

describe('Date Parser', () => {
  describe('extractDatesFromText', () => {
    it('should extract DD/MM/YYYY dates', () => {
      const text = 'This document expires on 31/12/2024';
      const dates = extractDatesFromText(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0].parsed_date).toBe('2024-12-31');
    });

    it('should extract YYYY-MM-DD dates', () => {
      const text = 'Valid until 2024-12-31';
      const dates = extractDatesFromText(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0].parsed_date).toBe('2024-12-31');
    });

    it('should extract Month DD, YYYY dates', () => {
      const text = 'Expiry: December 31, 2024';
      const dates = extractDatesFromText(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0].parsed_date).toBe('2024-12-31');
    });

    it('should extract relative dates', () => {
      const text = 'Valid for 30 days from now';
      const dates = extractDatesFromText(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0].confidence).toBeGreaterThan(0);
    });

    it('should return empty array for no dates', () => {
      const text = 'This text has no dates';
      const dates = extractDatesFromText(text);

      expect(dates.length).toBe(0);
    });

    it('should boost confidence for expiry keywords', () => {
      const text1 = 'Date: 31/12/2024';
      const text2 = 'Expires: 31/12/2024';

      const dates1 = extractDatesFromText(text1);
      const dates2 = extractDatesFromText(text2);

      expect(dates2[0].confidence).toBeGreaterThanOrEqual(dates1[0].confidence);
    });
  });

  describe('getBestExpiryDate', () => {
    it('should return highest confidence date', () => {
      const dates = [
        { text: 'date1', parsed_date: '2024-12-31', confidence: 0.8 },
        { text: 'date2', parsed_date: '2024-11-30', confidence: 0.9 },
      ];

      const best = getBestExpiryDate(dates);
      expect(best?.parsed_date).toBe('2024-11-30');
    });

    it('should prefer future dates over past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dates = [
        { text: 'past', parsed_date: yesterday.toISOString().split('T')[0], confidence: 0.9 },
        { text: 'future', parsed_date: tomorrow.toISOString().split('T')[0], confidence: 0.7 },
      ];

      const best = getBestExpiryDate(dates);
      expect(best?.parsed_date).toBe(tomorrow.toISOString().split('T')[0]);
    });

    it('should return null for empty array', () => {
      const best = getBestExpiryDate([]);
      expect(best).toBeNull();
    });
  });

  describe('daysUntilExpiry', () => {
    it('should calculate positive days for future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const days = daysUntilExpiry(tomorrow.toISOString().split('T')[0]);
      expect(days).toBe(1);
    });

    it('should calculate negative days for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const days = daysUntilExpiry(yesterday.toISOString().split('T')[0]);
      expect(days).toBeLessThan(0);
    });
  });

  describe('getUrgencyLevel', () => {
    it('should return "expired" for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const urgency = getUrgencyLevel(yesterday.toISOString().split('T')[0]);
      expect(urgency).toBe('expired');
    });

    it('should return "critical" for 1-3 days', () => {
      const twoDaysLater = new Date();
      twoDaysLater.setDate(twoDaysLater.getDate() + 2);

      const urgency = getUrgencyLevel(twoDaysLater.toISOString().split('T')[0]);
      expect(urgency).toBe('critical');
    });

    it('should return "warning" for 4-7 days', () => {
      const fiveDaysLater = new Date();
      fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

      const urgency = getUrgencyLevel(fiveDaysLater.toISOString().split('T')[0]);
      expect(urgency).toBe('warning');
    });

    it('should return "normal" for >7 days', () => {
      const tenDaysLater = new Date();
      tenDaysLater.setDate(tenDaysLater.getDate() + 10);

      const urgency = getUrgencyLevel(tenDaysLater.toISOString().split('T')[0]);
      expect(urgency).toBe('normal');
    });
  });
});
