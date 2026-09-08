-- Run after 20260908_recurring_transactions.sql to replace custom cycles with weekly repeats.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.recurring_transactions'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%custom%' or pg_get_constraintdef(oid) like '%recurrence%')
  loop
    execute format('alter table public.recurring_transactions drop constraint %I', constraint_name);
  end loop;
end $$;

update public.recurring_transactions
set recurrence = 'weekly', cycle_end_date = null
where recurrence = 'custom';

alter table public.recurring_transactions
  add constraint recurring_transactions_recurrence_check
  check (recurrence in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

alter table public.recurring_transactions
  add constraint recurring_transactions_cycle_end_check
  check (cycle_end_date is null);

alter table public.recurring_transactions
  add constraint recurring_transactions_end_date_check
  check (end_date is null or end_date >= start_date);
