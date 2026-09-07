// The publishable key is safe in browser code when Row Level Security is enabled.
// Never replace this with a service-role key.
window.supabaseClient = window.supabase.createClient(
  'https://jipiurqxddchjtwlmltf.supabase.co',
  'sb_publishable_FW1xMNmOPK2EvX6N-fZZSw_DRUUJDUr',
);
