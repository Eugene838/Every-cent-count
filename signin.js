const db = window.supabaseClient;
let authMode = 'signin';
const $ = (selector) => document.querySelector(selector);

function isExistingAccount(response) {
  const message = response.error?.message?.toLowerCase() || '';
  const code = response.error?.code?.toLowerCase() || '';
  const returnedExistingUser = response.data?.user && Array.isArray(response.data.user.identities) && response.data.user.identities.length === 0;

  return returnedExistingUser
    || code === 'user_already_exists'
    || message.includes('already registered')
    || message.includes('already exists');
}

function showExistingAccountMessage() {
  $('#authMessage').textContent = 'Account already exist. Please login at the main page';
  $('#authMessage').classList.remove('success');
}

authMode = document.body.dataset.mode || 'signin';
const authNotice = sessionStorage.getItem('everyCentAuthNotice');
if (authNotice) {
  $('#authMessage').textContent = authNotice;
  sessionStorage.removeItem('everyCentAuthNotice');
}
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!db) {
    $('#authMessage').textContent = 'The secure connection could not load. Check your internet connection, then refresh this page.';
    return;
  }
  const form = new FormData(event.target);
  const email = form.get('email').trim();
  const password = form.get('password');
  $('#authSubmit').disabled = true;
  $('#authMessage').textContent = authMode === 'signup' ? 'Creating your account…' : 'Signing you in…';
  try {
    const result = authMode === 'signup' ? await db.auth.signUp({ email, password }) : await db.auth.signInWithPassword({ email, password });
    if (authMode === 'signup' && isExistingAccount(result)) { showExistingAccountMessage(); return; }
    if (result.error) { $('#authMessage').textContent = result.error.message; return; }
    if (result.data.session) { window.location.replace('index.html'); return; }
    $('#authMessage').textContent = 'Account created. Check your email to confirm it, then sign in.';
    $('#authMessage').classList.add('success');
  } catch (error) {
    $('#authMessage').textContent = `Could not reach Supabase: ${error.message || 'check your internet connection and project settings.'}`;
  } finally {
    $('#authSubmit').disabled = false;
  }
});

async function initialize() {
  if (!db) return;
  const shouldSignOut = new URLSearchParams(window.location.search).has('signout');
  if (shouldSignOut) { sessionStorage.removeItem('everyCentProfilePreview'); await db.auth.signOut({ scope: 'local' }); return; }
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) {
    await db.auth.signOut({ scope: 'local' });
    return;
  }
  window.location.replace('index.html');
}

initialize();
