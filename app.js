// ================================================================
// Constants
// ================================================================
const BS_HEIGHT        = 300;   // px — height of BS chart columns
const PL_HEIGHT        = 220;   // px — height of PL chart columns
const HIGHLIGHT_MS     = 2500;  // ms — highlight glow duration
const MIN_LABEL_PX     = 26;    // px — minimum height to show text inside a block

// ================================================================
// State
// ================================================================
function makeInitialBalances() {
  return Object.fromEntries(Object.keys(ACCOUNTS).map(k => [k, 0]));
}

let state = {
  currentStep:   0,
  stepExecuted:  false,
  changedAccounts: [],
  balances:      makeInitialBalances(),
};

// ================================================================
// Ordered account list per column (computed once from ACCOUNTS)
// ================================================================
const COLUMN_KEYS = ['bs-left', 'bs-right', 'pl-left', 'pl-right'];

function getColumnAccounts(colKey) {
  const [section, side] = colKey.split('-');
  const categoryOrder = CATEGORY_ORDER[colKey];
  const all = Object.entries(ACCOUNTS)
    .filter(([, m]) => m.section === section && m.side === side)
    .sort((a, b) => a[1].order - b[1].order);

  // Sort by category order, then by 'order' within category
  return all.sort(([, a], [, b]) => {
    const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    return catDiff !== 0 ? catDiff : a.order - b.order;
  });
}

const ORDERED_ACCOUNTS = Object.fromEntries(
  COLUMN_KEYS.map(k => [k, getColumnAccounts(k)])
);

// ================================================================
// DOM References
// ================================================================
let D = {};

document.addEventListener('DOMContentLoaded', () => {
  D.introOverlay   = document.getElementById('intro-overlay');
  D.summaryOverlay = document.getElementById('summary-overlay');
  D.progressBar    = document.getElementById('progress-bar');
  D.stepCurrent    = document.getElementById('step-current');
  D.stepTotal      = document.getElementById('step-total');
  D.bsTotals       = document.getElementById('bs-totals');
  D.plTotals       = document.getElementById('pl-totals');
  D.phaseBadge     = document.getElementById('panel-phase-badge');
  D.stepTitle      = document.getElementById('panel-step-title');
  D.description    = document.getElementById('panel-description');
  D.changesTbody   = document.getElementById('changes-tbody');
  D.explanation    = document.getElementById('panel-explanation');
  D.btnExecute     = document.getElementById('btn-execute');
  D.btnNext        = document.getElementById('btn-next');
  D.btnStart       = document.getElementById('btn-start');
  D.btnReset       = document.getElementById('btn-reset');
  D.summaryBody    = document.getElementById('summary-body');

  D.stepTotal.textContent = STEPS.length;

  buildChartDOM();
  renderCharts();

  D.btnStart.addEventListener('click', startApp);
  D.btnExecute.addEventListener('click', executeCurrentStep);
  D.btnNext.addEventListener('click', advanceStep);
  D.btnReset.addEventListener('click', resetApp);
});

// ================================================================
// Build chart DOM  (runs once on load)
// ================================================================
function buildChartDOM() {
  COLUMN_KEYS.forEach(colKey => {
    const container = document.getElementById(colKey);
    const accounts  = ORDERED_ACCOUNTS[colKey];
    let prevCategory = null;

    accounts.forEach(([name, meta]) => {
      const isCatStart = meta.category !== prevCategory;
      prevCategory = meta.category;

      const block = document.createElement('div');
      block.className = 'account-block' + (isCatStart ? ' cat-start' : '');
      block.dataset.account = name;
      block.style.backgroundColor = meta.color;
      block.style.height = '0px';

      block.innerHTML =
        '<div class="block-inner">' +
          '<span class="block-name">' + name + '</span>' +
          '<span class="block-amount"></span>' +
        '</div>';

      container.appendChild(block);
    });
  });
}

// ================================================================
// Compute column totals
// ================================================================
function computeTotals() {
  const sum = (names) => names.reduce((s, n) => s + (state.balances[n] || 0), 0);

  const bsLeftNames  = ORDERED_ACCOUNTS['bs-left'].map(([n]) => n);
  const bsRightNames = ORDERED_ACCOUNTS['bs-right'].map(([n]) => n);
  const plLeftNames  = ORDERED_ACCOUNTS['pl-left'].map(([n]) => n);
  const plRightNames = ORDERED_ACCOUNTS['pl-right'].map(([n]) => n);

  const bsLeft  = sum(bsLeftNames);
  // For BS right scale: use positive balances only (negative 利益剰余金 reduces total)
  const bsRight = bsRightNames.reduce((s, n) => s + (state.balances[n] || 0), 0);

  return {
    bsLeft,
    bsRight,
    plLeft:  sum(plLeftNames),
    plRight: sum(plRightNames),
    // scale references
    bsScale: Math.max(bsLeft, Math.abs(bsRight), 1),
    plScale: Math.max(sum(plLeftNames), sum(plRightNames), 1),
  };
}

// ================================================================
// Render charts
// ================================================================
function renderCharts() {
  const t = computeTotals();

  COLUMN_KEYS.forEach(colKey => {
    const section = colKey.startsWith('bs') ? 'bs' : 'pl';
    const scale   = section === 'bs' ? t.bsScale : t.plScale;
    const maxH    = section === 'bs' ? BS_HEIGHT  : PL_HEIGHT;
    const accounts = ORDERED_ACCOUNTS[colKey];
    const container = document.getElementById(colKey);

    let anyVisible = false;

    accounts.forEach(([name]) => {
      const el  = container.querySelector('[data-account="' + name + '"]');
      const val = state.balances[name] || 0;
      const h   = Math.max(0, (Math.abs(val) / scale) * maxH);

      el.style.height = h + 'px';

      // Toggle negative class
      el.classList.toggle('is-negative', val < 0);

      // Show/hide inner label
      const inner  = el.querySelector('.block-inner');
      const amtEl  = el.querySelector('.block-amount');

      if (h >= MIN_LABEL_PX) {
        inner.style.display = 'flex';
        if (val !== 0) {
          const prefix = val < 0 ? '▲' : '';
          amtEl.textContent = prefix + Math.abs(val) + '万円';
        } else {
          amtEl.textContent = '';
        }
        anyVisible = true;
      } else {
        inner.style.display = 'none';
      }
    });

    container.classList.toggle('is-empty', !anyVisible);
    if (!anyVisible) {
      const side = colKey.endsWith('left') ? '左' : '右';
      container.dataset.emptyLabel = '（まだ取引がありません）';
    }
  });

  updateTotalBadges(t);
}

function updateTotalBadges(t) {
  // BS
  if (t.bsLeft > 0) {
    D.bsTotals.textContent = '資産合計: ' + t.bsLeft + '万円';
  } else {
    D.bsTotals.textContent = '';
  }

  // PL
  const net = t.plRight - t.plLeft;
  if (t.plRight > 0 || t.plLeft > 0) {
    const sign  = net >= 0 ? '黒字' : '赤字';
    const abs   = Math.abs(net);
    const prefix = net < 0 ? '▲' : '';
    D.plTotals.innerHTML =
      '当期純利益: <span class="' + (net >= 0 ? 'profit' : 'loss') + '">' +
      prefix + abs + '万円（' + sign + '）</span>';
  } else {
    D.plTotals.textContent = '';
  }
}

// ================================================================
// Auto-recalculate 利益剰余金 to keep BS balanced
// (retained earnings = revenue - expenses, always)
// ================================================================
function syncRetainedEarnings() {
  const plLeft  = ORDERED_ACCOUNTS['pl-left'].map(([n]) => n);
  const plRight = ORDERED_ACCOUNTS['pl-right'].map(([n]) => n);
  const revenue  = plRight.reduce((s, n) => s + (state.balances[n] || 0), 0);
  const expenses = plLeft.reduce((s, n) => s + (state.balances[n] || 0), 0);
  const net = revenue - expenses;
  const prev = state.balances['利益剰余金'];
  state.balances['利益剰余金'] = net;
  return prev !== net; // returns true if changed
}

// ================================================================
// App lifecycle
// ================================================================
function startApp() {
  D.introOverlay.classList.add('hidden');
  loadStep(1);
}

function loadStep(id) {
  const step = STEPS.find(s => s.id === id);
  if (!step) { showSummary(); return; }

  state.currentStep  = id;
  state.stepExecuted = false;
  state.changedAccounts = [];

  // Header
  D.stepCurrent.textContent = id;
  D.progressBar.style.width = ((id - 1) / STEPS.length * 100) + '%';

  // Panel
  D.phaseBadge.textContent = step.phase;
  D.stepTitle.textContent  = '取引' + toCircled(id) + ': ' + step.title;
  D.description.textContent = step.description;

  buildChangesTable(step.changes, false);

  D.explanation.classList.add('hidden');
  D.explanation.textContent = '';

  D.btnExecute.classList.remove('hidden');
  D.btnExecute.disabled = false;
  D.btnNext.classList.add('hidden');
}

function executeCurrentStep() {
  if (state.stepExecuted) return;
  const step = STEPS.find(s => s.id === state.currentStep);
  if (!step) return;

  state.changedAccounts = [];

  step.changes.forEach(({ account, delta }) => {
    state.balances[account] = (state.balances[account] || 0) + delta;
    state.changedAccounts.push(account);
  });

  const retainedChanged = syncRetainedEarnings();
  if (retainedChanged && !state.changedAccounts.includes('利益剰余金')) {
    state.changedAccounts.push('利益剰余金');
  }

  state.stepExecuted = true;

  renderCharts();
  highlightBlocks(state.changedAccounts);
  buildChangesTable(step.changes, true);
  showExplanation(step.explanation);

  D.btnExecute.classList.add('hidden');
  D.btnNext.classList.remove('hidden');
  D.progressBar.style.width = (state.currentStep / STEPS.length * 100) + '%';
}

function advanceStep() {
  const next = state.currentStep + 1;
  if (next > STEPS.length) {
    showSummary();
  } else {
    loadStep(next);
  }
}

function resetApp() {
  state.balances = makeInitialBalances();
  state.currentStep = 0;
  state.stepExecuted = false;
  state.changedAccounts = [];

  D.summaryOverlay.classList.add('hidden');
  D.progressBar.style.width = '0%';
  D.stepCurrent.textContent = '-';

  renderCharts();
  loadStep(1);
}

// ================================================================
// Highlight animation
// ================================================================
function highlightBlocks(names) {
  names.forEach(name => {
    const el = document.querySelector('[data-account="' + name + '"]');
    if (!el) return;
    el.classList.remove('highlighted');
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add('highlighted');
  });

  setTimeout(() => {
    names.forEach(name => {
      const el = document.querySelector('[data-account="' + name + '"]');
      if (el) el.classList.remove('highlighted');
    });
  }, HIGHLIGHT_MS);
}

// ================================================================
// Changes table
// ================================================================
function buildChangesTable(changes, executed) {
  D.changesTbody.innerHTML = '';
  changes.forEach(({ account, delta }) => {
    const meta    = ACCOUNTS[account];
    const balance = state.balances[account] || 0;
    const sign    = delta > 0 ? '+' : '';
    const posNeg  = delta > 0 ? 'pos' : 'neg';
    const afterHtml = executed
      ? '<span class="after-balance">→ ' + balance + '万円</span>'
      : '';

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="acct-chip" style="background:' + meta.color + '">' + account + '</span></td>' +
      '<td><span class="cat-tag">' + meta.category + '</span></td>' +
      '<td class="delta-cell ' + posNeg + '">' + sign + delta + '万円' + afterHtml + '</td>';

    D.changesTbody.appendChild(tr);
  });
}

// ================================================================
// Explanation box
// ================================================================
function showExplanation(text) {
  D.explanation.textContent = text;
  D.explanation.classList.remove('hidden');
}

// ================================================================
// Summary screen
// ================================================================
function showSummary() {
  const t   = computeTotals();
  const net = t.plRight - t.plLeft;
  const signCls  = net >= 0 ? 'profit-text' : 'loss-text';
  const signWord = net >= 0 ? '黒字' : '赤字';
  const prefix   = net < 0 ? '▲' : '';

  D.summaryBody.innerHTML =
    '<div class="summary-item"><span>総資産</span><strong>' + t.bsLeft + '万円</strong></div>' +
    '<div class="summary-item"><span>当期純利益</span>' +
    '<strong class="' + signCls + '">' + prefix + Math.abs(net) + '万円（' + signWord + '）</strong></div>';

  D.summaryOverlay.classList.remove('hidden');
}

// ================================================================
// Utilities
// ================================================================
function toCircled(n) {
  const chars = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮'];
  return chars[n - 1] || String(n);
}
