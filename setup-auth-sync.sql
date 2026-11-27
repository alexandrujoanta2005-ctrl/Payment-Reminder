-- Payment Reminder: stocare sincronizată per utilizator autentificat
create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_app_data enable row level security;
drop policy if exists "user_app_data_select_own" on public.user_app_data;
drop policy if exists "user_app_data_insert_own" on public.user_app_data;
drop policy if exists "user_app_data_update_own" on public.user_app_data;
create policy "user_app_data_select_own" on public.user_app_data for select to authenticated using (user_id = auth.uid());
create policy "user_app_data_insert_own" on public.user_app_data for insert to authenticated with check (user_id = auth.uid());
create policy "user_app_data_update_own" on public.user_app_data for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.user_app_data to authenticated;
