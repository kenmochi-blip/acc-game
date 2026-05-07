// ================================================================
// Constants
// ================================================================
const BS_HEIGHT    = 320;  // px fallback if DOM not ready
const PL_HEIGHT    = 240;  // px fallback
const HIGHLIGHT_MS = 2000; // ms — glow duration per block
const STAGGER_MS   = 550;  // ms — delay between each account animation
const MIN_BLOCK_PX = 26;   // px — minimum height for non-zero balance blocks

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
  snapshots:       {},   // id → balances (after step executed)
  stepSnapshots:   {},   // id → { balances, changedAccounts, prevBalances }
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
// Compute totals (always from state.balances)
// ================================================================
function computeTotals() {
  const sum = ns => ns.reduce((s, n) => s + (state.balances[n] || 0), 0);
  const bsL = ORDERED['bs-left'].map(([n]) => n);
  const bsR = ORDERED['bs-right'].map(([n]) => n);
  const plL = ORDERED['pl-left'].map(([n]) => n);
  const plR = ORDERED['pl-right'].map(([n]) => n);

  const bsLeft  = sum(bsL);
  const bsRight = Math.abs(bsR.reduce((s, n) => s + (state.balances[n] || 0), 0));

  return {
    bsLeft, bsRight,
    plLeft:  sum(plL),
    plRight: sum(plR),
    bsScale: Math.max(bsLeft, bsRight, 1),
    plScale: Math.max(sum(plL), sum(plR), 1),
  };
}

// ================================================================
// Compute block heights for one column, ensuring small non-zero
// balances get minimum visibility without overflowing the container.
// ================================================================
function computeBlockHeights(colKey, scale, maxH) {
  const entries = ORDERED[colKey].map(([name]) => {
    const val  = state.balances[name] || 0;
    const rawH = val !== 0 ? Math.max(0, (Math.abs(val) / scale) * maxH) : 0;
    return { name, val, rawH };
  });

  // Split into blocks that need a minimum-height boost vs. normal blocks
  const boostedEntries = entries.filter(e => e.val !== 0 && e.rawH < MIN_BLOCK_PX);

  // No small accounts → use raw proportional heights directly.
  // This preserves the PL left/right height difference (profit vs. loss),
  // and ensures the scale-normalization animation trick works correctly.
  if (boostedEntries.length === 0) {
    const result = {};
    entries.forEach(e => { result[e.name] = e.rawH; });
    return result;
  }

  // Small non-zero accounts need boosting; scale large accounts down to fit.
  const normalEntries = entries.filter(e => e.val === 0 || e.rawH >= MIN_BLOCK_PX);
  const boostedTotal  = boostedEntries.length * MIN_BLOCK_PX;
  const normalRawSum  = normalEntries.reduce((s, e) => s + e.rawH, 0);
  const availableH    = Math.max(0, maxH - boostedTotal);
  const scaleFactor   = normalRawSum > 0 ? availableH / normalRawSum : 1;

  const boostedSet = new Set(boostedEntries.map(e => e.name));
  const result = {};
  entries.forEach(e => {
    if (e.val === 0)          result[e.name] = 0;
    else if (boostedSet.has(e.name)) result[e.name] = MIN_BLOCK_PX;
    else                      result[e.name] = e.rawH * scaleFactor;
  });
  return result;
}

// ================================================================
// Core render: draws chart using state.balances and the provided
// totals (scale). Pass updateBadges=false during pre-animation setup.
// ================================================================
function renderChartsWithTotals(t, updateBadges) {
  const bsColEl = document.getElementById('bs-left');
  const plColEl = document.getElementById('pl-left');
  const bsH = (bsColEl && bsColEl.clientHeight) || BS_HEIGHT;
  const plH = (plColEl && plColEl.clientHeight) || PL_HEIGHT;

  COLUMN_KEYS.forEach(colKey => {
    const isBs      = colKey.startsWith('bs');
    const scale     = isBs ? t.bsScale : t.plScale;
    const maxH      = isBs ? bsH : plH;
    const container = document.getElementById(colKey);

    const heights  = computeBlockHeights(colKey, scale, maxH);
    let anyVisible = false;

    ORDERED[colKey].forEach(([name]) => {
      const el  = container.querySelector('[data-account="' + name + '"]');
      const val = state.balances[name] || 0;
      const h   = heights[name];

      el.style.height    = h + 'px';
      el.style.minHeight = '0px'; // managed by computeBlockHeights, not CSS
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

  if (updateBadges !== false) updateTotalBadges(t);
}

function renderCharts() {
  const t = computeTotals();
  renderChartsWithTotals(t, true);
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
  const rev  = ORDERED['pl-right'].reduce((s, [n]) => s + (state.balances[n] || 0), 0);
  const exp  = ORDERED['pl-left'].reduce((s, [n]) => s + (state.balances[n] || 0), 0);
  const net  = rev - exp;
  const prev = state.balances['利益剰余金'];
  state.balances['利益剰余金'] = net;
  return prev !== net;
}

// ================================================================
// Animation helpers
// ================================================================

// 利益剰余金 always animates last
function sortForAnimation(names) {
  const main = names.filter(n => n !== '利益剰余金');
  if (names.includes('利益剰余金')) main.push('利益剰余金');
  return main;
}

// Apply CSS transition-delay per block so each animates in sequence
function applyStaggeredDelays(sortedNames) {
  sortedNames.forEach((name, i) => {
    const el = document.querySelector('[data-account="' + name + '"]');
    if (el) el.style.transitionDelay = (i * STAGGER_MS) + 'ms';
  });

  const clearAfter = sortedNames.length * STAGGER_MS + 800;
  setTimeout(() => {
    sortedNames.forEach(name => {
      const el = document.querySelector('[data-account="' + name + '"]');
      if (el) el.style.transitionDelay = '';
    });
  }, clearAfter);
}

// Staggered glow highlight — returns total animation duration in ms
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

// Run the forward animation (old→new balances) at the provided scale.
// Disables transitions first, snaps to prev state, then re-enables + staggers.
function runForwardAnimation(prevBal, newBal, newTotals, changedAccounts, onComplete) {
  const allBlocks = document.querySelectorAll('.account-block');

  // 1. Disable transitions, snap to starting heights (old balances at new scale)
  allBlocks.forEach(el => {
    el.style.transition      = 'none';
    el.style.transitionDelay = '';
  });
  state.balances = {...prevBal};
  renderChartsWithTotals(newTotals, false);

  // 2. Two rAF to flush style changes, then animate to new state
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      allBlocks.forEach(el => { el.style.transition = ''; });
      state.balances = {...newBal};

      const sorted = sortForAnimation(changedAccounts);
      applyStaggeredDelays(sorted);
      renderChartsWithTotals(newTotals, false);

      const totalDuration = highlightBlocksStaggered(changedAccounts);
      if (onComplete) setTimeout(onComplete, totalDuration + 200);
    });
  });
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

  // Hide changes + explanation until execution
  D.panelChanges.classList.add('hidden');
  D.panelExplainSection.classList.add('hidden');
  D.explanation.classList.add('hidden');
  D.explanation.textContent = '';
  D.btnExplain.textContent  = '解説を見る ▼';

  D.btnExecute.classList.remove('hidden');
  D.btnExecute.disabled = false;
  D.btnNext.classList.add('hidden');
  D.btnReplay.classList.add('hidden');
  D.btnPrev.classList.toggle('hidden', id <= 1);
}

// Show a step that has already been executed (used by back button)
function loadStepExecuted(id) {
  const step = STEPS.find(s => s.id === id);
  if (!step) return;

  state.currentStep  = id;
  state.stepExecuted = true;

  D.stepCurrent.textContent = id;
  D.progressBar.style.width = (id / STEPS.length * 100) + '%';
  D.phaseBadge.textContent  = step.phase;
  D.stepTitle.textContent   = '取引' + toCircled(id) + ': ' + step.title;
  D.description.textContent = step.description;

  buildChangesTable(step.changes);
  D.panelChanges.classList.remove('hidden');

  D.explanation.textContent = step.explanation;
  D.explanation.classList.add('hidden');
  D.btnExplain.textContent  = '解説を見る ▼';
  D.panelExplainSection.classList.remove('hidden');

  D.btnExecute.classList.add('hidden');
  D.btnNext.classList.remove('hidden');
  D.btnReplay.classList.remove('hidden');
  D.btnPrev.classList.toggle('hidden', id <= 1);
}

function executeCurrentStep() {
  if (state.stepExecuted) return;
  const step = STEPS.find(s => s.id === state.currentStep);
  if (!step) return;

  // Save pre-execution state
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

  // Snapshot the new state for back-navigation
  const newBalances = {...state.balances};
  state.snapshots[state.currentStep] = newBalances;
  state.stepSnapshots[state.currentStep] = {
    balances:       newBalances,
    changedAccounts: [...state.changedAccounts],
    prevBalances:   {...state.prevBalances},
  };
  state.stepExecuted = true;

  // Compute scale from new balances (kept in state.balances = newBalances)
  const newTotals = computeTotals();

  // Update badges and UI immediately with new totals
  updateTotalBadges(newTotals);
  buildChangesTable(step.changes);
  D.panelChanges.classList.remove('hidden');
  D.explanation.textContent = step.explanation;
  D.panelExplainSection.classList.remove('hidden');
  D.btnExecute.classList.add('hidden');
  D.btnNext.classList.remove('hidden');
  D.btnPrev.classList.add('hidden'); // hidden during animation
  D.progressBar.style.width = (state.currentStep / STEPS.length * 100) + '%';

  // Animate: start from old balances rendered at NEW scale → grow to new balances
  runForwardAnimation(state.prevBalances, newBalances, newTotals, state.changedAccounts, () => {
    D.btnReplay.classList.remove('hidden');
    if (state.currentStep > 1) D.btnPrev.classList.remove('hidden');
  });
}

function advanceStep() {
  const next = state.currentStep + 1;
  if (next > STEPS.length) showSummary();
  else loadStep(next);
}

function goToPrevStep() {
  const prevId = state.currentStep - 1;
  if (prevId < 1) return;

  const snap = state.stepSnapshots[prevId];
  if (!snap) return; // step was never executed

  // Restore to the END state of the previous step
  state.balances        = {...snap.balances};
  state.prevBalances    = {...snap.prevBalances};
  state.changedAccounts = [...snap.changedAccounts];

  // Clear any leftover transition delays, then animate chart to restored state
  document.querySelectorAll('.account-block').forEach(el => {
    el.style.transitionDelay = '';
  });
  renderCharts();

  loadStepExecuted(prevId);
}

function resetApp() {
  state.balances        = makeInitialBalances();
  state.currentStep     = 0;
  state.stepExecuted    = false;
  state.changedAccounts = [];
  state.prevBalances    = null;
  state.snapshots       = {};
  state.stepSnapshots   = {};

  D.summaryOverlay.classList.add('hidden');
  D.progressBar.style.width = '0%';
  D.stepCurrent.textContent = '-';
  D.btnReplay.classList.add('hidden');

  renderCharts();
  loadStep(1);
}

// ================================================================
// Replay: animate from pre-execution state to current state,
// starting heights at the current (new) scale so change is visible
// ================================================================
function replayHighlight() {
  if (!state.prevBalances || state.changedAccounts.length === 0) return;
  D.btnReplay.classList.add('hidden');
  D.btnPrev.classList.add('hidden');

  const newBalances = {...state.balances};
  const newTotals   = computeTotals(); // computed with current state.balances

  runForwardAnimation(state.prevBalances, newBalances, newTotals, state.changedAccounts, () => {
    D.btnReplay.classList.remove('hidden');
    if (state.currentStep > 1) D.btnPrev.classList.remove('hidden');
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
// Changes table
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
