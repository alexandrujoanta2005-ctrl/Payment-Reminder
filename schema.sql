-- PAYMENT REMINDER v3
-- Rulează acest fișier în SQL Editor în proiectul Supabase dedicat aplicației.

create extension if not exists pgcrypto;

create table if not exists public.reminders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_name text not null,
  service_name text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'RON',
  due_at timestamptz not null,
  remind_at timestamptz not null,
  recurrence text not null default 'monthly' check (recurrence in ('once','monthly','yearly')),
  note text,
  timezone text not null default 'UTC',
  active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminders_due_push_idx
  on public.reminders (remind_at)
  where active = true and last_notified_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "reminders_select_own" on public.reminders;
drop policy if exists "reminders_insert_own" on public.reminders;
drop policy if exists "reminders_update_own" on public.reminders;
drop policy if exists "reminders_delete_own" on public.reminders;

create policy "reminders_select_own" on public.reminders
for select to authenticated using (user_id = auth.uid());

create policy "reminders_insert_own" on public.reminders
for insert to authenticated with check (user_id = auth.uid());

create policy "reminders_update_own" on public.reminders
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reminders_delete_own" on public.reminders
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "push_select_own" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_update_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;

create policy "push_select_own" on public.push_subscriptions
for select to authenticated using (user_id = auth.uid());

create policy "push_insert_own" on public.push_subscriptions
for insert to authenticated with check (user_id = auth.uid());

create policy "push_update_own" on public.push_subscriptions
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "push_delete_own" on public.push_subscriptions
for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.reminders to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.reminders to service_role;
grant all on public.push_subscriptions to service_role;
