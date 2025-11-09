/**
 * OCR Service
 * Extracts text from images and PDFs using Tesseract.js and optional cloud OCR providers
 */

import { createWorker, Worker } from 'tesseract.js';

// Rate limiting for OCR operations
const ocrRateLimiter = {
  requests: [] as number[],
  maxRequestsPerMinute: parseInt(process.env.OCR_RATE_LIMIT_PER_MINUTE || '20'),

  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.requests = this.requests.filter((time) => time > oneMinuteAgo);

    if (this.requests.length >= this.maxRequestsPerMinute) {
      return false;
    }

    this.requests.push(now);
    return true;
  },
};

/**
 * OCR Result interface
 */
export interface OCRResult {
  text: string;
  confidence: number;
  provider: 'tesseract' | 'google-vision' | 'mindee';
}

/**
 * Extract text from image using Tesseract.js (client-side or server-side)
 */
export async function extractTextWithTesseract(
  imageSource: string | File | Buffer
): Promise<OCRResult> {
  const canProceed = await ocrRateLimiter.checkLimit();
  if (!canProceed) {
    throw new Error('OCR rate limit exceeded. Please try again in a minute.');
  }

  let worker: Worker | null = null;

  try {
    worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    const result = await worker.recognize(imageSource);

    return {
      text: result.data.text,
      confidence: result.data.confidence / 100, // Convert to 0-1 scale
      provider: 'tesseract',
    };
  } catch (error) {
    console.error('Tesseract OCR error:', error);
    throw new Error('Failed to extract text from image');
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

/**
 * Extract text using Google Cloud Vision API (optional)
 */
export async function extractTextWithGoogleVision(
  imageBuffer: Buffer | string
): Promise<OCRResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;

  if (!apiKey) {
    throw new Error('Google Vision API key not configured');
  }

  // Convert buffer to base64 if needed
  const imageContent =
    typeof imageBuffer === 'string'
      ? imageBuffer
      : imageBuffer.toString('base64');

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: imageContent,
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 1,
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Vision API error: ${error}`);
  }

  const data = await response.json();
  const textAnnotations = data.responses[0]?.textAnnotations;

  if (!textAnnotations || textAnnotations.length === 0) {
    return {
      text: '',
      confidence: 0,
      provider: 'google-vision',
    };
  }

  return {
    text: textAnnotations[0].description,
    confidence: textAnnotations[0].confidence || 0.9,
    provider: 'google-vision',
  };
}

/**
 * Extract text using Mindee API (optional - specialized for documents)
 */
export async function extractTextWithMindee(
  imageFile: File | Buffer
): Promise<OCRResult> {
  const apiKey = process.env.MINDEE_API_KEY;

  if (!apiKey) {
    throw new Error('Mindee API key not configured');
  }

  const formData = new FormData();
  formData.append('document', imageFile);

  const response = await fetch(
    'https://api.mindee.net/v1/products/mindee/invoices/v4/predict',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mindee API error: ${error}`);
  }

  const data = await response.json();

  // Extract relevant text from Mindee response
  const text = extractMindeeText(data);

  return {
    text,
    confidence: 0.95, // Mindee is generally very accurate for documents
    provider: 'mindee',
  };
}

/**
 * Helper: Extract text from Mindee response
 */
function extractMindeeText(mindeeResponse: any): string {
  const doc = mindeeResponse.document;
  if (!doc) return '';

  const parts: string[] = [];

  // Extract invoice details
  if (doc.inference?.prediction) {
    const pred = doc.inference.prediction;

    if (pred.supplier_name?.value) parts.push(pred.supplier_name.value);
    if (pred.invoice_number?.value) parts.push(`Invoice: ${pred.invoice_number.value}`);
    if (pred.invoice_date?.value) parts.push(`Date: ${pred.invoice_date.value}`);
    if (pred.due_date?.value) parts.push(`Due: ${pred.due_date.value}`);
    if (pred.total_amount?.value) parts.push(`Amount: ${pred.total_amount.value}`);
  }

  // Add OCR text if available
  if (mindeeResponse.ocr) {
    parts.push(mindeeResponse.ocr);
  }

  return parts.join('\n');
}

/**
 * Main OCR function with provider selection and fallback
 */
export async function extractText(
  imageSource: File | Buffer | string,
  preferredProvider: 'auto' | 'tesseract' | 'google-vision' | 'mindee' = 'auto'
): Promise<OCRResult> {
  try {
    // Auto-select provider based on available API keys
    if (preferredProvider === 'auto') {
      if (process.env.GOOGLE_VISION_API_KEY && typeof imageSource !== 'string') {
        return await extractTextWithGoogleVision(imageSource as Buffer);
      } else if (process.env.MINDEE_API_KEY && imageSource instanceof File) {
        return await extractTextWithMindee(imageSource);
      } else {
        return await extractTextWithTesseract(imageSource);
      }
    }

    // Use specified provider
    switch (preferredProvider) {
      case 'google-vision':
        if (typeof imageSource === 'string' || Buffer.isBuffer(imageSource)) {
          return await extractTextWithGoogleVision(imageSource);
        }
        throw new Error('Google Vision requires Buffer or base64 string');

      case 'mindee':
        if (imageSource instanceof File || Buffer.isBuffer(imageSource)) {
          return await extractTextWithMindee(imageSource);
        }
        throw new Error('Mindee requires File or Buffer');

      case 'tesseract':
      default:
        return await extractTextWithTesseract(imageSource);
    }
  } catch (error) {
    console.error(`OCR error with ${preferredProvider}:`, error);

    // Fallback to Tesseract if other providers fail
    if (preferredProvider !== 'tesseract') {
      console.log('Falling back to Tesseract OCR...');
      try {
        return await extractTextWithTesseract(imageSource);
      } catch (fallbackError) {
        console.error('Tesseract fallback also failed:', fallbackError);
      }
    }

    throw error;
  }
}

/**
 * Client-side OCR function (for use in browser)
 */
export async function extractTextClientSide(file: File): Promise<OCRResult> {
  // Use Tesseract.js in browser
  return await extractTextWithTesseract(file);
}

/**
 * Process uploaded file and extract text
 */
export async function processUploadedFile(
  file: File,
  useCloudOCR: boolean = false
): Promise<{
  text: string;
  confidence: number;
  provider: string;
}> {
  // Check file type
  const fileType = file.type;

  if (!fileType.startsWith('image/') && fileType !== 'application/pdf') {
    throw new Error('File must be an image or PDF');
  }

  // For PDFs, you would need additional processing
  if (fileType === 'application/pdf') {
    // TODO: Implement PDF to image conversion
    // For now, throw error
    throw new Error('PDF processing not yet implemented. Please convert to image first.');
  }

  // Extract text
  const provider = useCloudOCR ? 'auto' : 'tesseract';
  const result = await extractText(file, provider);

  return result;
}

/**
 * Enhance OCR text quality
 */
export function enhanceOCRText(text: string): string {
  // Remove excessive whitespace
  let enhanced = text.replace(/\s+/g, ' ').trim();

  // Fix common OCR errors
  enhanced = enhanced.replace(/[|]/g, 'I'); // Pipe to I
  enhanced = enhanced.replace(/[0O]/g, (match, offset, string) => {
    // Context-aware O/0 correction
    const before = string[offset - 1];
    const after = string[offset + 1];
    if (/[a-zA-Z]/.test(before) || /[a-zA-Z]/.test(after)) {
      return 'O';
    }
    return '0';
  });

  return enhanced;
}

/**
 * Detect if image quality is sufficient for OCR
 */
export async function checkImageQuality(file: File): Promise<{
  isGoodQuality: boolean;
  issues: string[];
}> {
  return new Promise((resolve) => {
    const img = new Image();
    const issues: string[] = [];

    img.onload = () => {
      // Check resolution
      if (img.width < 800 || img.height < 600) {
        issues.push('Image resolution is too low. Minimum 800x600 recommended.');
      }

      // Check file size (very small files might be low quality)
      if (file.size < 50000) {
        // 50KB
        issues.push('File size is very small. Image might be low quality.');
      }

      // Check aspect ratio (very wide or tall images might have issues)
      const aspectRatio = img.width / img.height;
      if (aspectRatio > 5 || aspectRatio < 0.2) {
        issues.push('Unusual aspect ratio. Image might be cropped incorrectly.');
      }

      resolve({
        isGoodQuality: issues.length === 0,
        issues,
      });
    };

    img.onerror = () => {
      resolve({
        isGoodQuality: false,
        issues: ['Failed to load image'],
      });
    };

    img.src = URL.createObjectURL(file);
  });
}
