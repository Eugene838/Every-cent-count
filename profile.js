const db = window.supabaseClient;
const $ = (selector) => document.querySelector(selector);
let currentUser = null;

const displayNameFor = (account) => account?.user_metadata?.username?.trim() || account?.email?.split('@')[0] || 'My profile';
const initialsFor = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'EC';

function showMessage(selector, message, success = false) {
  const element = $(selector);
  element.textContent = message;
  element.classList.toggle('success', success);
}

function renderProfile(account) {
  const name = displayNameFor(account);
  const initials = initialsFor(name);
  $('#profileName').textContent = name;
  $('#profileEmail').textContent = account.email || 'Personal account';
  $('#profileAvatar').textContent = initials;
  $('#summaryName').textContent = name;
  $('#summaryEmail').textContent = account.email || 'Personal account';
  $('#summaryAvatar').textContent = initials;
  $('#usernameInput').value = name;
}

$('#menuButton').addEventListener('click', () => $('.sidebar').classList.toggle('open'));

$('#usernameForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = new FormData(event.currentTarget).get('username').trim();
  if (!username) { showMessage('#usernameMessage', 'Enter a username to continue.'); return; }
  $('#saveUsername').disabled = true;
  showMessage('#usernameMessage', 'Saving…');
  const { data, error } = await db.auth.updateUser({ data: { username } });
  $('#saveUsername').disabled = false;
  if (error) { showMessage('#usernameMessage', error.message); return; }
  currentUser = data.user || currentUser;
  renderProfile(currentUser);
  showMessage('#usernameMessage', 'Username updated.', true);
});

$('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const currentPassword = form.get('currentPassword');
  const newPassword = form.get('newPassword');
  const confirmPassword = form.get('confirmPassword');
  if (newPassword !== confirmPassword) { showMessage('#passwordMessage', 'Your new passwords do not match.'); return; }
  if (newPassword.length < 6) { showMessage('#passwordMessage', 'Use a password with at least 6 characters.'); return; }
  $('#savePassword').disabled = true;
  showMessage('#passwordMessage', 'Verifying current password…');
  const verification = await db.auth.signInWithPassword({ email: currentUser.email, password: currentPassword });
  if (verification.error) { $('#savePassword').disabled = false; showMessage('#passwordMessage', 'Your current password is incorrect.'); return; }
  showMessage('#passwordMessage', 'Updating password…');
  const { error } = await db.auth.updateUser({ password: newPassword });
  $('#savePassword').disabled = false;
  if (error) { showMessage('#passwordMessage', error.message); return; }
  event.currentTarget.reset();
  showMessage('#passwordMessage', 'Password updated successfully.', true);
});

async function initialize() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.replace('signin.html'); return; }
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) {
    await db.auth.signOut({ scope: 'local' });
    window.location.replace('signin.html');
    return;
  }
  currentUser = user;
  renderProfile(currentUser);
}

initialize();
