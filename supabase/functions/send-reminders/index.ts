/// <reference types="npm:@types/node@22.10.2" />
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function money(amount: number | string, currency: string) {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: currency || "RON",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n} ${currency || "RON"}`;
  }
}

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "POST only" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

    if (!supabaseUrl || !serviceRole || !vapidPublic || !vapidPrivate) {
      return json({ error: "Missing server secrets" }, 500);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    async function sendToUser(userId: string, payload: Record<string, unknown>) {
      const { data: subs, error } = await admin
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", userId);
      if (error) throw error;

      let sent = 0;
      for (const sub of subs || []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
            { TTL: 60 * 60 * 24 }
          );
          sent++;
        } catch (err: any) {
          const status = Number(err?.statusCode || err?.status || 0);
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            console.error("push error", status, err?.message || err);
          }
        }
      }
      return sent;
    }

    if (body.mode === "test") {
      const auth = req.headers.get("authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "Missing user token" }, 401);
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return json({ error: "Invalid user token" }, 401);
      const sent = await sendToUser(data.user.id, {
        title: "💰 Payment Reminder",
        body: "Test Push Cloud: notificările pot veni și când aplicația este închisă.",
        tag: `test-${Date.now()}`,
        data: { url: "./" },
      });
      return json({ ok: true, sent });
    }

    const now = new Date().toISOString();
    const { data: reminders, error } = await admin
      .from("reminders")
      .select("id,user_id,friend_name,service_name,amount,currency,due_at,remind_at,timezone")
      .eq("active", true)
      .is("last_notified_at", null)
      .lte("remind_at", now)
      .order("remind_at", { ascending: true })
      .limit(100);

    if (error) return json({ error: error.message }, 500);

    let processed = 0;
    let delivered = 0;

    for (const reminder of reminders || []) {
      // Claim reminder atomically enough for concurrent cron invocations.
      const { data: claim, error: claimError } = await admin
        .from("reminders")
        .update({ last_notified_at: now })
        .eq("id", reminder.id)
        .is("last_notified_at", null)
        .select("id")
        .maybeSingle();
      if (claimError || !claim) continue;

      processed++;
      const payload = {
        title: `💰 ${reminder.friend_name} trebuie să-ți dea bani`,
        body: `${money(reminder.amount, reminder.currency)} pentru ${reminder.service_name}.`,
        tag: `reminder-${reminder.id}-${reminder.remind_at}`,
        data: { url: "./", reminderId: reminder.id },
      };

      const sent = await sendToUser(reminder.user_id, payload);
      delivered += sent;

      // If there is no valid subscription, keep it pending so it can retry later.
      if (sent === 0) {
        await admin
          .from("reminders")
          .update({ last_notified_at: null })
          .eq("id", reminder.id);
      }
    }

    return json({ ok: true, processed, delivered, at: now });
  },
};
