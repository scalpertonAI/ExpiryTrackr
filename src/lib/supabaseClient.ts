/**
 * Supabase Client Configuration
 * Handles authentication and database operations
 */

import { createClient } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (for API routes)
export const createSupabaseServerClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

// Client component Supabase client (for App Router)
export const createSupabaseComponentClient = () => {
  return createClientComponentClient();
};

// Database types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: UserUpdate;
      };
      items: {
        Row: ItemRow;
        Insert: ItemInsert;
        Update: ItemUpdate;
      };
      reminders: {
        Row: ReminderRow;
        Insert: ReminderInsert;
        Update: ReminderUpdate;
      };
      shares: {
        Row: ShareRow;
        Insert: ShareInsert;
        Update: ShareUpdate;
      };
      payments: {
        Row: PaymentRow;
        Insert: PaymentInsert;
        Update: PaymentUpdate;
      };
    };
  };
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  timezone: string;
  is_admin: boolean;
  stripe_customer_id: string | null;
  razorpay_customer_id: string | null;
  plan: 'free' | 'pro' | 'business';
  plan_expiry: string | null;
  notification_preferences: NotificationPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserInsert extends Partial<UserRow> {
  id: string;
  email: string;
}

export interface UserUpdate extends Partial<UserRow> {}

export interface NotificationPreferences {
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  push: boolean;
}

export type ItemType =
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

export type SourceType = 'manual' | 'upload' | 'email' | 'sms' | 'calendar' | 'url';

export interface ExtractedDate {
  text: string;
  parsed_date: string;
  confidence: number;
}

export interface ItemRow {
  id: string;
  user_id: string;
  title: string;
  item_type: ItemType;
  source_type: SourceType;
  source_reference: string | null;
  storage_path: string | null;
  raw_text: string | null;
  extracted_dates: ExtractedDate[];
  primary_expiry: string;
  confidence: number;
  auto_renew: boolean;
  suggested_renewal_link: string | null;
  notes: string | null;
  status: 'active' | 'expired' | 'renewed' | 'archived';
  reminder_windows: number[];
  last_reminded_at: string | null;
  renewed_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ItemInsert extends Partial<ItemRow> {
  user_id: string;
  title: string;
  item_type: ItemType;
  source_type: SourceType;
  primary_expiry: string;
}

export interface ItemUpdate extends Partial<ItemRow> {}

export type ReminderChannel = 'email' | 'whatsapp' | 'sms' | 'push';

export interface ReminderRow {
  id: string;
  item_id: string;
  user_id: string;
  remind_at: string;
  channel: ReminderChannel;
  sent_at: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  error_message: string | null;
  attempt_count: number;
  retry_after: string | null;
  template_data: Record<string, any>;
  created_at: string;
}

export interface ReminderInsert extends Partial<ReminderRow> {
  item_id: string;
  user_id: string;
  remind_at: string;
  channel: ReminderChannel;
}

export interface ReminderUpdate extends Partial<ReminderRow> {}

export interface ShareRow {
  id: string;
  owner_user_id: string;
  shared_user_id: string | null;
  shared_email: string | null;
  item_id: string | null;
  role: 'owner' | 'editor' | 'viewer';
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ShareInsert extends Partial<ShareRow> {
  owner_user_id: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface ShareUpdate extends Partial<ShareRow> {}

export interface PaymentRow {
  id: string;
  user_id: string;
  provider: 'stripe' | 'razorpay';
  provider_payment_id: string | null;
  plan: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payment_method: string | null;
  billing_cycle: 'monthly' | 'yearly' | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface PaymentInsert extends Partial<PaymentRow> {
  user_id: string;
  provider: 'stripe' | 'razorpay';
  plan: string;
  amount: number;
}

export interface PaymentUpdate extends Partial<PaymentRow> {}

// Helper functions
export const getCurrentUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as UserRow;
};

export const uploadFile = async (file: File, userId: string) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('item-uploads')
    .upload(fileName, file);

  if (error) throw error;
  return data.path;
};

export const getFileUrl = async (path: string) => {
  const { data } = await supabase.storage.from('item-uploads').createSignedUrl(path, 3600);
  return data?.signedUrl || '';
};

export const deleteFile = async (path: string) => {
  const { error } = await supabase.storage.from('item-uploads').remove([path]);
  if (error) throw error;
};
