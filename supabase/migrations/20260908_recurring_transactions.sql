-- Run this in Supabase SQL Editor before deploying the recurring transaction UI.
create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  note text,
  category text not null,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  recurrence text not null check (recurrence in ('daily', 'monthly', 'quarterly', 'yearly', 'custom')),
  start_date date not null,
  end_date date,
  cycle_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (recurrence = 'custom' and cycle_end_date is not null and cycle_end_date > start_date)
    or (recurrence <> 'custom' and cycle_end_date is null)
  ),
  check (end_date is null or end_date >= start_date)
);

alter table public.recurring_transactions enable row level security;

drop policy if exists "Users manage their recurring transactions" on public.recurring_transactions;
create policy "Users manage their recurring transactions"
  on public.recurring_transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists recurring_transactions_user_start_date_idx
  on public.recurring_transactions (user_id, start_date);
