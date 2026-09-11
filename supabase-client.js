// The publishable key is safe in browser code when Row Level Security is enabled.
// Never replace this with a service-role key.
const demoMode = window.location.pathname === '/demo';

if (!demoMode) {
  window.supabaseClient = window.supabase.createClient(
    'https://jipiurqxddchjtwlmltf.supabase.co',
    'sb_publishable_FW1xMNmOPK2EvX6N-fZZSw_DRUUJDUr',
  );
} else {
  document.body.classList.add('demo-mode');
  const demoKey = 'everyCentCountsDemoData';
  const today = new Date();
  const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const daysAgo = (days) => dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
  const initialData = () => ({
    transactions: [
      { id: crypto.randomUUID(), description: 'Salary', note: 'Monthly salary', category: 'Salary', amount: 4200, type: 'income', transaction_date: daysAgo(9), created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), description: 'Morning groceries', note: 'Weekly household shopping', category: 'Food', amount: 46.8, type: 'expense', transaction_date: daysAgo(5), created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), description: 'MRT top-up', note: '', category: 'Transport', amount: 30, type: 'expense', transaction_date: daysAgo(3), created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), description: 'Stuff\'d', note: 'Lunch with colleagues', category: 'Food', amount: 11.2, type: 'expense', transaction_date: daysAgo(1), created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), description: 'Singtel', note: 'Mobile bill', category: 'Home', amount: 25, type: 'expense', transaction_date: daysAgo(0), created_at: new Date().toISOString() }
    ],
    recurring_transactions: [], budgets: [{ id: 'demo-budget', monthly_amount: 1800 }], balance_adjustments: []
  });
  const read = () => JSON.parse(localStorage.getItem(demoKey) || 'null') || initialData();
  const write = (value) => localStorage.setItem(demoKey, JSON.stringify(value));
  const response = (data) => ({ data, error: null });
  const matches = (row, filters) => filters.every(filter => filter.kind === 'in' ? filter.values.includes(row[filter.column]) : row[filter.column] === filter.value);
  const query = (table, action = 'select', values = null) => {
    const filters = [];
    const chain = {
      eq(column, value) { filters.push({ column, value }); return chain; },
      in(column, valuesIn) { filters.push({ kind: 'in', column, values: valuesIn }); return chain; },
      order(column, options = {}) { chain.sort = { column, ascending: options.ascending !== false }; return chain; },
      select() { return chain; }, single() { chain.singleRow = true; return chain; }, maybeSingle() { chain.singleRow = true; return chain; },
      then(resolve, reject) {
        try {
          const store = read(); const rows = store[table] || []; let result;
          if (action === 'select') { result = rows.filter(row => matches(row, filters)); if (chain.sort) result.sort((a, b) => String(a[chain.sort.column]).localeCompare(String(b[chain.sort.column])) * (chain.sort.ascending ? 1 : -1)); }
          if (action === 'insert') { const inserted = (Array.isArray(values) ? values : [values]).map(value => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...value })); store[table] = [...rows, ...inserted]; write(store); result = inserted; }
          if (action === 'update') { result = rows.filter(row => matches(row, filters)).map(row => Object.assign(row, values)); write(store); }
          if (action === 'delete') { result = rows.filter(row => matches(row, filters)); store[table] = rows.filter(row => !matches(row, filters)); write(store); }
          if (action === 'upsert') { const existing = rows[0]; result = existing ? [Object.assign(existing, values)] : [{ id: crypto.randomUUID(), ...values }]; store[table] = existing ? rows : [...rows, ...result]; write(store); }
          resolve(response(chain.singleRow ? (result[0] || null) : result));
        } catch (error) { resolve({ data: null, error }); }
      }
    };
    return chain;
  };
  const demoUser = { id: 'local-demo-user', email: 'demo@everycentcounts.app', user_metadata: { username: 'Demo user' } };
  window.supabaseClient = {
    from(table) { return { select: () => query(table), insert: values => query(table, 'insert', values), update: values => query(table, 'update', values), delete: () => query(table, 'delete'), upsert: values => query(table, 'upsert', values) }; },
    auth: { getSession: async () => ({ data: { session: { user: demoUser } }, error: null }), getUser: async () => ({ data: { user: demoUser }, error: null }), signOut: async () => ({ error: null }), refreshSession: async () => ({ data: { session: { user: demoUser } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
  };
}
