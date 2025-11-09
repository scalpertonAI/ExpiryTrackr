# ExpiryTrackr

> **Never forget to renew anything again**

ExpiryTrackr is a production-ready SaaS application that helps you track all your expiry-based items — documents, subscriptions, bills, warranties, medicines, memberships, domains, and more. Get automatic reminders via WhatsApp, Email, SMS, or Push notifications.

## 🌟 Features

### Core Features
- **🔐 Authentication** - Email/password signup + Google OAuth
- **📸 Smart Upload** - Upload photos and PDFs with automatic OCR text extraction
- **🤖 AI Detection** - Automatic expiry date detection using regex + LLM (Claude/OpenAI)
- **📧 Email Forwarding** - Forward emails to extract expiry information
- **🔔 Multi-Channel Reminders** - WhatsApp, Email, SMS, and Push notifications
- **👨‍👩‍👧‍👦 Family Sharing** - Share items with family members with role-based access
- **📊 Dashboard** - View upcoming expiries, expired items, and analytics
- **💳 Billing** - Razorpay integration for India + Stripe for international
- **🔒 Security** - Row-level security, encrypted file storage, GDPR compliance

### Advanced Features
- Multiple reminder windows (e.g., 30d, 7d, 1d before expiry)
- Confidence scoring for AI-detected dates
- Retry logic for failed notifications
- Admin dashboard with system analytics
- Export and delete account (privacy controls)
- Mobile-responsive design

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, TypeScript, TailwindCSS |
| **Backend** | Supabase (Auth, Database, Storage, Functions) |
| **Database** | PostgreSQL with Row-Level Security |
| **OCR** | Tesseract.js (client/server), Google Vision API (optional), Mindee (optional) |
| **LLM** | OpenAI GPT-4 or Anthropic Claude |
| **Notifications** | Twilio (WhatsApp/SMS), SendGrid (Email), Web Push |
| **Billing** | Razorpay (India), Stripe (International) |
| **Charts** | Chart.js |
| **Hosting** | Vercel (frontend), Supabase (backend) |

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js 18+ and npm/yarn
- A Supabase account (free tier available)
- API keys for optional services (see Configuration section)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/expirytrackr.git
cd expirytrackr
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration (see Configuration section below).

### 4. Set Up Supabase

#### a) Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Copy your project URL and anon key

#### b) Run Database Migrations

1. Open your Supabase SQL Editor
2. Copy the contents of `sql/migrations.sql`
3. Run the migration script

#### c) Create Storage Bucket

1. Go to Storage in Supabase dashboard
2. Create a new bucket named `item-uploads`
3. Set it to **private** (not public)
4. Add the following storage policies:

**Allow authenticated users to upload:**
```sql
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'item-uploads');
```

**Allow users to read their own files:**
```sql
CREATE POLICY "Allow users to read own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'item-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
```

#### d) Configure Authentication

1. Go to Authentication → Providers
2. Enable **Email** authentication
3. (Optional) Enable **Google** OAuth:
   - Add Google Client ID and Secret
   - Add authorized redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## ⚙️ Configuration

### Required Environment Variables

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Optional Service API Keys

#### LLM Services (at least one recommended)

```bash
# OpenAI (for GPT-4)
OPENAI_API_KEY=sk-...

# Anthropic Claude (alternative)
ANTHROPIC_API_KEY=sk-ant-...
```

#### Notification Services

```bash
# Twilio (WhatsApp & SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+1234567890

# SendGrid (Email)
SENDGRID_API_KEY=SG...
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=ExpiryTrackr

# Web Push (VAPID keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

To generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

#### Billing Services

```bash
# Razorpay (India)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...

# Stripe (International)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

#### Enhanced OCR (Optional)

```bash
# Google Cloud Vision
GOOGLE_VISION_API_KEY=...

# Mindee
MINDEE_API_KEY=...
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Add authorized redirect URIs:
   - `http://localhost:3000/auth/callback` (development)
   - `https://your-domain.com/auth/callback` (production)
   - `https://your-project.supabase.co/auth/v1/callback` (Supabase)
6. Copy Client ID and Secret to `.env`

## 📊 Database Schema

The application uses PostgreSQL with the following main tables:

- **users** - User profiles (extends Supabase auth.users)
- **items** - Expiry items tracked by users
- **reminders** - Scheduled reminders for items
- **shares** - Family/team sharing relationships
- **payments** - Payment history
- **notification_logs** - Audit trail of sent notifications
- **notification_templates** - Customizable notification templates
- **user_devices** - User devices for push notifications
- **activity_logs** - User activity audit trail

See `sql/migrations.sql` for complete schema with indexes, triggers, and RLS policies.

## 🔔 Setting Up the Scheduler

The scheduler processes reminders and sends notifications. It should run periodically (hourly or daily).

### Option 1: Node Cron (Development)

```bash
node scripts/scheduler.js
```

### Option 2: System Cron (Production)

Add to crontab:

```bash
# Run every hour
0 * * * * cd /path/to/expirytrackr && node scripts/scheduler.js >> /var/log/expirytrackr-scheduler.log 2>&1
```

### Option 3: Supabase Edge Function (Recommended)

Create a Supabase Edge Function:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { runScheduler } from './scheduler.ts'

serve(async (req) => {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  await runScheduler()

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Then use a service like [cron-job.org](https://cron-job.org) to trigger it hourly.

### Option 4: Vercel Cron

If using Vercel, add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/scheduler",
      "schedule": "0 * * * *"
    }
  ]
}
```

## 🧪 Testing

### Run Unit Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test dateParser.test.ts
```

### Test Coverage

```bash
npm test -- --coverage
```

## 📦 Deployment

### Deploy to Vercel

1. Install Vercel CLI:

```bash
npm install -g vercel
```

2. Deploy:

```bash
vercel
```

3. Add environment variables in Vercel dashboard

4. Set up custom domain (optional)

### Deploy to Other Platforms

The app is a standard Next.js application and can be deployed to:

- **Netlify** - Connect your GitHub repo
- **Railway** - One-click deploy
- **AWS Amplify** - Connect your repo
- **Self-hosted** - Use `npm run build` and `npm start`

### Production Checklist

- [ ] Set all environment variables
- [ ] Configure custom domain
- [ ] Set up SSL certificate
- [ ] Configure CORS if needed
- [ ] Set up monitoring (Sentry, LogRocket, etc.)
- [ ] Configure backups for Supabase
- [ ] Set up scheduler (cron job or Edge Function)
- [ ] Test all notification channels
- [ ] Test payment flow (use test mode first)
- [ ] Enable RLS policies in Supabase
- [ ] Review security settings
- [ ] Set up error logging
- [ ] Configure rate limiting
- [ ] Add analytics (Google Analytics, Plausible, etc.)

## 🔒 Security & Privacy

### Security Features

- **Row-Level Security (RLS)** - Every database table has RLS policies
- **Signed URLs** - File access uses time-limited signed URLs
- **Encrypted Storage** - Files encrypted at rest by Supabase
- **API Key Protection** - All sensitive keys server-side only
- **Input Validation** - Zod schemas for API validation
- **HTTPS Only** - Force HTTPS in production
- **CSRF Protection** - Built into Next.js
- **SQL Injection Prevention** - Parameterized queries via Supabase

### Privacy Features

- **Data Export** - Users can export all their data
- **Account Deletion** - Users can delete their account and all data
- **No Third-Party Tracking** - No analytics by default
- **Minimal Data Collection** - Only essential user data
- **Consent Management** - Clear terms and privacy policy

### Privacy Policy

Include a privacy policy at `/pages/privacy.tsx`:

- What data you collect
- How you use it
- How long you store it
- User rights (access, deletion, export)
- Contact information

### Security Best Practices

1. **Never commit `.env` file** - Already in `.gitignore`
2. **Use environment variables** - Never hardcode secrets
3. **Enable 2FA** - For admin accounts
4. **Regular updates** - Keep dependencies updated
5. **Monitor logs** - Check for suspicious activity
6. **Rate limiting** - Prevent abuse
7. **Backup regularly** - Daily Supabase backups
8. **Test security** - Regular security audits

### GDPR Compliance

To be GDPR compliant:

1. Add privacy policy and terms of service
2. Implement cookie consent (if using cookies)
3. Provide data export functionality
4. Provide account deletion functionality
5. Honor data deletion requests within 30 days
6. Log consent and privacy preferences
7. Don't transfer data outside EU without proper safeguards

## 💰 Pricing Plans

### Free Plan
- 10 items
- Email reminders only
- Manual entry
- **Price**: Free

### Pro Plan
- 200 items
- WhatsApp & SMS reminders
- File upload & OCR
- Email forwarding
- Family sharing (up to 5 members)
- **Price**: ₹499/month or ₹4,990/year ($9/$90 USD)

### Business Plan
- 2000 items
- All Pro features
- Team dashboard
- Advanced analytics
- Custom reminder templates
- API access
- **Price**: ₹1,999/month or ₹19,990/year ($29/$290 USD)

To update pricing, edit `src/lib/billing.ts`.

## 🎨 Customization

### Branding

Update these files:

- `public/favicon.ico` - Browser icon
- `public/icon-192.png` - PWA icon (192x192)
- `public/icon-512.png` - PWA icon (512x512)
- `public/manifest.json` - PWA manifest
- `src/pages/_document.tsx` - Meta tags
- `tailwind.config.js` - Colors and theme

### Notification Templates

Templates are stored in the `notification_templates` table. Admins can customize them via the admin dashboard.

Variables available:
- `{{user_name}}` - User's name
- `{{item_title}}` - Item title
- `{{item_type}}` - Item category
- `{{expiry_date}}` - Expiry date
- `{{days_left}}` - Days until expiry
- `{{renewal_link}}` - Renewal URL

## 🐛 Troubleshooting

### Common Issues

**Issue: OCR not working**
- Check if Tesseract.js is installed
- For enhanced OCR, verify Google Vision or Mindee API keys
- Check image quality (minimum 800x600 recommended)

**Issue: Reminders not sending**
- Verify scheduler is running
- Check notification service API keys
- Check user notification preferences
- Review notification_logs table for errors

**Issue: File uploads failing**
- Verify Supabase storage bucket exists
- Check storage policies
- Verify user is authenticated
- Check file size limits

**Issue: Authentication errors**
- Verify Supabase URL and keys
- Check if email confirmation is required
- Review auth settings in Supabase dashboard

**Issue: Payment errors**
- Use test mode API keys for development
- Verify webhook signatures
- Check Razorpay/Stripe dashboard for error messages

### Debug Mode

Enable debug logging:

```bash
NODE_ENV=development npm run dev
```

### Logs

Check logs in:
- Browser console (client-side errors)
- Terminal (server-side errors)
- Supabase logs (database errors)
- Vercel logs (deployment errors)

## 📚 Documentation

### API Documentation

See `postman_collection.json` for complete API documentation. Import into Postman or Insomnia.

### Code Documentation

All library files have inline JSDoc comments. Major functions include:

- `src/lib/dateParser.ts` - Date extraction and parsing
- `src/lib/llm.ts` - LLM integration for AI extraction
- `src/lib/ocrService.ts` - OCR text extraction
- `src/lib/notifications.ts` - Multi-channel notifications
- `src/lib/scheduler.ts` - Reminder processing
- `src/lib/billing.ts` - Payment processing

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙋 Support

### Getting Help

- **Documentation**: Read this README thoroughly
- **Issues**: Open an issue on GitHub
- **Email**: support@expirytrackr.com (if configured)

### Admin Credentials

**Default Admin Setup:**

After running migrations and seeding:

1. Create an admin user via signup
2. Update the user in database:

```sql
UPDATE public.users SET is_admin = true WHERE email = 'admin@yourdomain.com';
```

3. Access admin dashboard at `/admin`

## 🗺️ Roadmap

### v1.0 (Current MVP)
- [x] Authentication with Supabase
- [x] Manual item entry
- [x] File upload with OCR
- [x] AI expiry detection
- [x] Multi-channel reminders
- [x] Family sharing
- [x] Billing integration
- [x] Admin dashboard

### v1.1 (Planned)
- [ ] Calendar integration (Google Calendar, Outlook)
- [ ] SMS forwarding support
- [ ] Mobile apps (React Native)
- [ ] Chrome extension
- [ ] Bulk import (CSV)
- [ ] Advanced analytics
- [ ] Multi-language support
- [ ] Dark mode

### v2.0 (Future)
- [ ] AI auto-renewal
- [ ] Marketplace for renewal services
- [ ] Team collaboration features
- [ ] Custom workflows
- [ ] Zapier integration
- [ ] Public API

## 📊 Monitoring

### Recommended Tools

- **Sentry** - Error tracking
- **LogRocket** - Session replay
- **Vercel Analytics** - Performance monitoring
- **Plausible** - Privacy-friendly analytics
- **UptimeRobot** - Uptime monitoring

### Key Metrics to Track

- User signups
- Items created
- Reminders sent (by channel)
- Failed notifications
- Payment conversions
- Page load times
- Error rates

## 🏆 Best Practices

### Code Quality

- Use TypeScript for type safety
- Write unit tests for critical functions
- Follow ESLint rules
- Use Prettier for code formatting
- Document complex functions

### Performance

- Optimize images (Next.js Image component)
- Enable caching where appropriate
- Use server-side rendering strategically
- Lazy load heavy components
- Monitor bundle size

### Accessibility

- Use semantic HTML
- Add ARIA labels where needed
- Ensure keyboard navigation works
- Test with screen readers
- Maintain color contrast ratios

---

## 📞 Contact

**ExpiryTrackr**
Email: support@expirytrackr.com
Website: https://expirytrackr.com
GitHub: https://github.com/yourusername/expirytrackr

---

Built with ❤️ using Next.js, Supabase, and modern web technologies.

**Remember**: Never forget to renew anything again! ⏰
