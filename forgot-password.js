const db = window.supabaseClient;
const $ = (selector) => document.querySelector(selector);

$('#forgotPasswordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = new FormData(event.currentTarget).get('email').trim();
  const message = $('#forgotPasswordMessage');
  const submit = $('#forgotPasswordSubmit');
  if (!db) { message.textContent = 'The secure connection could not load. Refresh and try again.'; return; }
  submit.disabled = true;
  message.classList.remove('success');
  message.textContent = 'Sending reset link…';
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
  submit.disabled = false;
  if (error) { message.textContent = error.message; return; }
  message.textContent = 'If an account uses this email, a reset link is on its way.';
  message.classList.add('success');
});
