// =============================================================
// ACCOUNTS registry
// Each account has: section (bs/pl), side (left/right),
// category, color, and order (for vertical stacking, top=low)
// =============================================================
const ACCOUNTS = {
  // ── BS LEFT: 資産 ────────────────────────────────────────
  '現金預金':     { section:'bs', side:'left',  category:'流動資産', color:'#87CEEB', order:1 },
  '売掛金':       { section:'bs', side:'left',  category:'流動資産', color:'#5BB8D4', order:2 },
  '商品':         { section:'bs', side:'left',  category:'流動資産', color:'#4AA8C4', order:3 },
  '建物付属設備': { section:'bs', side:'left',  category:'固定資産', color:'#4682B4', order:4 },
  '備品':         { section:'bs', side:'left',  category:'固定資産', color:'#3A70A0', order:5 },
  '保証金':       { section:'bs', side:'left',  category:'固定資産', color:'#2E5A8C', order:6 },

  // ── BS RIGHT: 負債・純資産 ───────────────────────────────
  '買掛金':       { section:'bs', side:'right', category:'流動負債', color:'#F48FB1', order:7 },
  '未払金':       { section:'bs', side:'right', category:'流動負債', color:'#F06292', order:8 },
  '長期借入金':   { section:'bs', side:'right', category:'固定負債', color:'#EF5350', order:9 },
  '資本金':       { section:'bs', side:'right', category:'純資産',   color:'#9370DB', order:10 },
  '利益剰余金':   { section:'bs', side:'right', category:'純資産',   color:'#7B52C8', order:11 },

  // ── PL LEFT: 費用 ────────────────────────────────────────
  '売上原価':     { section:'pl', side:'left',  category:'費用', color:'#1F4E79', order:12 },
  '給与手当':     { section:'pl', side:'left',  category:'費用', color:'#1565C0', order:13 },
  '広告宣伝費':   { section:'pl', side:'left',  category:'費用', color:'#1976D2', order:14 },
  '地代家賃':     { section:'pl', side:'left',  category:'費用', color:'#2196F3', order:15 },
  '減価償却費':   { section:'pl', side:'left',  category:'費用', color:'#42A5F5', order:16 },
  '支払利息':     { section:'pl', side:'left',  category:'費用', color:'#5E35B1', order:17 },

  // ── PL RIGHT: 収益 ───────────────────────────────────────
  '売上':         { section:'pl', side:'right', category:'収益', color:'#FF4500', order:18 },
};

// Which categories appear in each column, top→bottom
const CATEGORY_ORDER = {
  'bs-left':  ['流動資産', '固定資産'],
  'bs-right': ['流動負債', '固定負債', '純資産'],
  'pl-left':  ['費用'],
  'pl-right': ['収益'],
};

// =============================================================
// STEPS  (3-step mockup — extend to 15 later)
// "changes" lists only direct journal entries.
// 利益剰余金 is auto-calculated in app.js after each step.
// =============================================================
const STEPS = [
  {
    id: 1,
    phase: '開業準備',
    title: '自己資金の投入',
    description:
      '自己資金として、普通預金に300万円を入金しました。\n' +
      '株主からの出資が資本金となり、ビジネスの元手となります。',
    explanation:
      '【会計のポイント】\n' +
      '資産（現金預金）が300万円増加し、同時に純資産（資本金）も300万円増加します。\n' +
      '「資産 ＝ 負債 ＋ 純資産」という会計の基本等式が成り立っています。\n\n' +
      'この取引ではBSだけが動き、PLは動きません。\n' +
      'まだ売上も費用も発生していないからです。',
    changes: [
      { account: '現金預金', delta: 300 },
      { account: '資本金',   delta: 300 },
    ],
  },
  {
    id: 2,
    phase: '開業準備',
    title: '銀行からの借入',
    description:
      '開業するのに不足する資金として、銀行から500万円を借り入れました。',
    explanation:
      '【会計のポイント】\n' +
      '現金預金（資産）が500万円増加し、長期借入金（負債）も500万円増加します。\n\n' +
      'お金が増えましたが、将来返さなければならない「他人資本」です。\n' +
      '資本金（自己資本）との違いを意識しましょう。\n' +
      '銀行には利息というコストが後ほど発生します。',
    changes: [
      { account: '現金預金',   delta: 500 },
      { account: '長期借入金', delta: 500 },
    ],
  },
  {
    id: 3,
    phase: '開業準備',
    title: '店舗契約・保証金支払い',
    description:
      '店舗物件を契約し、保証金として100万円を現金で支払いました。',
    explanation:
      '【会計のポイント】\n' +
      '現金預金（資産）が100万円減少し、保証金（固定資産）が100万円増加します。\n\n' +
      'これは「資産の中での移動」です。\n' +
      'お金は減りましたが、会社の総資産額は変わっていません！\n\n' +
      '保証金は将来返還される可能性のある資産として計上されます。\n' +
      '（PLは今回も動きません）',
    changes: [
      { account: '現金預金', delta: -100 },
      { account: '保証金',   delta:  100 },
    ],
  },
];
