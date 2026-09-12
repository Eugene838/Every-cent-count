const db = window.supabaseClient;
const cleanPageUrl = new URL(window.location.href);
if (cleanPageUrl.searchParams.has('v')) {
  cleanPageUrl.searchParams.delete('v');
  window.history.replaceState({}, '', `${cleanPageUrl.pathname}${cleanPageUrl.search}${cleanPageUrl.hash}`);
}

let data = { budget: 0, transactions: [], recurringTransactions: [], balanceAdjustments: [] };
let selectedYear = new Date().getFullYear();

const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 }).format(amount);
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const transactionFromRow = (row) => ({ amount: Number(row.amount), type: row.type, date: row.transaction_date });
const recurringFromRow = (row) => ({ amount: Number(row.amount), type: row.type, recurrence: row.recurrence, startDate: row.start_date, endDate: row.end_date, cycleEndDate: row.cycle_end_date });
const plusDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
const addMonths = (date, count) => { const next = new Date(date.getFullYear(), date.getMonth() + count, 1); next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())); return next; };
function scheduledTransactions() {
  const startLimit = new Date(selectedYear, 0, 1); const endLimit = new Date(selectedYear, 11, 31);
  return data.recurringTransactions.flatMap(template => {
    const start = new Date(`${template.startDate}T00:00:00`); let date = new Date(start); const entries = []; let safety = 0;
    const scheduleEnd = template.endDate ? new Date(`${template.endDate}T00:00:00`) : endLimit;
    const lastOccurrence = scheduleEnd < endLimit ? scheduleEnd : endLimit;
    while (date <= lastOccurrence && safety++ < 1000) {
      if (date >= startLimit) entries.push({ amount: template.amount, type: template.type, date: dateKey(date) });
      if (template.recurrence === 'daily') date = plusDays(date, 1);
      else if (template.recurrence === 'weekly') date = plusDays(date, 7);
      else if (template.recurrence === 'biweekly') date = plusDays(date, 14);
      else if (template.recurrence === 'monthly') date = addMonths(date, 1);
      else if (template.recurrence === 'quarterly') date = addMonths(date, 3);
      else if (template.recurrence === 'yearly') date = addMonths(date, 12);
      else date = plusDays(date, Math.max(1, Math.round((new Date(`${template.cycleEndDate}T00:00:00`) - start) / 86400000)));
    }
    return entries;
  });
}
const adjustmentFromRow = (row) => ({ amount: Number(row.amount), date: row.adjustment_date });
const displayNameFor = (account) => account?.user_metadata?.username?.trim() || account?.email?.split('@')[0] || 'My profile';

function renderProfile(account) {
  const name = displayNameFor(account);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'EC';
  $('#profileName').textContent = name;
  $('#profileEmail').textContent = account.email || 'Personal account';
  $('#profileAvatar').textContent = initials;
  $('#profileArea').classList.remove('profile-loading');
  sessionStorage.setItem('everyCentProfilePreview', JSON.stringify({ name, email: account.email || 'Personal account', initials }));
}

function getWeeklySpending(monthIndex, entries) {
  const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
  const weeks = new Map();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(selectedYear, monthIndex, day);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = dateKey(weekStart);
    if (!weeks.has(key)) weeks.set(key, { weekStart: key, firstDay: day, lastDay: day, total: 0 });
    else weeks.get(key).lastDay = day;
  }
  entries.filter(entry => entry.type === 'expense').forEach(entry => {
    const date = new Date(`${entry.date}T00:00:00`);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const week = weeks.get(dateKey(weekStart));
    if (week) week.total += entry.amount;
  });
  return [...weeks.values()];
}

async function loadData() {
  const [transactionResult, recurringResult, budgetResult, adjustmentResult] = await Promise.all([
    db.from('transactions').select('amount, type, transaction_date').order('transaction_date', { ascending: false }),
    db.from('recurring_transactions').select('amount, type, recurrence, start_date, end_date, cycle_end_date'),
    db.from('budgets').select('monthly_amount').maybeSingle(),
    db.from('balance_adjustments').select('amount, adjustment_date')
  ]);
  const error = transactionResult.error || budgetResult.error || adjustmentResult.error;
  if (error) { window.alert(`Could not load your yearly data. ${error.message}`); return; }
  if (recurringResult.error) console.warn('Recurring transactions are unavailable until the database migration is applied.', recurringResult.error);
  data = { budget: Number(budgetResult.data?.monthly_amount || 0), transactions: transactionResult.data.map(transactionFromRow), recurringTransactions: (recurringResult.data || []).map(recurringFromRow), balanceAdjustments: adjustmentResult.data.map(adjustmentFromRow) };
  renderYear();
}

function renderYear() {
  const scheduled = scheduledTransactions();
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
    const entries = [...data.transactions, ...scheduled].filter(entry => entry.date.startsWith(key));
    const income = entries.filter(entry => entry.type === 'income').reduce((total, entry) => total + entry.amount, 0);
    const spending = entries.filter(entry => entry.type === 'expense').reduce((total, entry) => total + entry.amount, 0);
    const adjustments = data.balanceAdjustments.filter(entry => entry.date.startsWith(key)).reduce((total, entry) => total + entry.amount, 0);
    return { index, income, spending, adjustments, net: income - spending + adjustments, weeklySpending: getWeeklySpending(index, entries) };
  });
  const totalIncome = months.reduce((total, month) => total + month.income, 0);
  const totalSpending = months.reduce((total, month) => total + month.spending, 0);
  const totalNet = months.reduce((total, month) => total + month.net, 0);
  const adjustmentTotal = months.reduce((total, month) => total + month.adjustments, 0);
  $('#yearLabel').textContent = selectedYear;
  $('#yearlyTitle').textContent = `${selectedYear} financial summary`;
  $('#yearlySummary').innerHTML = `<article class="yearly-page-metric"><span>YEARLY INCOME</span><strong>${money(totalIncome)}</strong><small>Across all income categories</small></article><article class="yearly-page-metric"><span>YEARLY SPENDING</span><strong>${money(totalSpending)}</strong><small>${data.budget ? `${money(data.budget * 12)} annual budget` : 'No budget set'}</small></article><article class="yearly-page-metric"><span>NET CHANGE</span><strong class="${totalNet >= 0 ? 'positive' : 'negative'}">${totalNet >= 0 ? '+' : '−'}${money(Math.abs(totalNet))}</strong><small>${adjustmentTotal ? `${adjustmentTotal >= 0 ? '+' : '−'}${money(Math.abs(adjustmentTotal))} balance adjustments` : 'No balance adjustments'}</small></article>`;
  $('#yearlyRows').innerHTML = months.map(month => {
    const label = new Intl.DateTimeFormat('en-SG', { month: 'long' }).format(new Date(selectedYear, month.index, 1));
    const budgetStatus = data.budget ? `${Math.round((month.spending / data.budget) * 100)}% used` : 'No budget';
    const monthKey = `${selectedYear}-${String(month.index + 1).padStart(2, '0')}`;
    const weeklyDetails = month.weeklySpending.map((week, index) => `<li><a class="yearly-week-link" href="/home?month=${monthKey}&week=${week.weekStart}#insights">Week ${index + 1} (${week.firstDay}–${week.lastDay})</a><span>${money(week.total)}</span></li>`).join('');
    return `<div class="yearly-row" tabindex="0"><span class="month-name">${label}<span class="yearly-week-detail" role="tooltip"><strong>${label} weekly spending</strong><ul>${weeklyDetails}</ul></span></span><span class="amount income-cell">${money(month.income)}</span><span class="amount spending-cell">${money(month.spending)}</span><span class="amount net-cell ${month.net >= 0 ? 'positive' : 'negative'}">${month.net >= 0 ? '+' : '−'}${money(Math.abs(month.net))}</span><span class="budget-status ${data.budget && month.spending > data.budget ? 'over' : ''}">${budgetStatus}</span></div>`;
  }).join('');
}

$('#previousYear').addEventListener('click', () => { selectedYear -= 1; renderYear(); });
$('#nextYear').addEventListener('click', () => { selectedYear += 1; renderYear(); });
$('#menuButton').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
function installPageNavigation() {
  document.querySelectorAll('.brand, .nav a, .profile-menu a').forEach(link => link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
    event.preventDefault();
    document.body.classList.add('page-leaving');
    window.setTimeout(() => window.location.assign(destination.href), 170);
  }));
}
installPageNavigation();
const profileMenuTrigger = $('#profileMenuTrigger');
const profileMenu = $('#profileMenu');
if (profileMenuTrigger && profileMenu) {
  const closeProfileMenu = () => { profileMenu.hidden = true; profileMenuTrigger.setAttribute('aria-expanded', 'false'); };
  profileMenuTrigger.addEventListener('click', () => {
    const willOpen = profileMenu.hidden;
    profileMenu.hidden = !willOpen;
    profileMenuTrigger.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (event) => { if (!$('.profile').contains(event.target)) closeProfileMenu(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeProfileMenu(); });
}

async function initialize() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.replace('signin.html'); return; }
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) {
    await db.auth.signOut({ scope: 'local' });
    window.location.replace('signin.html');
    return;
  }
  renderProfile(user);
  await loadData();
}

initialize();
