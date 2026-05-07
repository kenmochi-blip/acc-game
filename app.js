// ================================================================
// Constants
// ================================================================
const BS_HEIGHT    = 320;   // px fallback if DOM not ready
const PL_HEIGHT    = 240;   // px fallback
const HIGHLIGHT_MS = 2000;  // ms — glow duration per block
const STAGGER_MS   = 550;   // ms — delay between each account animation

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
  prevBalances:    null,
  snapshots:       {},
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
  D.introOverlay        = document.getElementById('intro-overlay');
  D.summaryOverlay      = document.getElementById('summary-overlay');
  D.progressBar         = document.getElementById('progress-bar');
  D.stepCurrent         = document.getElementById('step-current');
  D.stepTotal           = document.getElementById('step-total');
  D.bsTotals            = document.getElementById('bs-totals');
  D.plTotals            = document.getElementById('pl-totals');
  D.phaseBadge          = document.getElementById('panel-phase-badge');
  D.stepTitle           = document.getElementById('panel-step-title');
  D.description         = document.getElementById('panel-description');
  D.changesTbody        = document.getElementById('changes-tbody');
  D.panelChanges        = document.getElementById('panel-changes');
  D.panelExplainSection = document.getElementById('panel-explain-section');
  D.btnExplain          = document.getElementById('btn-explain');
  D.explanation         = document.getElementById('panel-explanation');
  D.btnExecute          = document.getElementById('btn-execute');
  D.btnNext             = document.getElementById('btn-next');
  D.btnPrev             = document.getElementById('btn-prev');
  D.btnStart            = document.getElementById('btn-start');
  D.btnReset            = document.getElementById('btn-reset');
  D.btnReplay           = document.getElementById('btn-replay');
  D.summaryBody         = document.getElementById('summary-body');

  D.stepTotal.textContent = STEPS.length;

  buildChartDOM();
  renderCharts();

  D.btnStart.addEventListener('click', startApp);
  D.btnExecute.addEventListener('click', executeCurrentStep);
  D.btnNext.addEventListener('click', advanceStep);
  D.btnPrev.addEventListener('click', goToPrevStep);
  D.btnReset.addEventListener('click', resetApp);
  D.btnReplay.addEventListener('click', replayHighlight);
  D.btnExplain.addEventListener('click', toggleExplanation);
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

  // Use actual rendered column height for correct proportions
  const bsColEl = document.getElementById('bs-left');
  const plColEl = document.getElementById('pl-left');
  const bsH = (bsColEl && bsColEl.clientHeight) || BS_HEIGHT;
  const plH = (plColEl && plColEl.clientHeight) || PL_HEIGHT;

  COLUMN_KEYS.forEach(colKey => {
    const isBs      = colKey.startsWith('bs');
    const scale     = isBs ? t.bsScale : t.plScale;
    const maxH      = isBs ? bsH : plH;
    const container = document.getElementById(colKey);
    let anyVisible  = false;

    ORDERED[colKey].forEach(([name]) => {
      const el  = container.querySelector('[data-account="' + name + '"]');
      const val = state.balances[name] || 0;
      const h   = Math.max(0, (Math.abs(val) / scale) * maxH);

      el.style.height = h + 'px';
      // Always reserve at least one text-line height when balance is non-zero
      el.style.minHeight = val !== 0 ? '26px' : '0px';
      el.classList.toggle('is-negative', val < 0);

      const inner = el.querySelector('.block-inner');
      const amtEl = el.querySelector('.block-amount');

      if (val !== 0) {
        inner.style.display = 'flex';
        amtEl.textContent = (val < 0 ? '▲' : '') + Math.abs(val) + '万円';
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
// Animation helpers
// ================================================================

// Put 利益剰余金 last in the animation sequence
function sortForAnimation(names) {
  const main = names.filter(n => n !== '利益剰余金');
  if (names.includes('利益剰余金')) main.push('利益剰余金');
  return main;
}

// Apply CSS transition-delay per account so each animates in sequence
function applyStaggeredDelays(sortedNames) {
  sortedNames.forEach((name, i) => {
    const el = document.querySelector('[data-account="' + name + '"]');
    if (el) el.style.transitionDelay = (i * STAGGER_MS) + 'ms';
  });

  // Remove delays once all transitions finish
  const clearAfter = sortedNames.length * STAGGER_MS + 800;
  setTimeout(() => {
    sortedNames.forEach(name => {
      const el = document.querySelector('[data-account="' + name + '"]');
      if (el) el.style.transitionDelay = '';
    });
  }, clearAfter);
}

// Staggered glow highlight — returns total animation duration ms
function highlightBlocksStaggered(names) {
  const sorted = sortForAnimation(names);

  sorted.forEach((name, i) => {
    setTimeout(() => {
      const el = document.querySelector('[data-account="' + name + '"]');
      if (!el) return;
      el.classList.remove('highlighted');
      void el.offsetWidth; // force reflow to restart animation
      el.classList.add('highlighted');
    }, i * STAGGER_MS);
  });

  const totalDuration = HIGHLIGHT_MS + (sorted.length - 1) * STAGGER_MS;
  setTimeout(() => {
    sorted.forEach(name => {
      const el = document.querySelector('[data-account="' + name + '"]');
      if (el) el.classList.remove('highlighted');
    });
  }, totalDuration);

  return totalDuration;
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

  state.currentStep     = id;
  state.stepExecuted    = false;
  state.changedAccounts = [];

  D.stepCurrent.textContent = id;
  D.progressBar.style.width = ((id - 1) / STEPS.length * 100) + '%';
  D.phaseBadge.textContent  = step.phase;
  D.stepTitle.textContent   = '取引' + toCircled(id) + ': ' + step.title;
  D.description.textContent = step.description;

  // Hide changes table and explanation — revealed only after execution
  D.panelChanges.classList.add('hidden');
  D.panelExplainSection.classList.add('hidden');
  D.explanation.classList.add('hidden');
  D.explanation.textContent = '';
  D.btnExplain.textContent  = '解説を見る ▼';

  // Button state
  D.btnExecute.classList.remove('hidden');
  D.btnExecute.disabled = false;
  D.btnNext.classList.add('hidden');
  D.btnReplay.classList.add('hidden');

  // Show prev button only when not at first step
  D.btnPrev.classList.toggle('hidden', id <= 1);
}

function executeCurrentStep() {
  if (state.stepExecuted) return;
  const step = STEPS.find(s => s.id === state.currentStep);
  if (!step) return;

  // Save pre-execution state for replay animation
  state.prevBalances    = {...state.balances};
  state.changedAccounts = [];

  // Apply journal entries
  step.changes.forEach(({ account, delta }) => {
    state.balances[account] = (state.balances[account] || 0) + delta;
    state.changedAccounts.push(account);
  });

  // Sync 利益剰余金 (always animates last)
  const retainedChanged = syncRetainedEarnings();
  if (retainedChanged && !state.changedAccounts.includes('利益剰余金')) {
    state.changedAccounts.push('利益剰余金');
  }

  // Snapshot after this step for back-navigation
  state.snapshots[state.currentStep] = {...state.balances};
  state.stepExecuted = true;

  // Stagger the height transitions, then render all at once
  const sorted = sortForAnimation(state.changedAccounts);
  applyStaggeredDelays(sorted);
  renderCharts();

  // Staggered glow on top of the height animation
  const totalDuration = highlightBlocksStaggered(state.changedAccounts);

  // Reveal changes table
  buildChangesTable(step.changes);
  D.panelChanges.classList.remove('hidden');

  // Reveal explanation toggle (explanation text hidden until user taps)
  D.explanation.textContent = step.explanation;
  D.panelExplainSection.classList.remove('hidden');

  // Swap buttons; hide prev during animation
  D.btnExecute.classList.add('hidden');
  D.btnNext.classList.remove('hidden');
  D.btnPrev.classList.add('hidden');
  D.progressBar.style.width = (state.currentStep / STEPS.length * 100) + '%';

  // After all animations: show replay + prev
  setTimeout(() => {
    D.btnReplay.classList.remove('hidden');
    if (state.currentStep > 1) D.btnPrev.classList.remove('hidden');
  }, totalDuration + 200);
}

function advanceStep() {
  const next = state.currentStep + 1;
  if (next > STEPS.length) showSummary();
  else loadStep(next);
}

function goToPrevStep() {
  const prevId = state.currentStep - 1;
  if (prevId < 1) return;

  // Restore balances to the state before prevId was executed
  state.balances = prevId >= 2
    ? {...state.snapshots[prevId - 1]}
    : makeInitialBalances();

  // Clear any leftover delays, then animate back
  document.querySelectorAll('.account-block').forEach(el => {
    el.style.transitionDelay = '';
  });
  renderCharts();
  loadStep(prevId);
}

function resetApp() {
  state.balances        = makeInitialBalances();
  state.currentStep     = 0;
  state.stepExecuted    = false;
  state.changedAccounts = [];
  state.prevBalances    = null;
  state.snapshots       = {};

  D.summaryOverlay.classList.add('hidden');
  D.progressBar.style.width = '0%';
  D.stepCurrent.textContent = '-';
  D.btnReplay.classList.add('hidden');

  renderCharts();
  loadStep(1);
}

// ================================================================
// Replay: animate from pre-execution state to current state
// ================================================================
function replayHighlight() {
  if (!state.prevBalances || state.changedAccounts.length === 0) return;
  D.btnReplay.classList.add('hidden');
  D.btnPrev.classList.add('hidden');

  const allBlocks   = document.querySelectorAll('.account-block');
  const savedBalances = {...state.balances};

  // 1. Disable transitions, snap to previous state instantly
  allBlocks.forEach(el => {
    el.style.transition      = 'none';
    el.style.transitionDelay = '';
  });
  state.balances = {...state.prevBalances};
  renderCharts();

  // 2. Two rAF to flush styles, then re-enable and animate forward
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      allBlocks.forEach(el => { el.style.transition = ''; });
      state.balances = savedBalances;

      const sorted = sortForAnimation(state.changedAccounts);
      applyStaggeredDelays(sorted);
      renderCharts();
      const totalDuration = highlightBlocksStaggered(state.changedAccounts);

      setTimeout(() => {
        D.btnReplay.classList.remove('hidden');
        if (state.currentStep > 1) D.btnPrev.classList.remove('hidden');
      }, totalDuration + 200);
    });
  });
}

// ================================================================
// Explanation toggle
// ================================================================
function toggleExplanation() {
  const isHidden = D.explanation.classList.contains('hidden');
  D.explanation.classList.toggle('hidden', !isHidden);
  D.btnExplain.textContent = isHidden ? '解説を閉じる ▲' : '解説を見る ▼';
}

// ================================================================
// Changes table (shown after execution with final balances)
// ================================================================
function buildChangesTable(changes) {
  D.changesTbody.innerHTML = '';
  changes.forEach(({ account, delta }) => {
    const meta    = ACCOUNTS[account];
    const balance = state.balances[account] || 0;
    const sign    = delta > 0 ? '+' : '';
    const cls     = delta > 0 ? 'pos' : 'neg';

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="acct-chip" style="background:' + meta.color + '">' + account + '</span></td>' +
      '<td><span class="cat-tag">' + meta.category + '</span></td>' +
      '<td class="delta-cell ' + cls + '">' + sign + delta + '万円' +
        '<span class="after-balance">→ ' + balance + '万円</span>' +
      '</td>';
    D.changesTbody.appendChild(tr);
  });
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
