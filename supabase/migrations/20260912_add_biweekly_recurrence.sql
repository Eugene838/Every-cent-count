-- Allow open-ended bi-weekly schedules without changing existing transactions.
begin;
alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_recurrence_check;
alter table public.recurring_transactions
  add constraint recurring_transactions_recurrence_check
  check (recurrence in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'));
commit;
