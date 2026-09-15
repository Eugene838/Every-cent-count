-- Stores the local wall-clock time selected for each transaction.
alter table public.transactions
  add column if not exists transaction_time time;

alter table public.recurring_transactions
  add column if not exists transaction_time time;
