/**
 * Billing Service
 * Handles Razorpay and Stripe payment processing
 */

import { createSupabaseServerClient } from './supabaseClient';

/**
 * Plan configurations
 */
export const PLANS = {
  free: {
    name: 'Free',
    price_inr: 0,
    price_usd: 0,
    max_items: 10,
    features: ['Email reminders', 'Basic support', 'Manual item entry'],
  },
  pro: {
    name: 'Pro',
    price_inr_monthly: 499,
    price_inr_yearly: 4990,
    price_usd_monthly: 9,
    price_usd_yearly: 90,
    max_items: 200,
    features: [
      'All Free features',
      'WhatsApp & SMS reminders',
      'File upload & OCR',
      'Email forwarding',
      'Family sharing (up to 5 members)',
      'Priority support',
    ],
  },
  business: {
    name: 'Business',
    price_inr_monthly: 1999,
    price_inr_yearly: 19990,
    price_usd_monthly: 29,
    price_usd_yearly: 290,
    max_items: 2000,
    features: [
      'All Pro features',
      'Team dashboard',
      'Advanced analytics',
      'Custom reminder templates',
      'API access',
      'Dedicated support',
      'Unlimited team members',
    ],
  },
} as const;

/**
 * Check if user can perform action based on plan limits
 */
export async function checkPlanLimit(
  userId: string,
  action: 'add_item' | 'share_item' | 'whatsapp_reminder'
): Promise<{
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number;
}> {
  const supabase = createSupabaseServerClient();

  // Get user plan
  const { data: user, error } = await supabase
    .from('users')
    .select('plan, plan_expiry')
    .eq('id', userId)
    .single();

  if (error || !user) {
    return { allowed: false, reason: 'User not found' };
  }

  const plan = user.plan || 'free';

  // Check plan expiry
  if (plan !== 'free' && user.plan_expiry) {
    const expiryDate = new Date(user.plan_expiry);
    if (expiryDate < new Date()) {
      return { allowed: false, reason: 'Plan expired. Please renew.' };
    }
  }

  // Check action-specific limits
  switch (action) {
    case 'add_item': {
      // Count current items
      const { count, error: countError } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['active', 'expired']);

      if (countError) {
        return { allowed: false, reason: 'Failed to check item count' };
      }

      const currentCount = count || 0;
      const limit = PLANS[plan as keyof typeof PLANS]?.max_items || PLANS.free.max_items;

      if (currentCount >= limit) {
        return {
          allowed: false,
          reason: `Item limit reached. Upgrade to add more items.`,
          currentUsage: currentCount,
          limit,
        };
      }

      return { allowed: true, currentUsage: currentCount, limit };
    }

    case 'share_item': {
      if (plan === 'free') {
        return {
          allowed: false,
          reason: 'Sharing requires Pro or Business plan',
        };
      }
      return { allowed: true };
    }

    case 'whatsapp_reminder': {
      if (plan === 'free') {
        return {
          allowed: false,
          reason: 'WhatsApp reminders require Pro or Business plan',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

/**
 * Create Razorpay order
 */
export async function createRazorpayOrder(params: {
  userId: string;
  plan: 'pro' | 'business';
  billingCycle: 'monthly' | 'yearly';
  currency?: 'INR' | 'USD';
}): Promise<{
  orderId: string;
  amount: number;
  currency: string;
}> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured');
  }

  const { plan, billingCycle, currency = 'INR' } = params;

  // Get plan price
  const planConfig = PLANS[plan];
  const amount =
    currency === 'INR'
      ? billingCycle === 'monthly'
        ? planConfig.price_inr_monthly
        : planConfig.price_inr_yearly
      : billingCycle === 'monthly'
        ? planConfig.price_usd_monthly
        : planConfig.price_usd_yearly;

  // Razorpay amount is in smallest currency unit (paise for INR, cents for USD)
  const razorpayAmount = amount * 100;

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: razorpayAmount,
      currency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        user_id: params.userId,
        plan,
        billing_cycle: billingCycle,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Razorpay error: ${error.error?.description || 'Unknown error'}`);
  }

  const data = await response.json();

  return {
    orderId: data.id,
    amount: razorpayAmount,
    currency,
  };
}

/**
 * Verify Razorpay payment signature
 */
export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) {
    throw new Error('Razorpay key secret not configured');
  }

  const crypto = require('crypto');
  const { orderId, paymentId, signature } = params;

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return expectedSignature === signature;
}

/**
 * Process successful payment
 */
export async function processPaymentSuccess(params: {
  userId: string;
  paymentId: string;
  orderId: string;
  plan: 'pro' | 'business';
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  provider: 'razorpay' | 'stripe';
}): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { userId, paymentId, plan, billingCycle, amount, currency, provider } = params;

  // Calculate plan expiry
  const planExpiry = new Date();
  if (billingCycle === 'monthly') {
    planExpiry.setMonth(planExpiry.getMonth() + 1);
  } else {
    planExpiry.setFullYear(planExpiry.getFullYear() + 1);
  }

  // Update user plan
  const { error: updateError } = await supabase
    .from('users')
    .update({
      plan,
      plan_expiry: planExpiry.toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`Failed to update user plan: ${updateError.message}`);
  }

  // Record payment
  const { error: paymentError } = await supabase.from('payments').insert({
    user_id: userId,
    provider,
    provider_payment_id: paymentId,
    plan,
    amount: amount / 100, // Convert from smallest unit
    currency,
    status: 'completed',
    billing_cycle: billingCycle,
    metadata: {
      processed_at: new Date().toISOString(),
    },
  });

  if (paymentError) {
    console.error('Failed to record payment:', paymentError);
    // Don't throw - user plan is already updated
  }

  // Log activity
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action: 'plan_upgraded',
    entity_type: 'payment',
    entity_id: paymentId,
    metadata: {
      plan,
      billing_cycle: billingCycle,
      amount,
      currency,
    },
  });
}

/**
 * Create Stripe checkout session (for international payments)
 */
export async function createStripeCheckoutSession(params: {
  userId: string;
  userEmail: string;
  plan: 'pro' | 'business';
  billingCycle: 'monthly' | 'yearly';
}): Promise<{
  sessionId: string;
  url: string;
}> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('Stripe secret key not configured');
  }

  const { userId, userEmail, plan, billingCycle } = params;

  // Get plan price in USD
  const planConfig = PLANS[plan];
  const amount =
    billingCycle === 'monthly' ? planConfig.price_usd_monthly : planConfig.price_usd_yearly;

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${secretKey}`,
    },
    body: new URLSearchParams({
      'success_url': `${process.env.NEXT_PUBLIC_APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${process.env.NEXT_PUBLIC_APP_URL}/account`,
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': (amount * 100).toString(),
      'line_items[0][price_data][product_data][name]': `ExpiryTrackr ${planConfig.name} - ${billingCycle}`,
      'line_items[0][quantity]': '1',
      mode: 'payment',
      'customer_email': userEmail,
      'client_reference_id': userId,
      'metadata[user_id]': userId,
      'metadata[plan]': plan,
      'metadata[billing_cycle]': billingCycle,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stripe error: ${error}`);
  }

  const data = await response.json();

  return {
    sessionId: data.id,
    url: data.url,
  };
}

/**
 * Get user's payment history
 */
export async function getPaymentHistory(userId: string): Promise<any[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Cancel subscription (downgrade to free)
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from('users')
    .update({
      plan: 'free',
      plan_expiry: null,
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }

  // Log activity
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action: 'subscription_cancelled',
    entity_type: 'user',
    entity_id: userId,
  });
}

/**
 * Get current plan usage statistics
 */
export async function getPlanUsage(userId: string): Promise<{
  plan: string;
  itemsUsed: number;
  itemsLimit: number;
  sharesUsed: number;
  planExpiry: string | null;
}> {
  const supabase = createSupabaseServerClient();

  // Get user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('plan, plan_expiry')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new Error('User not found');
  }

  // Count items
  const { count: itemsUsed, error: itemsError } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['active', 'expired']);

  if (itemsError) {
    throw itemsError;
  }

  // Count shares
  const { count: sharesUsed, error: sharesError } = await supabase
    .from('shares')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId);

  if (sharesError) {
    throw sharesError;
  }

  const plan = user.plan || 'free';
  const planConfig = PLANS[plan as keyof typeof PLANS];

  return {
    plan,
    itemsUsed: itemsUsed || 0,
    itemsLimit: planConfig?.max_items || PLANS.free.max_items,
    sharesUsed: sharesUsed || 0,
    planExpiry: user.plan_expiry,
  };
}
