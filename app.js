const db = window.supabaseClient;
const cleanPageUrl = new URL(window.location.href);
if (cleanPageUrl.searchParams.has('v')) {
  cleanPageUrl.searchParams.delete('v');
  window.history.replaceState({}, '', `${cleanPageUrl.pathname}${cleanPageUrl.search}${cleanPageUrl.hash}`);
}

const categoryInfo = {
  Food: { icon: '🍔', color: '#f7e4cb' }, Transport: { icon: '🚌', color: '#dcebee' }, Shopping: { icon: '🛒', color: '#eee3f1' },
  Home: { icon: '🏠', color: '#dcebdc' }, Entertainment: { icon: '🎬', color: '#f3dde0' }, Health: { icon: '💊', color: '#f4ebc8' },
  Salary: { icon: '💼', color: '#dcebdc' }, Freelance: { icon: '💻', color: '#dcebee' }, Capital: { icon: '📈', color: '#f4ebc8' }, Other: { icon: '✦', color: '#e8e9e4' }
};
const expenseCategories = ['Food', 'Transport', 'Shopping', 'Home', 'Entertainment', 'Health', 'Other'];
const incomeCategories = ['Salary', 'Freelance', 'Capital', 'Other'];
const emptyData = () => ({ budget: 0, transactions: [], recurringTransactions: [], balanceAdjustments: [] });
let data = emptyData();
let currentDate = new Date();
const dashboardParams = new URLSearchParams(window.location.search);
const requestedMonth = dashboardParams.get('month');
const requestedWeek = dashboardParams.get('week');
if (/^\d{4}-\d{2}$/.test(requestedMonth || '')) {
  const [year, month] = requestedMonth.split('-').map(Number);
  currentDate = new Date(year, month - 1, 1);
}
currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let selectedType = 'expense';
let authMode = 'signin';
let user = null;
let transactionPage = 1;
let transactionPageAnimation = null;
let editingTransactionId = null;
let editingRecurringId = null;
let editingPaymentGroupId = null;
let activeRecurringDeleteGroupId = null;
let sessionRecoveryInProgress = false;
let bulkEditMode = false;
let activityWeekStart = /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek || '') ? startOfWeek(new Date(`${requestedWeek}T00:00:00`)) : startOfWeek(new Date());
const selectedTransactionIds = new Set();
const transactionsPerPage = 5;

const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 }).format(amount);
const shortMoney = (amount) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(amount);
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function startOfWeek(date) { const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return start; }
function plusDays(date, amount) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
const escapeHTML = (value) => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
const dateLabel = (date) => new Intl.DateTimeFormat('en-SG', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00`));
const getMonthTransactions = () => data.transactions.filter((entry) => entry.date.startsWith(monthKey(currentDate)));
const currentBalance = () => { const today = dateKey(new Date()); return data.transactions.filter(entry => entry.date <= today).reduce((total, entry) => total + (entry.type === 'income' ? entry.amount : -entry.amount), 0) + data.balanceAdjustments.reduce((total, entry) => total + entry.amount, 0); };
const icon = (category) => { const item = categoryInfo[category] || categoryInfo.Other; return `<span class="category-icon" style="background:${item.color}">${item.icon}</span>`; };
const transactionFromRow = (row) => ({ id: row.id, description: row.description, note: row.note || '', category: row.category, amount: Number(row.amount), type: row.type, date: row.transaction_date, createdAt: row.created_at, recurrenceGroupId: row.recurrence_group_id || null, paymentNumber: row.recurrence_index || null, paymentCount: row.recurrence_count || null, recurring: false });
const recurringFromRow = (row) => ({ id: row.id, description: row.description, note: row.note || '', category: row.category, amount: Number(row.amount), type: row.type, recurrence: row.recurrence, startDate: row.start_date, endDate: row.end_date, cycleEndDate: row.cycle_end_date, createdAt: row.created_at });
const addMonths = (date, count) => { const next = new Date(date.getFullYear(), date.getMonth() + count, 1); next.setDate(Math.min(date.getDate(), new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())); return next; };
const recurrenceLabel = (entry) => entry.recurrence[0].toUpperCase() + entry.recurrence.slice(1);
function occurrenceDates(recurrence, startKey, endKey) {
  const start = new Date(`${startKey}T00:00:00`); const end = new Date(`${endKey}T00:00:00`); const dates = [];
  for (let index = 0; index < 1000; index += 1) {
    let date;
    if (recurrence === 'daily') date = plusDays(start, index);
    else if (recurrence === 'weekly') date = plusDays(start, index * 7);
    else if (recurrence === 'monthly') date = addMonths(start, index);
    else if (recurrence === 'quarterly') date = addMonths(start, index * 3);
    else if (recurrence === 'yearly') date = addMonths(start, index * 12);
    else date = plusDays(start, index * 7);
    if (date > end) break;
    dates.push(dateKey(date));
  }
  return dates;
}
function paymentGroup(groupId) { return data.oneOffTransactions.filter(entry => entry.recurrenceGroupId === groupId).sort((a, b) => a.date.localeCompare(b.date)); }
function inferPaymentSchedule(payments) {
  const start = new Date(`${payments[0].date}T00:00:00`);
  const end = new Date(`${payments.at(-1).date}T00:00:00`);
  const gapDays = payments.length > 1 ? Math.round((new Date(`${payments[1].date}T00:00:00`) - start) / 86400000) : 1;
  const monthGap = payments.length > 1 ? ((new Date(`${payments[1].date}T00:00:00`).getFullYear() - start.getFullYear()) * 12) + new Date(`${payments[1].date}T00:00:00`).getMonth() - start.getMonth() : 0;
  let recurrence = 'weekly';
  if (gapDays === 1) recurrence = 'daily';
  else if (gapDays === 7) recurrence = 'weekly';
  else if (start.getDate() === new Date(`${payments[1]?.date || payments[0].date}T00:00:00`).getDate() && monthGap === 1) recurrence = 'monthly';
  else if (start.getDate() === new Date(`${payments[1]?.date || payments[0].date}T00:00:00`).getDate() && monthGap === 3) recurrence = 'quarterly';
  else if (start.getDate() === new Date(`${payments[1]?.date || payments[0].date}T00:00:00`).getDate() && monthGap === 12) recurrence = 'yearly';
  return { recurrence, start: dateKey(start), end: dateKey(end) };
}
function scheduledTransactions() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const earliest = new Date(today.getFullYear() - 10, 0, 1);
  return data.recurringTransactions.flatMap(template => {
    const start = new Date(`${template.startDate}T00:00:00`);
    const occurrences = [];
    let date = new Date(start);
    let safety = 0;
    const endDate = template.endDate ? new Date(`${template.endDate}T00:00:00`) : today;
    const lastOccurrence = endDate < today ? endDate : today;
    while (date <= lastOccurrence && safety++ < 1000) {
      if (date >= earliest) occurrences.push({ ...template, id: `recurring:${template.id}:${dateKey(date)}`, date: dateKey(date), recurring: true, recurringId: template.id, createdAt: template.createdAt });
      if (template.recurrence === 'daily') date = plusDays(date, 1);
      else if (template.recurrence === 'weekly') date = plusDays(date, 7);
      else if (template.recurrence === 'monthly') date = addMonths(date, 1);
      else if (template.recurrence === 'quarterly') date = addMonths(date, 3);
      else if (template.recurrence === 'yearly') date = addMonths(date, 12);
      else {
        // Retain compatibility with any old custom-cycle rows created before weekly repeats replaced them.
        const cycleDays = Math.round((new Date(`${template.cycleEndDate}T00:00:00`) - start) / 86400000);
        date = plusDays(date, Math.max(1, cycleDays));
      }
    }
    return occurrences;
  });
}
const refreshScheduledTransactions = () => { data.transactions = [...data.oneOffTransactions, ...scheduledTransactions()]; };
const adjustmentFromRow = (row) => ({ id: row.id, amount: Number(row.amount), previousBalance: Number(row.previous_balance), newBalance: Number(row.new_balance), note: row.note, date: row.adjustment_date, createdAt: row.created_at });
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

const isFutureJwtError = (error) => /jwt issued at future/i.test(error?.message || '');

async function recoverFutureJwtSession() {
  if (sessionRecoveryInProgress) return;
  sessionRecoveryInProgress = true;
  const recoveryKey = 'everyCentFutureJwtRecoveryAt';
  const lastAttempt = Number(sessionStorage.getItem(recoveryKey) || 0);
  if (Date.now() - lastAttempt < 15000) {
    await db.auth.signOut({ scope: 'local' });
    sessionStorage.setItem('everyCentAuthNotice', 'Your secure session was reset. Please sign in again to continue.');
    window.location.replace('signin.html');
    return;
  }
  sessionStorage.setItem(recoveryKey, String(Date.now()));
  try {
    const { data, error } = await db.auth.refreshSession();
    if (!error && data.session) {
      window.setTimeout(() => window.location.reload(), 1200);
      return;
    }
  } catch (refreshError) {
    console.error(refreshError);
  }
  await db.auth.signOut({ scope: 'local' });
  sessionStorage.setItem('everyCentAuthNotice', 'Your secure session was reset. Please sign in again to continue.');
  window.location.replace('signin.html');
}

function operationError(error) {
  console.error(error);
  if (isFutureJwtError(error)) {
    recoverFutureJwtSession();
    return;
  }
  window.alert(`Could not save your change. ${error.message || 'Please try again.'}`);
}

async function loadData() {
  const [transactionResult, recurringResult, budgetResult, adjustmentResult] = await Promise.all([
    db.from('transactions').select('*').order('transaction_date', { ascending: false }),
    db.from('recurring_transactions').select('*').order('start_date', { ascending: false }),
    db.from('budgets').select('monthly_amount').maybeSingle(),
    db.from('balance_adjustments').select('*').order('created_at', { ascending: true })
  ]);
  const error = transactionResult.error || budgetResult.error || adjustmentResult.error;
  if (error) { operationError(error); return; }
  if (recurringResult.error) console.warn('Recurring transactions are unavailable until the database migration is applied.', recurringResult.error);
  data = {
    budget: Number(budgetResult.data?.monthly_amount || 0),
    oneOffTransactions: transactionResult.data.map(transactionFromRow),
    transactions: [],
    recurringTransactions: (recurringResult.data || []).map(recurringFromRow),
    balanceAdjustments: adjustmentResult.data.map(adjustmentFromRow)
  };
  refreshScheduledTransactions();
  render();
}

function render() {
  const transactions = getMonthTransactions();
  const income = transactions.filter(x => x.type === 'income').reduce((sum, x) => sum + x.amount, 0);
  const spending = transactions.filter(x => x.type === 'expense').reduce((sum, x) => sum + x.amount, 0);
  const balance = currentBalance();
  const rate = income ? Math.max(0, Math.round(((income - spending) / income) * 100)) : 0;
  const used = data.budget ? Math.round((spending / data.budget) * 100) : 0;
  const usedCapped = Math.min(used, 100);
  const monthName = new Intl.DateTimeFormat('en-SG', { month: 'long', year: 'numeric' }).format(currentDate);
  $('#monthLabel').textContent = monthName;
  $('#monthPicker').value = monthKey(currentDate);
  $('#greeting').textContent = `${new Intl.DateTimeFormat('en-SG', { month: 'long' }).format(currentDate).toUpperCase()} AT A GLANCE`;
  $('#balanceValue').textContent = money(balance);
  const latestAdjustment = data.balanceAdjustments.at(-1);
  $('#balanceTrend').textContent = latestAdjustment ? `Last adjusted ${dateLabel(latestAdjustment.date)}` : 'Set your opening balance to get started';
  $('#incomeValue').textContent = money(income); $('#spendingValue').textContent = money(spending); $('#savingRate').textContent = `${rate}%`;
  $('#incomeTrend').textContent = `${transactions.filter(x => x.type === 'income').length} income ${transactions.filter(x => x.type === 'income').length === 1 ? 'entry' : 'entries'}`;
  $('#spendingTrend').textContent = `${transactions.filter(x => x.type === 'expense').length} expense ${transactions.filter(x => x.type === 'expense').length === 1 ? 'entry' : 'entries'}`;
  $('#budgetPercent').textContent = data.budget ? `${used}%` : '—';
  $('#budgetRemaining').textContent = data.budget ? (spending <= data.budget ? `${money(data.budget - spending)} left to spend` : `${money(spending - data.budget)} over budget`) : 'Set a budget to get started';
  $('#budgetSpent').textContent = money(spending); $('#budgetTotal').textContent = money(data.budget);
  $('#editBudget').textContent = data.budget ? 'Edit budget' : 'Set budget';
  $('#budgetProgress').style.width = `${usedCapped}%`;
  $('#budgetDonut').style.background = `conic-gradient(${spending > data.budget ? '#c26e68' : 'var(--green)'} 0deg ${usedCapped * 3.6}deg, #e5eee8 ${usedCapped * 3.6}deg 360deg)`;
  renderMetricDetails(transactions); renderCategories(transactions); renderTransactions(data.transactions); renderChart(data.transactions); renderInsight(spending, income, used); renderBalanceHistory(); renderDescriptionSuggestions();
}

function renderMetricDetails(transactions) {
  [['income', 'incomeDetail'], ['expense', 'spendingDetail']].forEach(([type, target]) => {
    const entries = transactions.filter(entry => entry.type === type).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const title = type === 'income' ? 'Income this month' : 'Spending this month';
    const rows = entries.length ? entries.map(entry => `<li><span>${escapeHTML(entry.description)}</span><span>${dateLabel(entry.date)} · ${money(entry.amount)}</span></li>`).join('') : '<li class="metric-detail-empty">No entries this month</li>';
    $(`#${target}`).innerHTML = `<strong>${title} · ${money(total)}</strong><ul>${rows}</ul>`;
  });
}

function renderDescriptionSuggestions() {
  const suggestions = $('#transactionDescriptionSuggestions');
  const uniqueDescriptions = [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .map(x => x.description.trim())
    .filter((description, index, all) => description && all.indexOf(description) === index)
    .slice(0, 30);
  suggestions.replaceChildren(...uniqueDescriptions.map(description => {
    const option = document.createElement('option');
    option.value = description;
    return option;
  }));
}

function renderCategories(transactions) {
  const totals = {};
  transactions.filter(x => x.type === 'expense').forEach(x => { totals[x.category] = (totals[x.category] || 0) + x.amount; });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const totalSpending = Math.max(1, Object.values(totals).reduce((a, b) => a + b, 0));
  $('#categoryList').innerHTML = entries.length ? entries.map(([category, total]) => {
    const categoryEntries = transactions.filter(x => x.type === 'expense' && x.category === category).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const entryList = categoryEntries.map(x => `<li><span>${x.description}</span><span>${dateLabel(x.date)} · ${money(x.amount)}</span></li>`).join('');
    return `<div class="category" tabindex="0" aria-label="${category} spending details">${icon(category)}<div class="category-title"><strong>${category}</strong><small>${Math.round((total / totalSpending) * 100)}% of spending</small></div><span class="category-amount">${money(total)}</span><div class="category-detail" role="tooltip"><strong>${category} entries this month</strong><ul>${entryList}</ul></div></div>`;
  }).join('') : '<div class="empty-state">Your categories will appear here.</div>';
}

function renderTransactions(transactions) {
  const list = $('#transactionList');
  $('#transactions').classList.toggle('bulk-editing', bulkEditMode);
  $('#toggleBulkEdit').textContent = bulkEditMode ? 'Done' : 'Edit';
  const newestFirst = transactions.filter(entry => entry.date.startsWith(monthKey(currentDate))).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / transactionsPerPage));
  transactionPage = Math.min(transactionPage, totalPages);
  const pageStart = (transactionPage - 1) * transactionsPerPage;
  const recent = newestFirst.slice(pageStart, pageStart + transactionsPerPage);
  list.innerHTML = recent.map(x => { const note = x.note ? escapeHTML(x.note) : 'No note added'; const schedule = x.recurring ? `<small class="recurrence-badge">↻ ${x.recurrence === 'custom' ? 'Custom cycle' : x.recurrence}</small>` : x.paymentNumber ? `<small class="payment-badge">Recurring ${x.paymentNumber}/${x.paymentCount}</small>` : ''; return `<div class="transaction-row"><label class="transaction-selector"><input class="transaction-select" data-id="${x.id}" type="checkbox" aria-label="Select ${x.description}" ${selectedTransactionIds.has(x.id) ? 'checked' : ''} /></label><div class="transaction-name">${icon(x.category)}<span>${x.description}${schedule}</span></div><span class="transaction-category">${x.category}</span><span class="transaction-note" tabindex="0"><span class="transaction-note-preview">${x.note ? note : '—'}</span><span class="transaction-note-detail" role="tooltip">${note}</span></span><span class="transaction-date">${dateLabel(x.date)}</span><span class="transaction-amount ${x.type}">${x.type === 'income' ? '+' : '−'}${money(x.amount)} <button class="edit-transaction" data-id="${x.id}" aria-label="Edit ${x.description}">✎</button><button class="delete-transaction" data-id="${x.id}" aria-label="Delete ${x.description}">×</button></span></div>`; }).join('');
  list.classList.toggle('has-transactions', Boolean(recent.length));
  list.classList.remove('page-enter-next', 'page-enter-previous');
  if (transactionPageAnimation) {
    void list.offsetWidth;
    list.classList.add(`page-enter-${transactionPageAnimation}`);
    transactionPageAnimation = null;
  }
  $('#emptyState').hidden = Boolean(recent.length);
  $('#transactionPagination').hidden = newestFirst.length <= transactionsPerPage;
  $('#transactionPageStatus').textContent = `Page ${transactionPage} of ${totalPages}`;
  $('#previousTransactionPage').disabled = transactionPage === 1;
  $('#nextTransactionPage').disabled = transactionPage === totalPages;
  const selectAll = $('#selectAllTransactions');
  selectAll.checked = Boolean(recent.length) && recent.every(x => selectedTransactionIds.has(x.id));
  selectAll.indeterminate = recent.some(x => selectedTransactionIds.has(x.id)) && !selectAll.checked;
  selectAll.disabled = !recent.length;
  $('#bulkActions').hidden = !bulkEditMode || selectedTransactionIds.size === 0;
  $('#selectedTransactionCount').textContent = `${selectedTransactionIds.size} selected`;
  list.querySelectorAll('.transaction-select').forEach(input => input.addEventListener('change', () => {
    if (input.checked) selectedTransactionIds.add(input.dataset.id);
    else selectedTransactionIds.delete(input.dataset.id);
    renderTransactions(data.transactions);
  }));
  list.querySelectorAll('.edit-transaction').forEach(button => button.addEventListener('click', () => {
    const transaction = data.transactions.find(x => x.id === button.dataset.id);
    if (transaction) openTransactionModal(transaction);
  }));
  list.querySelectorAll('.delete-transaction').forEach(button => button.addEventListener('click', async () => {
    const transaction = data.transactions.find(x => x.id === button.dataset.id);
    if (transaction?.recurrenceGroupId && transaction.paymentCount) { openRecurringDeleteModal(transaction); return; }
    const { error } = transaction?.recurring
      ? await db.from('recurring_transactions').delete().eq('id', transaction.recurringId)
      : await db.from('transactions').delete().eq('id', button.dataset.id);
    if (error) { operationError(error); return; }
    selectedTransactionIds.delete(button.dataset.id);
    if (transaction?.recurring) data.recurringTransactions = data.recurringTransactions.filter(x => x.id !== transaction.recurringId);
    else data.oneOffTransactions = data.oneOffTransactions.filter(x => x.id !== button.dataset.id);
    refreshScheduledTransactions();
    render();
  }));
}

function openRecurringDeleteModal(transaction, selectCurrent = true) {
  activeRecurringDeleteGroupId = transaction.recurrenceGroupId;
  const payments = data.oneOffTransactions.filter(entry => entry.recurrenceGroupId === activeRecurringDeleteGroupId).sort((a, b) => a.paymentNumber - b.paymentNumber);
  $('#recurringDeleteList').innerHTML = payments.map(entry => `<label class="recurring-delete-item"><input type="checkbox" name="payment" value="${entry.id}" ${selectCurrent && entry.id === transaction.id ? 'checked' : ''} /><span><strong>Transaction ${entry.paymentNumber}/${entry.paymentCount}</strong><small>${dateLabel(entry.date)} · ${entry.type === 'income' ? '+' : '−'}${money(entry.amount)}</small></span></label>`).join('');
  $('#deleteRecurringPayments').textContent = 'Delete selected transactions';
  $('#recurringDeleteModal').showModal();
}

function renderChart(transactions) {
  const weekDates = Array.from({ length: 7 }, (_, index) => plusDays(activityWeekStart, index));
  const weekEnd = weekDates.at(-1);
  const expenses = transactions.filter(x => x.type === 'expense' && x.date >= dateKey(activityWeekStart) && x.date <= dateKey(weekEnd));
  const totals = weekDates.map(date => expenses.filter(x => x.date === dateKey(date)).reduce((sum, x) => sum + x.amount, 0));
  const max = Math.max(...totals, 1);
  const today = dateKey(new Date());
  const weekFormatter = new Intl.DateTimeFormat('en-SG', { month: 'short', day: 'numeric' });
  $('#activityWeekLabel').textContent = `${weekFormatter.format(activityWeekStart)} – ${weekFormatter.format(weekEnd)}`;
  $('#chartDays').innerHTML = weekDates.map(date => `<span>${new Intl.DateTimeFormat('en-SG', { weekday: 'short' }).format(date)} ${date.getDate()}</span>`).join('');
  $('#barChart').innerHTML = totals.map((value, index) => {
    const date = weekDates[index];
    const entries = expenses.filter(x => x.date === dateKey(date)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const entryList = entries.length ? entries.map(x => `<li><span class="bar-entry-name">${x.description}</span><span class="bar-entry-amount">${money(x.amount)}</span></li>`).join('') : '<li class="bar-detail-empty">No spending entries</li>';
    const edgeClass = index === 0 ? 'bar-edge-start' : index === 6 ? 'bar-edge-end' : '';
    const weekday = new Intl.DateTimeFormat('en-SG', { weekday: 'long' }).format(date);
    return `<div class="bar ${dateKey(date) === today ? 'current' : ''} ${edgeClass}" tabindex="0" aria-label="${dateLabel(dateKey(date))} spending details" data-value="${money(value)}" style="height:${Math.max(5, (value / max) * 100)}%"><div class="bar-detail"><strong>${weekday} · ${money(value)}</strong><ul>${entryList}</ul></div></div>`;
  }).join('');
  const spend = totals.reduce((a, b) => a + b, 0); $('#averageSpend').textContent = shortMoney(spend / 7);
}

function renderInsight(spending, income, used) {
  let text = 'Add a few transactions to see your spending story.';
  if (spending && used > 100) text = `You are ${used - 100}% over your planned budget. A quick review of your largest category may help.`;
  else if (spending && income) text = `You have kept ${Math.round(((income - spending) / income) * 100)}% of income unspent so far — a steady start.`;
  else if (spending) text = `You have used ${used}% of your monthly budget. Keep an eye on your largest category.`;
  $('#insightText').textContent = text;
}

function renderBalanceHistory() {
  const entries = [...data.balanceAdjustments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  $('#balanceHistory').innerHTML = entries.map(entry => `<article class="balance-history-item"><strong>${money(entry.previousBalance)} → ${money(entry.newBalance)}</strong><p>${entry.note || 'Balance adjustment'}</p><small>${dateLabel(entry.date)}</small></article>`).join('');
  $('#balanceHistoryEmpty').hidden = Boolean(entries.length);
}

function updateCategoryOptions() { $('#categoryInput').innerHTML = (selectedType === 'income' ? incomeCategories : expenseCategories).map(x => `<option>${x}</option>`).join(''); }
function setTransactionType(type) { selectedType = type; document.querySelectorAll('.type-choice').forEach(x => x.classList.toggle('active', x.dataset.type === type)); updateCategoryOptions(); }
function updateRecurrenceFields() {
  const recurrence = $('#recurrenceInput').value;
  const allowsEndDate = recurrence !== 'once';
  $('#recurrenceEndField').hidden = !allowsEndDate;
}
function openTransactionModal(transaction = null) {
  editingTransactionId = transaction?.recurring ? null : transaction?.id || null;
  editingRecurringId = transaction?.recurring ? transaction.recurringId : null;
  editingPaymentGroupId = transaction?.recurrenceGroupId || null;
  const form = $('#transactionForm');
  if (transaction) {
    $('#transactionModalKicker').textContent = 'UPDATE ENTRY';
    $('#transactionModalTitle').textContent = 'Edit transaction';
    $('#transactionSubmit').textContent = 'Save changes';
    setTransactionType(transaction.type);
    form.elements.description.value = transaction.description;
    form.elements.note.value = transaction.note;
    form.elements.amount.value = transaction.amount;
    form.elements.category.value = transaction.category;
    const schedule = editingPaymentGroupId ? inferPaymentSchedule(paymentGroup(editingPaymentGroupId)) : null;
    if (schedule) editingTransactionId = null;
    form.elements.date.value = transaction.recurring ? transaction.startDate : schedule?.start || transaction.date;
    form.elements.recurrence.value = transaction.recurring && transaction.recurrence === 'custom' ? 'weekly' : transaction.recurring ? transaction.recurrence : schedule?.recurrence || 'once';
    form.elements.recurrenceEnd.value = transaction.recurring?.endDate || schedule?.end || '';
  } else {
    $('#transactionModalKicker').textContent = 'NEW ENTRY';
    $('#transactionModalTitle').textContent = 'Add transaction';
    $('#transactionSubmit').textContent = 'Save transaction';
    form.reset();
    setTransactionType('expense');
    form.elements.date.value = dateKey(new Date());
    form.elements.recurrence.value = 'once';
    form.elements.recurrenceEnd.value = '';
    editingPaymentGroupId = null;
  }
  updateRecurrenceFields();
  $('#recurringManager').hidden = !editingPaymentGroupId;
  $('#transactionModal').showModal();
}
function openBudget() { $('#budgetForm [name="budget"]').value = data.budget; $('#budgetModal').showModal(); }
function openBalanceModal() { $('#balanceForm [name="balance"]').value = currentBalance().toFixed(2); $('#balanceForm [name="note"]').value = ''; $('#balanceModal').showModal(); }

$('#openTransactionModal').addEventListener('click', () => openTransactionModal());
$('#manageRecurringTransactions').addEventListener('click', () => {
  const transaction = paymentGroup(editingPaymentGroupId)[0];
  if (!transaction) return;
  $('#transactionModal').close();
  openRecurringDeleteModal(transaction, false);
});
$('#transactionForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.target);
  const recurrence = form.get('recurrence');
  const startDate = form.get('date');
  if (recurrence !== 'once' && form.get('recurrenceEnd') && form.get('recurrenceEnd') < startDate) {
    window.alert('The repeat end date must be on or after the start date.'); return;
  }
  const transactionValues = { description: form.get('description').trim(), note: form.get('note').trim() || null, category: form.get('category'), amount: Number(form.get('amount')), type: selectedType, transaction_date: form.get('date') };
  const recurringValues = { description: form.get('description').trim(), note: form.get('note').trim() || null, category: form.get('category'), amount: Number(form.get('amount')), type: selectedType, recurrence, start_date: startDate, end_date: form.get('recurrenceEnd') || null, cycle_end_date: null, updated_at: new Date().toISOString() };
  const finiteSchedule = recurrence !== 'once' && Boolean(form.get('recurrenceEnd'));
  let result;
  if (finiteSchedule) {
    const dates = occurrenceDates(recurrence, startDate, form.get('recurrenceEnd'));
    if (!dates.length) { window.alert('No transaction dates fall within this schedule.'); return; }
    if (editingRecurringId) {
      const removal = await db.from('recurring_transactions').delete().eq('id', editingRecurringId);
      if (removal.error) { operationError(removal.error); return; }
    }
    if (editingTransactionId) {
      const removal = await db.from('transactions').delete().eq('id', editingTransactionId);
      if (removal.error) { operationError(removal.error); return; }
    }
    if (editingPaymentGroupId) {
      const oldIds = paymentGroup(editingPaymentGroupId).map(entry => entry.id);
      const removal = await db.from('transactions').delete().in('id', oldIds);
      if (removal.error) { operationError(removal.error); return; }
    }
    const recurrenceGroupId = crypto.randomUUID();
    result = await db.from('transactions').insert(dates.map((transaction_date, index) => ({ user_id: user.id, ...transactionValues, transaction_date, recurrence_group_id: recurrenceGroupId, recurrence_index: index + 1, recurrence_count: dates.length }))).select();
  } else if (recurrence === 'once' && editingPaymentGroupId) {
    const removal = await db.from('transactions').delete().in('id', paymentGroup(editingPaymentGroupId).map(entry => entry.id));
    if (removal.error) { operationError(removal.error); return; }
    result = await db.from('transactions').insert({ user_id: user.id, ...transactionValues }).select().single();
  } else if (recurrence === 'once' && editingRecurringId) {
    const removal = await db.from('recurring_transactions').delete().eq('id', editingRecurringId);
    if (removal.error) { operationError(removal.error); return; }
    result = await db.from('transactions').insert({ user_id: user.id, ...transactionValues }).select().single();
  } else result = recurrence !== 'once'
    ? (editingRecurringId ? await db.from('recurring_transactions').update(recurringValues).eq('id', editingRecurringId).select().single() : await db.from('recurring_transactions').insert({ user_id: user.id, ...recurringValues }).select().single())
    : editingTransactionId
    ? await db.from('transactions').update(transactionValues).eq('id', editingTransactionId).select().single()
    : await db.from('transactions').insert({ user_id: user.id, ...transactionValues }).select().single();
  const { data: row, error } = result;
  if (error) { operationError(error); return; }
  if (finiteSchedule) {
    if (editingRecurringId) data.recurringTransactions = data.recurringTransactions.filter(x => x.id !== editingRecurringId);
    if (editingTransactionId) data.oneOffTransactions = data.oneOffTransactions.filter(x => x.id !== editingTransactionId);
    if (editingPaymentGroupId) data.oneOffTransactions = data.oneOffTransactions.filter(x => x.recurrenceGroupId !== editingPaymentGroupId);
    data.oneOffTransactions.push(...row.map(transactionFromRow));
    transactionPage = 1;
  } else if (recurrence === 'once' && editingPaymentGroupId) {
    data.oneOffTransactions = data.oneOffTransactions.filter(x => x.recurrenceGroupId !== editingPaymentGroupId);
    data.oneOffTransactions.push(transactionFromRow(row));
  } else if (recurrence !== 'once') {
    const updated = recurringFromRow(row);
    if (editingRecurringId) data.recurringTransactions = data.recurringTransactions.map(x => x.id === editingRecurringId ? updated : x);
    else data.recurringTransactions.push(updated);
  } else if (editingRecurringId) {
    data.recurringTransactions = data.recurringTransactions.filter(x => x.id !== editingRecurringId);
    data.oneOffTransactions.push(transactionFromRow(row));
  } else if (editingTransactionId) data.oneOffTransactions = data.oneOffTransactions.map(x => x.id === editingTransactionId ? transactionFromRow(row) : x);
  else { data.oneOffTransactions.push(transactionFromRow(row)); transactionPage = 1; }
  refreshScheduledTransactions(); editingTransactionId = null; editingRecurringId = null; editingPaymentGroupId = null; event.target.reset(); $('#transactionModal').close(); render();
});
document.querySelectorAll('.type-choice').forEach(button => button.addEventListener('click', () => setTransactionType(button.dataset.type)));
$('#recurrenceInput').addEventListener('change', updateRecurrenceFields);
document.querySelectorAll('.metric-detail-trigger').forEach(button => button.addEventListener('click', (event) => {
  event.stopPropagation();
  const opening = button.getAttribute('aria-expanded') !== 'true';
  document.querySelectorAll('.metric-detail-trigger').forEach(item => item.setAttribute('aria-expanded', 'false'));
  button.setAttribute('aria-expanded', String(opening));
}));
document.addEventListener('click', () => document.querySelectorAll('.metric-detail-trigger').forEach(button => button.setAttribute('aria-expanded', 'false')));
$('#editBudget').addEventListener('click', openBudget);
$('#budgetForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const amount = Number(new FormData(event.target).get('budget'));
  const { data: row, error } = await db.from('budgets').upsert({ user_id: user.id, monthly_amount: amount, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('monthly_amount').single();
  if (error) { operationError(error); return; }
  data.budget = Number(row.monthly_amount); $('#budgetModal').close(); render();
});
$('#openBalanceModal').addEventListener('click', openBalanceModal); $('#openBalanceHistoryModal').addEventListener('click', openBalanceModal);
$('#balanceForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.target); const previousBalance = currentBalance(); const newBalance = Number(form.get('balance'));
  const { data: row, error } = await db.from('balance_adjustments').insert({ user_id: user.id, amount: newBalance - previousBalance, previous_balance: previousBalance, new_balance: newBalance, note: form.get('note').trim() || null, adjustment_date: new Date().toISOString().slice(0, 10) }).select().single();
  if (error) { operationError(error); return; }
  data.balanceAdjustments.push(adjustmentFromRow(row)); $('#balanceModal').close(); render();
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
function selectMonth(year, monthIndex) { currentDate = new Date(year, monthIndex, 1); transactionPage = 1; selectedTransactionIds.clear(); render(); }
$('#previousMonth').addEventListener('click', () => selectMonth(currentDate.getFullYear(), currentDate.getMonth() - 1));
$('#nextMonth').addEventListener('click', () => selectMonth(currentDate.getFullYear(), currentDate.getMonth() + 1));
$('#monthLabel').addEventListener('click', () => { const picker = $('#monthPicker'); if (picker.showPicker) picker.showPicker(); else { picker.focus(); picker.click(); } });
$('#monthPicker').addEventListener('change', (event) => { if (!/^\d{4}-\d{2}$/.test(event.target.value)) return; const [year, month] = event.target.value.split('-').map(Number); selectMonth(year, month - 1); });
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
$('#previousTransactionPage').addEventListener('click', () => { transactionPageAnimation = 'previous'; transactionPage -= 1; render(); });
$('#nextTransactionPage').addEventListener('click', () => { transactionPageAnimation = 'next'; transactionPage += 1; render(); });
$('#previousActivityWeek').addEventListener('click', () => { activityWeekStart = plusDays(activityWeekStart, -7); renderChart(data.transactions); });
$('#nextActivityWeek').addEventListener('click', () => { activityWeekStart = plusDays(activityWeekStart, 7); renderChart(data.transactions); });
$('#toggleBulkEdit').addEventListener('click', () => {
  bulkEditMode = !bulkEditMode;
  if (!bulkEditMode) selectedTransactionIds.clear();
  renderTransactions(data.transactions);
});
$('#selectAllTransactions').addEventListener('change', (event) => {
  const newestFirst = getMonthTransactions().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const currentPage = newestFirst.slice((transactionPage - 1) * transactionsPerPage, transactionPage * transactionsPerPage);
  currentPage.forEach(transaction => event.target.checked ? selectedTransactionIds.add(transaction.id) : selectedTransactionIds.delete(transaction.id));
  renderTransactions(data.transactions);
});
$('#clearTransactionSelection').addEventListener('click', () => { selectedTransactionIds.clear(); renderTransactions(data.transactions); });
$('#bulkDeleteTransactions').addEventListener('click', async () => {
  const ids = [...selectedTransactionIds];
  if (!ids.length || !window.confirm(`Delete ${ids.length} selected transaction${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
  const selected = data.transactions.filter(transaction => selectedTransactionIds.has(transaction.id));
  const oneOffIds = selected.filter(transaction => !transaction.recurring).map(transaction => transaction.id);
  const recurringIds = [...new Set(selected.filter(transaction => transaction.recurring).map(transaction => transaction.recurringId))];
  const [oneOffResult, recurringResult] = await Promise.all([
    oneOffIds.length ? db.from('transactions').delete().in('id', oneOffIds) : Promise.resolve({ error: null }),
    recurringIds.length ? db.from('recurring_transactions').delete().in('id', recurringIds) : Promise.resolve({ error: null })
  ]);
  if (oneOffResult.error || recurringResult.error) { operationError(oneOffResult.error || recurringResult.error); return; }
  data.oneOffTransactions = data.oneOffTransactions.filter(transaction => !oneOffIds.includes(transaction.id));
  data.recurringTransactions = data.recurringTransactions.filter(transaction => !recurringIds.includes(transaction.id));
  refreshScheduledTransactions();
  selectedTransactionIds.clear();
  render();
});

$('#recurringDeleteForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ids = [...new FormData(event.target).getAll('payment')];
  if (!ids.length) { window.alert('Select at least one payment to delete.'); return; }
  const { error } = await db.from('transactions').delete().in('id', ids);
  if (error) { operationError(error); return; }
  data.oneOffTransactions = data.oneOffTransactions.filter(entry => !ids.includes(entry.id));
  const remaining = paymentGroup(activeRecurringDeleteGroupId);
  const renumber = await Promise.all(remaining.map((entry, index) => db.from('transactions').update({ recurrence_index: index + 1, recurrence_count: remaining.length }).eq('id', entry.id)));
  const renumberError = renumber.find(result => result.error)?.error;
  if (renumberError) { operationError(renumberError); return; }
  data.oneOffTransactions = data.oneOffTransactions.map(entry => entry.recurrenceGroupId === activeRecurringDeleteGroupId ? { ...entry, paymentNumber: remaining.findIndex(item => item.id === entry.id) + 1, paymentCount: remaining.length } : entry);
  selectedTransactionIds.clear(); activeRecurringDeleteGroupId = null; refreshScheduledTransactions(); $('#recurringDeleteModal').close(); render();
});

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';
  $('#authTitle').textContent = signingUp ? 'Create your private tracker' : 'Sign in to your tracker';
  $('#authCopy').textContent = signingUp ? 'Create an account to keep your financial data private and synced.' : 'Your data is stored privately in your own account.';
  $('#authSubmit').textContent = signingUp ? 'Create account' : 'Sign in';
  $('#authSwitch').textContent = signingUp ? 'Already have an account? Sign in' : 'Need an account? Sign up';
  $('#authMessage').textContent = ''; $('#authMessage').className = 'auth-message';
}

$('#authSwitch').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.target); const email = form.get('email').trim(); const password = form.get('password');
  $('#authSubmit').disabled = true; $('#authMessage').textContent = '';
  const result = authMode === 'signup' ? await db.auth.signUp({ email, password }) : await db.auth.signInWithPassword({ email, password });
  $('#authSubmit').disabled = false;
  if (result.error) { $('#authMessage').textContent = result.error.message; return; }
  if (result.data.session) { user = result.data.session.user; $('#authModal').close(); await loadData(); return; }
  $('#authMessage').textContent = 'Account created. Check your email to confirm it, then sign in.'; $('#authMessage').classList.add('success');
});
async function initialize() {
  const { data: { session }, error } = await db.auth.getSession();
  if (error) { operationError(error); return; }
  if (!session) { window.location.replace('signin.html'); return; }
  const { data: { user: verifiedUser }, error: verificationError } = await db.auth.getUser();
  if (verificationError || !verifiedUser) {
    await db.auth.signOut({ scope: 'local' });
    window.location.replace('signin.html');
    return;
  }
  user = verifiedUser; renderProfile(user); await loadData();
}

db.auth.onAuthStateChange((_event, session) => { if (session && !user) { user = session.user; renderProfile(user); $('#authModal').close(); loadData(); } });
initialize();
