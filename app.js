const db = window.supabaseClient;

const categoryInfo = {
  Food: { icon: '⌑', color: '#f7e4cb' }, Transport: { icon: '↝', color: '#dcebee' }, Shopping: { icon: '♢', color: '#eee3f1' },
  Home: { icon: '⌂', color: '#dcebdc' }, Entertainment: { icon: '◉', color: '#f3dde0' }, Health: { icon: '✚', color: '#f4ebc8' },
  Salary: { icon: '↙', color: '#dcebdc' }, Freelance: { icon: '✧', color: '#dcebee' }, Capital: { icon: '◈', color: '#f4ebc8' }, Other: { icon: '•', color: '#e8e9e4' }
};
const expenseCategories = ['Food', 'Transport', 'Shopping', 'Home', 'Entertainment', 'Health', 'Other'];
const incomeCategories = ['Salary', 'Freelance', 'Capital', 'Other'];
const emptyData = () => ({ budget: 0, transactions: [], balanceAdjustments: [] });
let data = emptyData();
let currentDate = new Date();
currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let selectedType = 'expense';
let authMode = 'signin';
let user = null;

const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 }).format(amount);
const shortMoney = (amount) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(amount);
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const dateLabel = (date) => new Intl.DateTimeFormat('en-SG', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00`));
const getMonthTransactions = () => data.transactions.filter((entry) => entry.date.startsWith(monthKey(currentDate)));
const currentBalance = () => data.transactions.reduce((total, entry) => total + (entry.type === 'income' ? entry.amount : -entry.amount), 0) + data.balanceAdjustments.reduce((total, entry) => total + entry.amount, 0);
const icon = (category) => { const item = categoryInfo[category] || categoryInfo.Other; return `<span class="category-icon" style="background:${item.color}">${item.icon}</span>`; };
const transactionFromRow = (row) => ({ id: row.id, description: row.description, category: row.category, amount: Number(row.amount), type: row.type, date: row.transaction_date });
const adjustmentFromRow = (row) => ({ id: row.id, amount: Number(row.amount), previousBalance: Number(row.previous_balance), newBalance: Number(row.new_balance), note: row.note, date: row.adjustment_date, createdAt: row.created_at });

function operationError(error) {
  console.error(error);
  window.alert(`Could not save your change. ${error.message || 'Please try again.'}`);
}

async function loadData() {
  const [transactionResult, budgetResult, adjustmentResult] = await Promise.all([
    db.from('transactions').select('*').order('transaction_date', { ascending: false }),
    db.from('budgets').select('monthly_amount').maybeSingle(),
    db.from('balance_adjustments').select('*').order('created_at', { ascending: true })
  ]);
  const error = transactionResult.error || budgetResult.error || adjustmentResult.error;
  if (error) { operationError(error); return; }
  data = {
    budget: Number(budgetResult.data?.monthly_amount || 0),
    transactions: transactionResult.data.map(transactionFromRow),
    balanceAdjustments: adjustmentResult.data.map(adjustmentFromRow)
  };
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
  $('#monthLabel').innerHTML = `${monthName} <span>⌄</span>`;
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
  renderCategories(transactions); renderTransactions(transactions); renderChart(transactions); renderInsight(spending, income, used); renderBalanceHistory();
}

function renderCategories(transactions) {
  const totals = {};
  transactions.filter(x => x.type === 'expense').forEach(x => { totals[x.category] = (totals[x.category] || 0) + x.amount; });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('#categoryList').innerHTML = entries.length ? entries.map(([category, total]) => `<div class="category">${icon(category)}<div class="category-title"><strong>${category}</strong><small>${Math.round((total / Math.max(1, Object.values(totals).reduce((a,b) => a+b, 0))) * 100)}% of spending</small></div><span class="category-amount">${money(total)}</span></div>`).join('') : '<div class="empty-state">Your categories will appear here.</div>';
}

function renderTransactions(transactions) {
  const list = $('#transactionList');
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  list.innerHTML = recent.map(x => `<div class="transaction-row"><div class="transaction-name">${icon(x.category)}<span>${x.description}</span></div><span class="transaction-category">${x.category}</span><span class="transaction-date">${dateLabel(x.date)}</span><span class="transaction-amount ${x.type}">${x.type === 'income' ? '+' : '−'}${money(x.amount)} <button class="delete-transaction" data-id="${x.id}" aria-label="Delete ${x.description}">×</button></span></div>`).join('');
  $('#emptyState').hidden = Boolean(recent.length);
  list.querySelectorAll('.delete-transaction').forEach(button => button.addEventListener('click', async () => {
    const { error } = await db.from('transactions').delete().eq('id', button.dataset.id);
    if (error) { operationError(error); return; }
    data.transactions = data.transactions.filter(x => x.id !== button.dataset.id);
    render();
  }));
}

function renderChart(transactions) {
  const weekly = Array(7).fill(0); const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  transactions.filter(x => x.type === 'expense').forEach(x => { const day = new Date(`${x.date}T00:00:00`).getDay(); weekly[(day + 6) % 7] += x.amount; });
  const max = Math.max(...weekly, 1);
  $('#barChart').innerHTML = weekly.map((value, index) => `<div class="bar ${index === 5 ? 'current' : ''}" data-value="${money(value)}" style="height:${Math.max(5, (value / max) * 100)}%"></div>`).join('');
  const spend = weekly.reduce((a, b) => a + b, 0); $('#averageSpend').textContent = shortMoney(spend / Math.max(daysInMonth, 1));
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
function openBudget() { $('#budgetForm [name="budget"]').value = data.budget; $('#budgetModal').showModal(); }
function openBalanceModal() { $('#balanceForm [name="balance"]').value = currentBalance().toFixed(2); $('#balanceForm [name="note"]').value = ''; $('#balanceModal').showModal(); }

$('#openTransactionModal').addEventListener('click', () => { $('#dateInput').value = `${monthKey(currentDate)}-01`; updateCategoryOptions(); $('#transactionModal').showModal(); });
$('#transactionForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.target);
  const { data: row, error } = await db.from('transactions').insert({ user_id: user.id, description: form.get('description').trim(), category: form.get('category'), amount: Number(form.get('amount')), type: selectedType, transaction_date: form.get('date') }).select().single();
  if (error) { operationError(error); return; }
  data.transactions.push(transactionFromRow(row)); event.target.reset(); $('#transactionModal').close(); render();
});
document.querySelectorAll('.type-choice').forEach(button => button.addEventListener('click', () => { selectedType = button.dataset.type; document.querySelectorAll('.type-choice').forEach(x => x.classList.toggle('active', x === button)); updateCategoryOptions(); }));
$('#editBudget').addEventListener('click', openBudget); $('#budgetButton').addEventListener('click', openBudget);
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
$('#previousMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); render(); });
$('#nextMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); render(); });
$('#menuButton').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#viewAll').addEventListener('click', () => document.querySelector('#transactions').scrollIntoView({ behavior: 'smooth' }));

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
  user = verifiedUser; await loadData();
}

db.auth.onAuthStateChange((_event, session) => { if (session && !user) { user = session.user; $('#authModal').close(); loadData(); } });
initialize();
