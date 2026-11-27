import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ADMIN_EMAIL = "alexandrujoanta6@gmail.com";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Autentificare necesară." }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user || (user.email || "").toLowerCase() !== ADMIN_EMAIL) {
      return json({ error: "Acces interzis. Doar administratorul poate folosi acest panou." }, 403);
    }
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json();
    if (body.action === "list_users") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
      if (error) throw error;
      const users = (data.users || []).map((u) => ({
        id: u.id, email: u.email || "",
        name: String(u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Utilizator"),
        created_at: u.created_at,
      }));
      return json({ users });
    }
    if (body.action === "issue_code") {
      const userId = String(body.userId || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Utilizator invalid." }, 400);
      const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId);
      if (targetError || !target.user) return json({ error: "Contul selectat nu există." }, 404);
      const code = makeCode();
      const codeHash = await sha256(code);
      const { error: revokeError } = await admin.from("admin_recovery_codes")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId).is("used_at", null).is("revoked_at", null);
      if (revokeError) throw revokeError;
      const { error } = await admin.from("admin_recovery_codes").insert({
        user_id: userId, code_hash: codeHash, created_by: user.id,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      return json({ code, expiresInHours: 24, targetEmail: target.user.email });
    }
    if (body.action === "delete_user") {
      const userId = String(body.userId || "");
      if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return json({ error: "Utilizator invalid." }, 400);
      }
      if (userId === user.id) {
        return json({ error: "Nu îți poți șterge propriul cont de administrator." }, 400);
      }
      const { data: target, error: targetError } =
        await admin.auth.admin.getUserById(userId);
      if (targetError || !target.user) {
        return json({ error: "Contul selectat nu există." }, 404);
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      return json({ success: true, deletedEmail: target.user.email || "" });
    }

    if (body.action === "list_codes") {
      const { data, error } = await admin.from("admin_recovery_codes")
        .select("id,user_id,created_at,expires_at,used_at,revoked_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const { data: authUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
      if (usersError) throw usersError;
      const emails = new Map((authUsers.users || []).map((u) => [u.id, u.email || "Cont șters"]));
      return json({ codes: (data || []).map((row) => ({ ...row, user_email: emails.get(row.user_id) || "Cont șters" })) });
    }
    return json({ error: "Acțiune necunoscută." }, 400);
  } catch (error) {
    console.error("admin-panel", error);
    return json({ error: error instanceof Error ? error.message : "Eroare internă." }, 500);
  }
});
