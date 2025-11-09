/**
 * Notification Service
 * Handles sending notifications via WhatsApp, Email, SMS, and Push
 */

import webpush from 'web-push';

/**
 * Notification channel types
 */
export type NotificationChannel = 'email' | 'whatsapp' | 'sms' | 'push';

/**
 * Notification payload
 */
export interface NotificationPayload {
  userId: string;
  itemId: string;
  itemTitle: string;
  itemType: string;
  expiryDate: string;
  daysLeft: number;
  renewalLink?: string;
  userName?: string;
}

/**
 * Notification result
 */
export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Initialize Web Push (VAPID)
 */
function initializeWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@expirytrackr.com';

  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }
}

// Initialize on module load
initializeWebPush();

/**
 * Send Email notification using SendGrid
 */
export async function sendEmailNotification(
  email: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      channel: 'email',
      error: 'SendGrid API key not configured',
      timestamp: new Date(),
    };
  }

  try {
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@expirytrackr.com';
    const fromName = process.env.SENDGRID_FROM_NAME || 'ExpiryTrackr';

    const subject = `Reminder: ${payload.itemTitle} expires soon`;
    const htmlContent = generateEmailHTML(payload);
    const textContent = generateEmailText(payload);

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email }],
            subject,
          },
        ],
        from: {
          email: fromEmail,
          name: fromName,
        },
        content: [
          {
            type: 'text/plain',
            value: textContent,
          },
          {
            type: 'text/html',
            value: htmlContent,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid error: ${error}`);
    }

    // SendGrid returns 202 Accepted
    return {
      success: true,
      channel: 'email',
      messageId: response.headers.get('x-message-id') || undefined,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Email notification error:', error);
    return {
      success: false,
      channel: 'email',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Send WhatsApp notification using Twilio
 */
export async function sendWhatsAppNotification(
  phoneNumber: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!accountSid || !authToken) {
    return {
      success: false,
      channel: 'whatsapp',
      error: 'Twilio credentials not configured',
      timestamp: new Date(),
    };
  }

  try {
    // Format phone number for WhatsApp
    const toNumber = phoneNumber.startsWith('whatsapp:')
      ? phoneNumber
      : `whatsapp:${phoneNumber}`;

    const message = generateWhatsAppMessage(payload);

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: toNumber,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twilio error: ${error.message || JSON.stringify(error)}`);
    }

    const data = await response.json();

    return {
      success: true,
      channel: 'whatsapp',
      messageId: data.sid,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('WhatsApp notification error:', error);
    return {
      success: false,
      channel: 'whatsapp',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Send SMS notification using Twilio
 */
export async function sendSMSNotification(
  phoneNumber: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_SMS_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      channel: 'sms',
      error: 'Twilio credentials not configured',
      timestamp: new Date(),
    };
  }

  try {
    const message = generateSMSMessage(payload);

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: phoneNumber,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twilio error: ${error.message || JSON.stringify(error)}`);
    }

    const data = await response.json();

    return {
      success: true,
      channel: 'sms',
      messageId: data.sid,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('SMS notification error:', error);
    return {
      success: false,
      channel: 'sms',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Send Push notification using Web Push
 */
export async function sendPushNotification(
  subscription: any,
  payload: NotificationPayload
): Promise<NotificationResult> {
  try {
    const pushPayload = {
      title: `${payload.itemTitle} expires soon`,
      body: `Expires on ${payload.expiryDate} (${payload.daysLeft} days left)`,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        itemId: payload.itemId,
        url: `/items/${payload.itemId}`,
      },
    };

    await webpush.sendNotification(subscription, JSON.stringify(pushPayload));

    return {
      success: true,
      channel: 'push',
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Push notification error:', error);
    return {
      success: false,
      channel: 'push',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Generate email HTML content
 */
function generateEmailHTML(payload: NotificationPayload): string {
  const { itemTitle, itemType, expiryDate, daysLeft, renewalLink, userName } = payload;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expiry Reminder</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0;">⏰ Expiry Reminder</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">Hi ${userName || 'there'},</p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${daysLeft <= 3 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#10b981'};">
      <h2 style="margin-top: 0; color: #333;">${itemTitle}</h2>
      <p style="font-size: 14px; color: #666; margin: 5px 0;">
        <strong>Type:</strong> ${itemType}
      </p>
      <p style="font-size: 14px; color: #666; margin: 5px 0;">
        <strong>Expires:</strong> ${expiryDate}
      </p>
      <p style="font-size: 18px; font-weight: bold; color: ${daysLeft <= 3 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#10b981'}; margin: 10px 0;">
        ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left
      </p>
    </div>

    ${
      renewalLink
        ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${renewalLink}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Renew Now
      </a>
    </div>
    `
        : ''
    }

    <p style="font-size: 14px; color: #666; margin-top: 30px;">
      Best regards,<br>
      <strong>ExpiryTrackr Team</strong>
    </p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; text-align: center;">
      You're receiving this because you set up a reminder for this item.<br>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/account" style="color: #667eea;">Manage your notifications</a>
    </p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate email text content (plain text version)
 */
function generateEmailText(payload: NotificationPayload): string {
  const { itemTitle, itemType, expiryDate, daysLeft, renewalLink, userName } = payload;

  return `
Hi ${userName || 'there'},

This is a friendly reminder that your ${itemType} "${itemTitle}" expires soon.

Expiry Date: ${expiryDate}
Days Left: ${daysLeft}

${renewalLink ? `You can renew it here: ${renewalLink}` : ''}

Best regards,
ExpiryTrackr Team

---
You're receiving this because you set up a reminder for this item.
Manage your notifications: ${process.env.NEXT_PUBLIC_APP_URL}/account
  `.trim();
}

/**
 * Generate WhatsApp message
 */
function generateWhatsAppMessage(payload: NotificationPayload): string {
  const { itemTitle, expiryDate, daysLeft, renewalLink } = payload;

  let message = `⏰ *Reminder*\n\n`;
  message += `*${itemTitle}* expires on *${expiryDate}*\n`;
  message += `(${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left)\n\n`;

  if (renewalLink) {
    message += `Renew: ${renewalLink}\n\n`;
  }

  message += `_ExpiryTrackr_`;

  return message;
}

/**
 * Generate SMS message
 */
function generateSMSMessage(payload: NotificationPayload): string {
  const { itemTitle, expiryDate, daysLeft } = payload;

  return `ExpiryTrackr: ${itemTitle} expires on ${expiryDate} (${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left)`;
}

/**
 * Send notification with retry logic
 */
export async function sendNotificationWithRetry(
  channel: NotificationChannel,
  recipient: string,
  payload: NotificationPayload,
  maxRetries: number = 3
): Promise<NotificationResult> {
  let lastError: NotificationResult | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let result: NotificationResult;

      switch (channel) {
        case 'email':
          result = await sendEmailNotification(recipient, payload);
          break;
        case 'whatsapp':
          result = await sendWhatsAppNotification(recipient, payload);
          break;
        case 'sms':
          result = await sendSMSNotification(recipient, payload);
          break;
        case 'push':
          result = await sendPushNotification(JSON.parse(recipient), payload);
          break;
        default:
          throw new Error(`Unknown notification channel: ${channel}`);
      }

      if (result.success) {
        return result;
      }

      lastError = result;

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = {
        success: false,
        channel,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  return lastError || {
    success: false,
    channel,
    error: 'All retry attempts failed',
    timestamp: new Date(),
  };
}
