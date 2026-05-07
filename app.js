// ================================================================
// Constants
// ================================================================
const BS_HEIGHT    = 320;   // px — height of BS chart columns
const PL_HEIGHT    = 240;   // px — height of PL chart columns
const HIGHLIGHT_MS = 2500;  // ms — highlight glow duration
const MIN_LABEL_PX = 26;    // px — minimum block height to show label

// ================================================================
// State
// ================================================================
function makeInitialBalances() {
  return Object.fromEntries(Object.keys(ACCOUNTS).map(k => [k, 0]));
}

let state = {
  currentStep:     0,
  stepExecuted:    false,
  changedAccounts: [],
  balances:        makeInitialBalances(),
};

// ================================================================
// Ordered account list per column (computed once)
// ================================================================
const COLUMN_KEYS = ['bs-left', 'bs-right', 'pl-left', 'pl-right'];

function getColumnAccounts(colKey) {
  const [section, side] = colKey.split('-');
  const catOrder = CATEGORY_ORDER[colKey];
  return Object.entries(ACCOUNTS)
    .filter(([, m]) => m.section === section && m.side === side)
    .sort(([, a], [, b]) => {
      const cd = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
      return cd !== 0 ? cd : a.order - b.order;
    });
}

const ORDERED = Object.fromEntries(COLUMN_KEYS.map(k => [k, getColumnAccounts(k)]));

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
  D.btnReplay      = document.getElementById('btn-replay');
  D.summaryBody    = document.getElementById('summary-body');

  D.stepTotal.textContent = STEPS.length;

  buildChartDOM();
  renderCharts();

  D.btnStart.addEventListener('click', startApp);
  D.btnExecute.addEventListener('click', executeCurrentStep);
  D.btnNext.addEventListener('click', advanceStep);
  D.btnReset.addEventListener('click', resetApp);
  D.btnReplay.addEventListener('click', replayHighlight);
});

// ================================================================
// Build chart DOM (once)
// ================================================================
function buildChartDOM() {
  COLUMN_KEYS.forEach(colKey => {
    const container = document.getElementById(colKey);
    let prevCat = null;
    ORDERED[colKey].forEach(([name, meta]) => {
      const isCatStart = meta.category !== prevCat;
      prevCat = meta.category;

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
// Compute totals
// ================================================================
function computeTotals() {
  const sum = ns => ns.reduce((s, n) => s + (state.balances[n] || 0), 0);
  const bsL = ORDERED['bs-left'].map(([n]) => n);
  const bsR = ORDERED['bs-right'].map(([n]) => n);
  const plL = ORDERED['pl-left'].map(([n]) => n);
  const plR = ORDERED['pl-right'].map(([n]) => n);

  const bsLeft  = sum(bsL);
  const bsRight = bsR.reduce((s, n) => s + (state.balances[n] || 0), 0);

  return {
    bsLeft, bsRight,
    plLeft:  sum(plL),
    plRight: sum(plR),
    bsScale: Math.max(bsLeft, Math.abs(bsRight), 1),
    plScale: Math.max(sum(plL), sum(plR), 1),
  };
}

// ================================================================
// Render charts
// ================================================================
function renderCharts() {
  const t = computeTotals();

  COLUMN_KEYS.forEach(colKey => {
    const isBs     = colKey.startsWith('bs');
    const scale    = isBs ? t.bsScale : t.plScale;
    const maxH     = isBs ? BS_HEIGHT  : PL_HEIGHT;
    const container = document.getElementById(colKey);
    let anyVisible  = false;

    ORDERED[colKey].forEach(([name]) => {
      const el  = container.querySelector('[data-account="' + name + '"]');
      const val = state.balances[name] || 0;
      const h   = Math.max(0, (Math.abs(val) / scale) * maxH);

      el.style.height = h + 'px';
      el.classList.toggle('is-negative', val < 0);

      const inner = el.querySelector('.block-inner');
      const amtEl = el.querySelector('.block-amount');

      if (h >= MIN_LABEL_PX) {
        inner.style.display = 'flex';
        amtEl.textContent = val !== 0
          ? (val < 0 ? '▲' : '') + Math.abs(val) + '万円'
          : '';
        anyVisible = true;
      } else {
        inner.style.display = 'none';
      }
    });

    container.classList.toggle('is-empty', !anyVisible);
    if (!anyVisible) container.dataset.emptyLabel = '（まだ取引がありません）';
  });

  updateTotalBadges(t);
}

function updateTotalBadges(t) {
  D.bsTotals.textContent = t.bsLeft > 0 ? '資産合計: ' + t.bsLeft + '万円' : '';

  const net = t.plRight - t.plLeft;
  if (t.plRight > 0 || t.plLeft > 0) {
    const cls = net >= 0 ? 'profit' : 'loss';
    const word = net >= 0 ? '黒字' : '赤字';
    const pre  = net < 0 ? '▲' : '';
    D.plTotals.innerHTML =
      '当期純利益: <span class="' + cls + '">' + pre + Math.abs(net) + '万円（' + word + '）</span>';
  } else {
    D.plTotals.textContent = '';
  }
}

// ================================================================
// Sync 利益剰余金 to keep BS balanced
// ================================================================
function syncRetainedEarnings() {
  const rev = ORDERED['pl-right'].reduce((s, [n]) => s + (state.balances[n] || 0), 0);
  const exp = ORDERED['pl-left'].reduce((s, [n]) => s + (state.balances[n] || 0), 0);
  const net  = rev - exp;
  const prev = state.balances['利益剰余金'];
  state.balances['利益剰余金'] = net;
  return prev !== net;
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

  D.stepCurrent.textContent  = id;
  D.progressBar.style.width  = ((id - 1) / STEPS.length * 100) + '%';
  D.phaseBadge.textContent   = step.phase;
  D.stepTitle.textContent    = '取引' + toCircled(id) + ': ' + step.title;
  D.description.textContent  = step.description;

  buildChangesTable(step.changes, false);

  D.explanation.classList.add('hidden');
  D.explanation.textContent = '';

  D.btnExecute.classList.remove('hidden');
  D.btnExecute.disabled = false;
  D.btnNext.classList.add('hidden');
  D.btnReplay.classList.add('hidden');  // 新ステップ開始時は非表示
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

  // ハイライト終了後に「もう一度見る」を表示
  setTimeout(() => {
    D.btnReplay.classList.remove('hidden');
  }, HIGHLIGHT_MS + 200);
}

function advanceStep() {
  const next = state.currentStep + 1;
  if (next > STEPS.length) showSummary();
  else loadStep(next);
}

function resetApp() {
  state.balances = makeInitialBalances();
  state.currentStep = 0;
  state.stepExecuted = false;
  state.changedAccounts = [];

  D.summaryOverlay.classList.add('hidden');
  D.progressBar.style.width = '0%';
  D.stepCurrent.textContent = '-';
  D.btnReplay.classList.add('hidden');

  renderCharts();
  loadStep(1);
}

// ================================================================
// Replay highlight  ← 「もう一度見る」ボタンの処理
// ================================================================
function replayHighlight() {
  if (state.changedAccounts.length === 0) return;
  D.btnReplay.classList.add('hidden');
  highlightBlocks(state.changedAccounts);
  // アニメーション終了後に再表示
  setTimeout(() => {
    D.btnReplay.classList.remove('hidden');
  }, HIGHLIGHT_MS + 200);
}

// ================================================================
// Highlight animation
// ================================================================
function highlightBlocks(names) {
  names.forEach(name => {
    const el = document.querySelector('[data-account="' + name + '"]');
    if (!el) return;
    el.classList.remove('highlighted');
    void el.offsetWidth; // force reflow
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
    const cls     = delta > 0 ? 'pos' : 'neg';
    const after   = executed
      ? '<span class="after-balance">→ ' + balance + '万円</span>'
      : '';

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="acct-chip" style="background:' + meta.color + '">' + account + '</span></td>' +
      '<td><span class="cat-tag">' + meta.category + '</span></td>' +
      '<td class="delta-cell ' + cls + '">' + sign + delta + '万円' + after + '</td>';
    D.changesTbody.appendChild(tr);
  });
}

// ================================================================
// Explanation
// ================================================================
function showExplanation(text) {
  D.explanation.textContent = text;
  D.explanation.classList.remove('hidden');
}

// ================================================================
// Summary
// ================================================================
function showSummary() {
  const t   = computeTotals();
  const net = t.plRight - t.plLeft;
  const cls  = net >= 0 ? 'profit-text' : 'loss-text';
  const word = net >= 0 ? '黒字' : '赤字';
  const pre  = net < 0 ? '▲' : '';

  D.summaryBody.innerHTML =
    '<div class="summary-item"><span>総資産</span><strong>' + t.bsLeft + '万円</strong></div>' +
    '<div class="summary-item"><span>当期純利益</span>' +
    '<strong class="' + cls + '">' + pre + Math.abs(net) + '万円（' + word + '）</strong></div>';

  D.summaryOverlay.classList.remove('hidden');
}

// ================================================================
// Utility
// ================================================================
function toCircled(n) {
  const c = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮'];
  return c[n - 1] || String(n);
}
