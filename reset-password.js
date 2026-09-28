const db = window.supabaseClient;
const $ = (selector) => document.querySelector(selector);
const message = $('#resetPasswordMessage');
const submit = $('#resetPasswordSubmit');

async function hasRecoverySession() {
  if (!db) return false;
  const { data: { session } } = await db.auth.getSession();
  return Boolean(session);
}

$('#resetPasswordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!await hasRecoverySession()) { message.textContent = 'This reset link is invalid or has expired. Request a new one.'; return; }
  const form = new FormData(event.currentTarget);
  const password = form.get('password');
  if (password !== form.get('confirmation')) { message.textContent = 'The passwords do not match.'; return; }
  submit.disabled = true;
  message.classList.remove('success');
  message.textContent = 'Updating password…';
  const { error } = await db.auth.updateUser({ password });
  if (error) { message.textContent = error.message; submit.disabled = false; return; }
  message.textContent = 'Password updated successfully. You can now sign in.';
  message.classList.add('success');
  window.setTimeout(() => window.location.replace('/signin.html'), 2500);
});

hasRecoverySession().then(valid => {
  if (!valid) message.textContent = 'Open this page from the password-reset email, or request a new link.';
});
