import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async () => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('active', true)
    .gte('remind_at', windowStart)
    .lte('remind_at', windowEnd);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const r of reminders || []) {
    if (r.last_notified_at && new Date(r.last_notified_at) >= new Date(r.remind_at)) continue;
    const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', r.user_id);
    const payload = JSON.stringify({
      title: `💰 ${r.friend_name} trebuie să-ți dea bani`,
      body: `${r.amount} ${r.currency} pentru ${r.service_name}.`,
      tag: `reminder-${r.id}`
    });
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }
    await supabase.from('reminders').update({ last_notified_at: now.toISOString() }).eq('id', r.id);
  }
  return Response.json({ ok: true, sent });
});
