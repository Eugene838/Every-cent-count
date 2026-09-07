# Supabase setup for Every Cent Counts

This guide moves Every Cent Counts from browser-only storage to a private PostgreSQL database. After the connection work is completed, your transactions, budget, and balance-adjustment history can sync across devices after you sign in.

## 1. Create a project

1. Go to [Supabase](https://supabase.com/dashboard) and sign in or create an account.
2. Choose **New project**.
3. Pick an organisation, then give the project a name such as `every-cent-counts-finance`.
4. Choose a strong database password and save it somewhere secure. The app will not need this password.
5. Select the region closest to you and create the project.
6. Wait for the project status to become active.

## 2. Create the data tables

Open **SQL Editor** in the Supabase sidebar, choose **New query**, paste the SQL below, and click **Run**.

```sql
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (char_length(description) <= 120),
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  transaction_date date not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_amount numeric(12, 2) not null check (monthly_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null,
  previous_balance numeric(12, 2) not null,
  new_balance numeric(12, 2) not null,
  note text check (char_length(note) <= 60),
  adjustment_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc);

create index balance_adjustments_user_date_idx
  on public.balance_adjustments (user_id, adjustment_date desc);
```

## 3. Secure every row

Still in the SQL Editor, run this policy script. It enables Row Level Security (RLS) and limits records to the signed-in owner. Do not skip this step for finance data.

```sql
alter table public.transactions enable row level security;
alter table public.profiles enable row level security;
alter table public.budgets enable row level security;
alter table public.balance_adjustments enable row level security;

revoke all on table public.profiles, public.transactions, public.budgets, public.balance_adjustments from anon, authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.transactions, public.budgets, public.balance_adjustments to authenticated;

create policy "Users read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Transactions: own select" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Transactions: own insert" on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Transactions: own update" on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Transactions: own delete" on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Budgets: own select" on public.budgets for select to authenticated using ((select auth.uid()) = user_id);
create policy "Budgets: own insert" on public.budgets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Budgets: own update" on public.budgets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Budgets: own delete" on public.budgets for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Balance adjustments: own select" on public.balance_adjustments for select to authenticated using ((select auth.uid()) = user_id);
create policy "Balance adjustments: own insert" on public.balance_adjustments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Balance adjustments: own update" on public.balance_adjustments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Balance adjustments: own delete" on public.balance_adjustments for delete to authenticated using ((select auth.uid()) = user_id);
```

## 3a. Create a profile and budget for every new account

Run this in **SQL Editor** after the tables and policies above. It creates a profile record and a zero-value budget whenever someone signs up. This makes new accounts visible in **Table Editor → profiles** and **Table Editor → budgets**, while transactions remain empty until the user adds them.

```sql
create or replace function public.create_finance_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.budgets (user_id, monthly_amount)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_finance_profile();

revoke execute on function public.create_finance_profile() from public, anon, authenticated;

-- Backfill profiles and budgets for accounts created before this trigger.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

insert into public.budgets (user_id, monthly_amount)
select id, 0 from auth.users
on conflict (user_id) do nothing;
```

## 4. Configure sign-in

1. Open **Authentication → Providers**.
2. Keep **Email** enabled. Email/password is the simplest first option for Every Cent Counts.
3. For early testing, you may turn off email confirmation in **Authentication → Providers → Email**. Turn it back on before sharing the app with anyone.
4. Later, add Google or another provider if you prefer.

## 5. Get the browser-safe connection details

1. Open **Project Settings → API**.
2. Copy the **Project URL**.
3. Copy the **publishable key** (or legacy `anon` key, if that is what your project displays).
4. Keep the **service_role** key secret. Never place it in `app.js`, `yearly.js`, an HTML file, or a public repository.

When you are ready for integration, provide the Project URL and publishable key. Those are designed to be used by the browser alongside RLS; the service-role key is not.

## 6. What will change in this app

The next implementation step will:

- add a sign-in/sign-up screen;
- create a Supabase client using your Project URL and publishable key;
- replace `localStorage` reads/writes in `app.js` and `yearly.js` with private database queries;
- use the secure database as the source of truth for all new entries. Existing browser-only entries can be migrated separately if needed.

## Quick verification

After creating the tables, open **Table Editor**. You should see `transactions`, `budgets`, and `balance_adjustments`. They will remain empty until the app is connected and you add data.
