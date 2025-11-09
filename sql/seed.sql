-- ExpiryTrackr Seed Data
-- This script creates demo data for testing

-- Note: Replace these UUIDs with actual user IDs from auth.users after signup
-- For now, we'll use placeholder UUIDs

-- =====================================================
-- DEMO USERS
-- =====================================================

-- Insert demo users (assuming they've signed up via auth)
-- In production, these would be created via Supabase Auth

-- Demo admin user
INSERT INTO public.users (id, email, name, phone, timezone, is_admin, plan) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@expirytrackr.com', 'Admin User', '+919876543210', 'Asia/Kolkata', true, 'business')
ON CONFLICT (id) DO UPDATE SET is_admin = true;

-- Demo regular users
INSERT INTO public.users (id, email, name, phone, timezone, plan) VALUES
('00000000-0000-0000-0000-000000000002', 'demo@example.com', 'Demo User', '+919876543211', 'Asia/Kolkata', 'pro'),
('00000000-0000-0000-0000-000000000003', 'family@example.com', 'Family Member', '+919876543212', 'Asia/Kolkata', 'free')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- DEMO ITEMS
-- =====================================================

-- Demo user's items
INSERT INTO public.items (user_id, title, item_type, source_type, primary_expiry, confidence, auto_renew, suggested_renewal_link, notes, reminder_windows, status) VALUES
-- Expiring soon
('00000000-0000-0000-0000-000000000002', 'Passport', 'document', 'upload', CURRENT_DATE + INTERVAL '15 days', 0.95, false, NULL, 'Renewal required at passport office', '[30, 7, 1]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Netflix Subscription', 'subscription', 'email', CURRENT_DATE + INTERVAL '5 days', 0.98, true, 'https://netflix.com/billing', 'Monthly subscription', '[7, 1]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Car Insurance', 'policy', 'upload', CURRENT_DATE + INTERVAL '20 days', 0.92, false, 'https://insurance.com/renew', 'ICICI Lombard policy #123456', '[30, 15, 7, 1]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Driving License', 'document', 'manual', CURRENT_DATE + INTERVAL '10 days', 1.0, false, NULL, 'Need to visit RTO', '[15, 7, 3, 1]'::jsonb, 'active'),

-- Expiring this month
('00000000-0000-0000-0000-000000000002', 'Domain Registration - mysite.com', 'domain', 'email', CURRENT_DATE + INTERVAL '25 days', 0.99, true, 'https://godaddy.com', 'GoDaddy domain', '[30, 7, 1]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Gym Membership', 'membership', 'manual', CURRENT_DATE + INTERVAL '28 days', 1.0, false, NULL, 'Gold Gym annual membership', '[30, 7]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Medicine - Aspirin', 'prescription', 'upload', CURRENT_DATE + INTERVAL '18 days', 0.88, false, NULL, 'Daily medication', '[7, 3, 1]'::jsonb, 'active'),

-- Expiring later
('00000000-0000-0000-0000-000000000002', 'Amazon Prime', 'subscription', 'email', CURRENT_DATE + INTERVAL '45 days', 0.97, true, 'https://amazon.in/prime', 'Annual subscription', '[30, 7]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Credit Card', 'document', 'manual', CURRENT_DATE + INTERVAL '90 days', 1.0, false, NULL, 'HDFC Bank CC ending 4567', '[30, 15]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Health Insurance', 'policy', 'upload', CURRENT_DATE + INTERVAL '120 days', 0.94, false, 'https://insurance.com', 'Family floater policy', '[60, 30, 15, 7]'::jsonb, 'active'),
('00000000-0000-0000-0000-000000000002', 'Warranty - Laptop', 'warranty', 'upload', CURRENT_DATE + INTERVAL '180 days', 0.91, false, NULL, 'Dell laptop 3-year warranty', '[60, 30]'::jsonb, 'active'),

-- Already expired (for testing)
('00000000-0000-0000-0000-000000000002', 'Old Subscription', 'subscription', 'manual', CURRENT_DATE - INTERVAL '5 days', 1.0, false, NULL, 'Expired item for testing', '[7, 1]'::jsonb, 'expired'),

-- Renewed items
('00000000-0000-0000-0000-000000000002', 'PAN Card', 'document', 'upload', CURRENT_DATE + INTERVAL '365 days', 0.96, false, NULL, 'Recently renewed', '[60, 30]'::jsonb, 'active');

-- =====================================================
-- DEMO SHARES
-- =====================================================

-- Share some items with family member
INSERT INTO public.shares (owner_user_id, shared_user_id, item_id, role, accepted_at)
SELECT
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    id,
    'viewer',
    NOW()
FROM public.items
WHERE user_id = '00000000-0000-0000-0000-000000000002'
AND title IN ('Car Insurance', 'Health Insurance')
ON CONFLICT DO NOTHING;

-- Pending share invite (not yet accepted)
INSERT INTO public.shares (owner_user_id, shared_email, item_id, role)
SELECT
    '00000000-0000-0000-0000-000000000002',
    'pending@example.com',
    id,
    'viewer'
FROM public.items
WHERE user_id = '00000000-0000-0000-0000-000000000002'
AND title = 'Gym Membership'
LIMIT 1
ON CONFLICT DO NOTHING;

-- =====================================================
-- DEMO REMINDERS
-- =====================================================

-- Create some pending reminders
INSERT INTO public.reminders (item_id, user_id, remind_at, channel, status)
SELECT
    i.id,
    i.user_id,
    (i.primary_expiry - INTERVAL '7 days')::timestamp with time zone,
    'email',
    CASE
        WHEN (i.primary_expiry - INTERVAL '7 days') < NOW() THEN 'sent'
        ELSE 'pending'
    END
FROM public.items i
WHERE i.user_id = '00000000-0000-0000-0000-000000000002'
AND i.status = 'active'
AND i.primary_expiry > CURRENT_DATE;

-- Add WhatsApp reminders for items expiring soon
INSERT INTO public.reminders (item_id, user_id, remind_at, channel, status)
SELECT
    i.id,
    i.user_id,
    (i.primary_expiry - INTERVAL '1 day')::timestamp with time zone,
    'whatsapp',
    'pending'
FROM public.items i
WHERE i.user_id = '00000000-0000-0000-0000-000000000002'
AND i.status = 'active'
AND i.primary_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '10 days';

-- =====================================================
-- DEMO PAYMENTS
-- =====================================================

-- Demo payment records
INSERT INTO public.payments (user_id, provider, provider_payment_id, plan, amount, currency, status, payment_method, billing_cycle) VALUES
('00000000-0000-0000-0000-000000000002', 'razorpay', 'pay_demo123456', 'pro', 499.00, 'INR', 'completed', 'card', 'monthly'),
('00000000-0000-0000-0000-000000000001', 'razorpay', 'pay_demo789012', 'business', 2999.00, 'INR', 'completed', 'upi', 'yearly');

-- =====================================================
-- DEMO NOTIFICATION LOGS
-- =====================================================

-- Sample notification logs
INSERT INTO public.notification_logs (user_id, channel, recipient, subject, message, status)
SELECT
    u.id,
    'email',
    u.email,
    'Reminder: ' || i.title || ' expires soon',
    'Your ' || i.item_type || ' expires on ' || i.primary_expiry::text,
    'sent'
FROM public.users u
JOIN public.items i ON u.id = i.user_id
WHERE u.id = '00000000-0000-0000-0000-000000000002'
LIMIT 5;

-- =====================================================
-- DEMO ACTIVITY LOGS
-- =====================================================

-- Sample activity logs
INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, metadata)
SELECT
    user_id,
    'item_created',
    'item',
    id,
    jsonb_build_object('title', title, 'item_type', item_type)
FROM public.items
WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- =====================================================
-- UPDATE STATISTICS
-- =====================================================

-- Update some items to have extracted_dates JSON
UPDATE public.items
SET extracted_dates = jsonb_build_array(
    jsonb_build_object(
        'text', 'expires on ' || primary_expiry::text,
        'parsed_date', primary_expiry::text,
        'confidence', confidence
    )
)
WHERE extracted_dates = '[]'::jsonb;

-- =====================================================
-- SUMMARY
-- =====================================================

-- Count records created
DO $$
DECLARE
    user_count INTEGER;
    item_count INTEGER;
    reminder_count INTEGER;
    share_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM public.users;
    SELECT COUNT(*) INTO item_count FROM public.items;
    SELECT COUNT(*) INTO reminder_count FROM public.reminders;
    SELECT COUNT(*) INTO share_count FROM public.shares;

    RAISE NOTICE 'Seed data created successfully!';
    RAISE NOTICE 'Users: %', user_count;
    RAISE NOTICE 'Items: %', item_count;
    RAISE NOTICE 'Reminders: %', reminder_count;
    RAISE NOTICE 'Shares: %', share_count;
END $$;

-- =====================================================
-- NOTES
-- =====================================================

-- To use this seed data:
-- 1. First create actual users via Supabase Auth signup
-- 2. Replace the placeholder UUIDs with real user IDs
-- 3. Run this script in Supabase SQL Editor
-- 4. Verify data in the dashboard

-- For testing with real users:
-- UPDATE public.items SET user_id = 'YOUR_REAL_USER_ID' WHERE user_id = '00000000-0000-0000-0000-000000000002';
