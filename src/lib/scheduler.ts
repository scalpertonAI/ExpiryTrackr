/**
 * Scheduler Service
 * Processes reminders and sends notifications
 */

import { createSupabaseServerClient } from './supabaseClient';
import { sendNotificationWithRetry, NotificationChannel } from './notifications';
import { format, addDays } from 'date-fns';

/**
 * Process due reminders
 * This should be called by a cron job (daily or hourly)
 */
export async function processDueReminders(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const supabase = createSupabaseServerClient();
  const now = new Date();
  const errors: string[] = [];

  try {
    // Fetch pending reminders that are due
    const { data: dueReminders, error: fetchError } = await supabase
      .from('reminders')
      .select(
        `
        *,
        items (*),
        users (*)
      `
      )
      .eq('status', 'pending')
      .lte('remind_at', now.toISOString())
      .order('remind_at', { ascending: true })
      .limit(100); // Process in batches

    if (fetchError) {
      throw fetchError;
    }

    if (!dueReminders || dueReminders.length === 0) {
      console.log('No due reminders to process');
      return { processed: 0, succeeded: 0, failed: 0, errors: [] };
    }

    console.log(`Processing ${dueReminders.length} due reminders...`);

    let succeeded = 0;
    let failed = 0;

    // Process each reminder
    for (const reminder of dueReminders) {
      try {
        await processReminder(reminder);
        succeeded++;
      } catch (error) {
        failed++;
        const errorMsg = `Failed to process reminder ${reminder.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Processed ${dueReminders.length} reminders: ${succeeded} succeeded, ${failed} failed`);

    return {
      processed: dueReminders.length,
      succeeded,
      failed,
      errors,
    };
  } catch (error) {
    console.error('Error processing due reminders:', error);
    throw error;
  }
}

/**
 * Process a single reminder
 */
async function processReminder(reminder: any): Promise<void> {
  const supabase = createSupabaseServerClient();
  const item = reminder.items;
  const user = reminder.users;

  if (!item || !user) {
    throw new Error('Missing item or user data');
  }

  // Get recipient based on channel
  const recipient = getRecipient(user, reminder.channel);

  if (!recipient) {
    throw new Error(`No ${reminder.channel} contact found for user ${user.id}`);
  }

  // Check if user has this channel enabled
  const prefs = user.notification_preferences || {};
  if (!prefs[reminder.channel]) {
    console.log(`User ${user.id} has ${reminder.channel} notifications disabled, skipping`);

    // Mark as cancelled
    await supabase
      .from('reminders')
      .update({ status: 'cancelled' })
      .eq('id', reminder.id);

    return;
  }

  // Calculate days left
  const daysLeft = Math.ceil(
    (new Date(item.primary_expiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  // Prepare notification payload
  const payload = {
    userId: user.id,
    itemId: item.id,
    itemTitle: item.title,
    itemType: item.item_type,
    expiryDate: format(new Date(item.primary_expiry), 'MMM dd, yyyy'),
    daysLeft,
    renewalLink: item.suggested_renewal_link,
    userName: user.name,
  };

  // Send notification with retry
  const result = await sendNotificationWithRetry(
    reminder.channel as NotificationChannel,
    recipient,
    payload
  );

  // Update reminder status
  if (result.success) {
    await supabase
      .from('reminders')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        attempt_count: reminder.attempt_count + 1,
      })
      .eq('id', reminder.id);

    // Log notification
    await supabase.from('notification_logs').insert({
      user_id: user.id,
      reminder_id: reminder.id,
      channel: reminder.channel,
      recipient,
      subject: `Reminder: ${item.title} expires soon`,
      message: `Your ${item.item_type} expires on ${item.primary_expiry}`,
      status: 'sent',
      provider_response: { messageId: result.messageId },
    });

    // Update item's last_reminded_at
    await supabase
      .from('items')
      .update({ last_reminded_at: new Date().toISOString() })
      .eq('id', item.id);
  } else {
    // Determine if we should retry
    const shouldRetry = reminder.attempt_count < 3;

    if (shouldRetry) {
      // Schedule retry with exponential backoff
      const retryDelay = Math.pow(2, reminder.attempt_count) * 60; // Minutes
      const retryAfter = addDays(new Date(), retryDelay / (60 * 24));

      await supabase
        .from('reminders')
        .update({
          status: 'pending',
          attempt_count: reminder.attempt_count + 1,
          retry_after: retryAfter.toISOString(),
          error_message: result.error,
        })
        .eq('id', reminder.id);
    } else {
      // Max retries reached, mark as failed
      await supabase
        .from('reminders')
        .update({
          status: 'failed',
          attempt_count: reminder.attempt_count + 1,
          error_message: result.error,
        })
        .eq('id', reminder.id);

      // Log failed notification
      await supabase.from('notification_logs').insert({
        user_id: user.id,
        reminder_id: reminder.id,
        channel: reminder.channel,
        recipient,
        subject: `Reminder: ${item.title} expires soon`,
        message: `Failed after ${reminder.attempt_count + 1} attempts`,
        status: 'failed',
        provider_response: { error: result.error },
      });
    }

    throw new Error(result.error || 'Failed to send notification');
  }
}

/**
 * Get recipient contact based on channel
 */
function getRecipient(user: any, channel: NotificationChannel): string | null {
  switch (channel) {
    case 'email':
      return user.email;
    case 'whatsapp':
    case 'sms':
      return user.phone;
    case 'push':
      // For push, we need to fetch the device subscription
      // This is handled separately in the notification service
      return null;
    default:
      return null;
  }
}

/**
 * Create reminders for upcoming expiries
 * This should be called daily to create new reminders
 */
export async function createUpcomingReminders(): Promise<{
  created: number;
  errors: string[];
}> {
  const supabase = createSupabaseServerClient();
  const errors: string[] = [];
  let created = 0;

  try {
    // Fetch active items that need reminders
    const { data: items, error: fetchError } = await supabase
      .from('items')
      .select('*, users (*)')
      .eq('status', 'active')
      .gte('primary_expiry', new Date().toISOString().split('T')[0])
      .order('primary_expiry', { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    if (!items || items.length === 0) {
      console.log('No items need reminders');
      return { created: 0, errors: [] };
    }

    for (const item of items) {
      try {
        const user = item.users;
        if (!user) continue;

        const reminderWindows = item.reminder_windows || [30, 7, 1];

        // Create reminders for each window
        for (const daysBefo of reminderWindows) {
          const remindDate = new Date(item.primary_expiry);
          remindDate.setDate(remindDate.getDate() - daysBefo);

          // Only create if reminder date is in the future
          if (remindDate < new Date()) continue;

          // Check if reminder already exists
          const { data: existing } = await supabase
            .from('reminders')
            .select('id')
            .eq('item_id', item.id)
            .eq('user_id', user.id)
            .gte('remind_at', remindDate.toISOString())
            .lt(
              'remind_at',
              new Date(remindDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
            )
            .single();

          if (existing) {
            continue; // Already exists
          }

          // Determine which channels to use
          const prefs = user.notification_preferences || {};
          const channels: NotificationChannel[] = [];

          if (prefs.email) channels.push('email');
          if (prefs.whatsapp && user.phone) channels.push('whatsapp');
          if (prefs.sms && user.phone) channels.push('sms');
          if (prefs.push) channels.push('push');

          // Create reminder for each enabled channel
          for (const channel of channels) {
            await supabase.from('reminders').insert({
              item_id: item.id,
              user_id: user.id,
              remind_at: remindDate.toISOString(),
              channel,
              status: 'pending',
            });

            created++;
          }
        }
      } catch (error) {
        const errorMsg = `Failed to create reminder for item ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Created ${created} new reminders`);

    return { created, errors };
  } catch (error) {
    console.error('Error creating upcoming reminders:', error);
    throw error;
  }
}

/**
 * Update expired items status
 */
export async function updateExpiredItems(): Promise<number> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('items')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('primary_expiry', new Date().toISOString().split('T')[0])
    .select('id');

  if (error) {
    console.error('Error updating expired items:', error);
    throw error;
  }

  const count = data?.length || 0;
  console.log(`Updated ${count} expired items`);

  return count;
}

/**
 * Clean up old reminders (older than 90 days)
 */
export async function cleanupOldReminders(): Promise<number> {
  const supabase = createSupabaseServerClient();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data, error } = await supabase
    .from('reminders')
    .delete()
    .in('status', ['sent', 'failed', 'cancelled'])
    .lt('created_at', ninetyDaysAgo.toISOString())
    .select('id');

  if (error) {
    console.error('Error cleaning up old reminders:', error);
    throw error;
  }

  const count = data?.length || 0;
  console.log(`Cleaned up ${count} old reminders`);

  return count;
}

/**
 * Main scheduler function (to be called by cron)
 */
export async function runScheduler(): Promise<void> {
  console.log('=== ExpiryTrackr Scheduler Started ===');
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    // 1. Update expired items
    console.log('\n1. Updating expired items...');
    await updateExpiredItems();

    // 2. Create upcoming reminders
    console.log('\n2. Creating upcoming reminders...');
    await createUpcomingReminders();

    // 3. Process due reminders
    console.log('\n3. Processing due reminders...');
    const results = await processDueReminders();
    console.log(`Results: ${JSON.stringify(results)}`);

    // 4. Cleanup old data (run weekly)
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0) {
      // Sunday
      console.log('\n4. Cleaning up old reminders...');
      await cleanupOldReminders();
    }

    console.log('\n=== Scheduler Completed Successfully ===');
  } catch (error) {
    console.error('\n=== Scheduler Failed ===');
    console.error(error);
    throw error;
  }
}
