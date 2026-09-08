
# Recurring transactions

To enable monthly, quarterly, yearly, and custom recurring income or expenses,
run [20260908_recurring_transactions.sql](supabase/migrations/20260908_recurring_transactions.sql)
in the Supabase **SQL Editor**. It creates a private `recurring_transactions`
table protected by Row Level Security. The app expands scheduled entries locally
for the requested month/year; it does not create duplicate transaction rows.
