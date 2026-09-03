-- BANI DE PRIMIT - schema pentru sincronizare + Web Push
-- Rulează în proiectul Supabase dedicat acestei aplicații.

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_name text not null,
  service_name text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'RON',
  due_at timestamptz not null,
  remind_at timestamptz not null,
  recurrence text not null default 'monthly' check (recurrence in ('once','monthly','yearly')),
  note text,
  active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "reminders_select_own" on public.reminders for select to authenticated using (user_id = auth.uid());
create policy "reminders_insert_own" on public.reminders for insert to authenticated with check (user_id = auth.uid());
create policy "reminders_update_own" on public.reminders for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reminders_delete_own" on public.reminders for delete to authenticated using (user_id = auth.uid());

create policy "push_select_own" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push_insert_own" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "push_delete_own" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
