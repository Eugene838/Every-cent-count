const db = window.supabaseClient;

let data = { budget: 0, transactions: [], balanceAdjustments: [] };
let selectedYear = new Date().getFullYear();

const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 }).format(amount);
const transactionFromRow = (row) => ({ amount: Number(row.amount), type: row.type, date: row.transaction_date });
const adjustmentFromRow = (row) => ({ amount: Number(row.amount), date: row.adjustment_date });

async function loadData() {
  const [transactionResult, budgetResult, adjustmentResult] = await Promise.all([
    db.from('transactions').select('amount, type, transaction_date').order('transaction_date', { ascending: false }),
    db.from('budgets').select('monthly_amount').maybeSingle(),
    db.from('balance_adjustments').select('amount, adjustment_date')
  ]);
  const error = transactionResult.error || budgetResult.error || adjustmentResult.error;
  if (error) { window.alert(`Could not load your yearly data. ${error.message}`); return; }
  data = { budget: Number(budgetResult.data?.monthly_amount || 0), transactions: transactionResult.data.map(transactionFromRow), balanceAdjustments: adjustmentResult.data.map(adjustmentFromRow) };
  renderYear();
}

function renderYear() {
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
    const entries = data.transactions.filter(entry => entry.date.startsWith(key));
    const income = entries.filter(entry => entry.type === 'income').reduce((total, entry) => total + entry.amount, 0);
    const spending = entries.filter(entry => entry.type === 'expense').reduce((total, entry) => total + entry.amount, 0);
    const adjustments = data.balanceAdjustments.filter(entry => entry.date.startsWith(key)).reduce((total, entry) => total + entry.amount, 0);
    return { index, income, spending, adjustments, net: income - spending + adjustments };
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
    return `<div class="yearly-row"><span class="month-name">${label}</span><span class="amount income-cell">${money(month.income)}</span><span class="amount spending-cell">${money(month.spending)}</span><span class="amount net-cell ${month.net >= 0 ? 'positive' : 'negative'}">${month.net >= 0 ? '+' : '−'}${money(Math.abs(month.net))}</span><span class="budget-status ${data.budget && month.spending > data.budget ? 'over' : ''}">${budgetStatus}</span></div>`;
  }).join('');
}

$('#previousYear').addEventListener('click', () => { selectedYear -= 1; renderYear(); });
$('#nextYear').addEventListener('click', () => { selectedYear += 1; renderYear(); });
$('#menuButton').addEventListener('click', () => $('.sidebar').classList.toggle('open'));

async function initialize() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.replace('signin.html'); return; }
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) {
    await db.auth.signOut({ scope: 'local' });
    window.location.replace('signin.html');
    return;
  }
  await loadData();
}

initialize();
