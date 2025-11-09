-- ExpiryTrackr Database Schema
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLES
-- =====================================================

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    timezone TEXT DEFAULT 'UTC',
    is_admin BOOLEAN DEFAULT FALSE,
    stripe_customer_id TEXT,
    razorpay_customer_id TEXT,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
    plan_expiry TIMESTAMP WITH TIME ZONE,
    notification_preferences JSONB DEFAULT '{"email": true, "whatsapp": false, "sms": false, "push": false}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Items table (core expiry items)
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN (
        'document', 'subscription', 'warranty', 'membership',
        'policy', 'domain', 'prescription', 'coupon',
        'event', 'permit', 'other'
    )),
    source_type TEXT NOT NULL CHECK (source_type IN (
        'manual', 'upload', 'email', 'sms', 'calendar', 'url'
    )),
    source_reference TEXT, -- Original email ID, file path, URL, etc.
    storage_path TEXT, -- Supabase storage path for uploaded files
    raw_text TEXT, -- Extracted text from OCR or parsing
    extracted_dates JSONB DEFAULT '[]'::jsonb, -- Array of detected dates with confidence
    primary_expiry DATE NOT NULL,
    confidence FLOAT DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    auto_renew BOOLEAN DEFAULT FALSE,
    suggested_renewal_link TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'renewed', 'archived')),
    reminder_windows JSONB DEFAULT '[30, 7, 1]'::jsonb, -- Days before expiry to remind
    last_reminded_at TIMESTAMP WITH TIME ZONE,
    renewed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional custom fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reminders table (tracks all reminder attempts)
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'push')),
    sent_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    error_message TEXT,
    attempt_count INTEGER DEFAULT 0,
    retry_after TIMESTAMP WITH TIME ZONE,
    template_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shares table (family/team sharing)
CREATE TABLE IF NOT EXISTS public.shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    shared_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    shared_email TEXT, -- For invites not yet accepted
    item_id UUID REFERENCES public.items(id) ON DELETE CASCADE, -- NULL means share all items
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    accepted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(owner_user_id, shared_user_id, item_id),
    CHECK (shared_user_id IS NOT NULL OR shared_email IS NOT NULL)
);

-- Payments table (billing history)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'razorpay')),
    provider_payment_id TEXT UNIQUE,
    plan TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method TEXT,
    billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification logs (audit trail)
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reminder_id UUID REFERENCES public.reminders(id) ON DELETE SET NULL,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL, -- Email, phone number, etc.
    subject TEXT,
    message TEXT,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'bounced')),
    provider_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin templates (for notification customization)
CREATE TABLE IF NOT EXISTS public.notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    item_type TEXT, -- NULL means default for all types
    channel TEXT NOT NULL,
    subject_template TEXT,
    body_template TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb, -- List of available template variables
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User devices (for push notifications)
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_token TEXT NOT NULL,
    device_type TEXT CHECK (device_type IN ('web', 'ios', 'android')),
    push_subscription JSONB, -- Web Push subscription object
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_token)
);

-- Activity logs (audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_items_user_id ON public.items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_expiry ON public.items(primary_expiry, status);
CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);
CREATE INDEX IF NOT EXISTS idx_items_user_expiry ON public.items(user_id, primary_expiry);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON public.reminders(remind_at, status);
CREATE INDEX IF NOT EXISTS idx_reminders_item ON public.reminders(item_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON public.reminders(status, remind_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_shares_owner ON public.shares(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_user ON public.shares(shared_user_id);
CREATE INDEX IF NOT EXISTS idx_shares_item ON public.shares(item_id);

CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON public.notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created ON public.notification_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON public.notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to auto-update item status based on expiry
CREATE OR REPLACE FUNCTION update_expired_items()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE public.items
    SET status = 'expired'
    WHERE status = 'active'
    AND primary_expiry < CURRENT_DATE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Items policies
CREATE POLICY "Users can view own items" ON public.items
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.shares
            WHERE shares.item_id = items.id
            AND shares.shared_user_id = auth.uid()
            AND shares.accepted_at IS NOT NULL
        )
    );

CREATE POLICY "Users can insert own items" ON public.items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items" ON public.items
    FOR UPDATE USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.shares
            WHERE shares.item_id = items.id
            AND shares.shared_user_id = auth.uid()
            AND shares.role IN ('owner', 'editor')
            AND shares.accepted_at IS NOT NULL
        )
    );

CREATE POLICY "Users can delete own items" ON public.items
    FOR DELETE USING (auth.uid() = user_id);

-- Reminders policies
CREATE POLICY "Users can view own reminders" ON public.reminders
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminders" ON public.reminders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders" ON public.reminders
    FOR UPDATE USING (auth.uid() = user_id);

-- Shares policies
CREATE POLICY "Users can view shares they own or are shared with" ON public.shares
    FOR SELECT USING (
        auth.uid() = owner_user_id OR
        auth.uid() = shared_user_id
    );

CREATE POLICY "Owners can create shares" ON public.shares
    FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can update shares" ON public.shares
    FOR UPDATE USING (auth.uid() = owner_user_id);

CREATE POLICY "Owners can delete shares" ON public.shares
    FOR DELETE USING (auth.uid() = owner_user_id);

-- Payments policies
CREATE POLICY "Users can view own payments" ON public.payments
    FOR SELECT USING (auth.uid() = user_id);

-- Notification logs policies
CREATE POLICY "Users can view own notification logs" ON public.notification_logs
    FOR SELECT USING (auth.uid() = user_id);

-- User devices policies
CREATE POLICY "Users can view own devices" ON public.user_devices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices" ON public.user_devices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices" ON public.user_devices
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices" ON public.user_devices
    FOR DELETE USING (auth.uid() = user_id);

-- Activity logs policies
CREATE POLICY "Users can view own activity logs" ON public.activity_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Notification templates policies (public read, admin write)
CREATE POLICY "Anyone can view active templates" ON public.notification_templates
    FOR SELECT USING (is_active = true);

-- Admin policies (add after creating admin users)
CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

-- Create storage bucket for uploaded files
-- Run this in Supabase Storage settings or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('item-uploads', 'item-uploads', false);

-- Storage policies (to be created in Supabase dashboard)
-- Allow authenticated users to upload files
-- Allow users to read their own files

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Insert default notification templates
INSERT INTO public.notification_templates (name, item_type, channel, subject_template, body_template, variables) VALUES
('default_email', NULL, 'email',
 'Reminder: {{item_title}} expires soon',
 'Hi {{user_name}},\n\nThis is a friendly reminder that your {{item_type}} "{{item_title}}" expires on {{expiry_date}} ({{days_left}} days left).\n\n{{#renewal_link}}You can renew it here: {{renewal_link}}{{/renewal_link}}\n\nBest regards,\nExpiryTrackr Team',
 '["user_name", "item_title", "item_type", "expiry_date", "days_left", "renewal_link"]'::jsonb
),
('default_whatsapp', NULL, 'whatsapp',
 NULL,
 '⏰ *Reminder*\n\n{{item_title}} expires on *{{expiry_date}}* ({{days_left}} days left)\n\n{{#renewal_link}}Renew: {{renewal_link}}{{/renewal_link}}',
 '["item_title", "expiry_date", "days_left", "renewal_link"]'::jsonb
),
('default_sms', NULL, 'sms',
 NULL,
 'ExpiryTrackr: {{item_title}} expires on {{expiry_date}} ({{days_left}} days left)',
 '["item_title", "expiry_date", "days_left"]'::jsonb
),
('default_push', NULL, 'push',
 '{{item_title}} expires soon',
 '{{item_title}} expires on {{expiry_date}} ({{days_left}} days left)',
 '["item_title", "expiry_date", "days_left"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View for items expiring soon
CREATE OR REPLACE VIEW public.items_expiring_soon AS
SELECT
    i.*,
    u.email,
    u.name as user_name,
    u.notification_preferences,
    (i.primary_expiry - CURRENT_DATE) as days_until_expiry
FROM public.items i
JOIN public.users u ON i.user_id = u.id
WHERE i.status = 'active'
AND i.primary_expiry >= CURRENT_DATE
AND i.primary_expiry <= CURRENT_DATE + INTERVAL '30 days'
ORDER BY i.primary_expiry ASC;

-- View for user statistics
CREATE OR REPLACE VIEW public.user_stats AS
SELECT
    u.id,
    u.email,
    u.plan,
    COUNT(DISTINCT i.id) as total_items,
    COUNT(DISTINCT CASE WHEN i.status = 'active' THEN i.id END) as active_items,
    COUNT(DISTINCT CASE WHEN i.primary_expiry < CURRENT_DATE AND i.status = 'active' THEN i.id END) as expired_items,
    COUNT(DISTINCT CASE WHEN i.primary_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN i.id END) as expiring_this_week,
    COUNT(DISTINCT s.id) as shared_items_count
FROM public.users u
LEFT JOIN public.items i ON u.id = i.user_id
LEFT JOIN public.shares s ON u.id = s.owner_user_id OR u.id = s.shared_user_id
GROUP BY u.id, u.email, u.plan;

-- Grant access to views
GRANT SELECT ON public.items_expiring_soon TO authenticated;
GRANT SELECT ON public.user_stats TO authenticated;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE public.users IS 'Extended user profile information';
COMMENT ON TABLE public.items IS 'Core table for tracking expiry items';
COMMENT ON TABLE public.reminders IS 'Scheduled reminders for items';
COMMENT ON TABLE public.shares IS 'Sharing items with family/team members';
COMMENT ON TABLE public.payments IS 'Payment history and billing records';
COMMENT ON TABLE public.notification_logs IS 'Audit trail of all notifications sent';
COMMENT ON TABLE public.notification_templates IS 'Customizable notification templates';
COMMENT ON TABLE public.user_devices IS 'User devices for push notifications';
COMMENT ON TABLE public.activity_logs IS 'Audit trail of user actions';

-- =====================================================
-- COMPLETION
-- =====================================================

-- Migration completed successfully
-- Next steps:
-- 1. Create storage bucket 'item-uploads' in Supabase Storage
-- 2. Set up storage policies for authenticated users
-- 3. Create admin user and set is_admin = true
-- 4. Configure email templates in Supabase Auth
-- 5. Set up scheduled functions for reminder processing
