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
  {
    id: 4,
    phase: '開業準備',
    title: '内装工事費の支払い',
    description:
      '内装業者に工事を依頼。カウンター・照明・壁紙などの工事費用として\n' +
      '240万円を現金で支払いました。',
    explanation:
      '【会計のポイント】\n' +
      '現金預金（資産）が240万円減少し、建物付属設備（固定資産）が240万円増加します。\n\n' +
      'これも「資産の中での移動」です。お金が「価値ある内装」に姿を変えました。\n\n' +
      '内装は使用するにつれて価値が減少していきます。\n' +
      '後のステップで「減価償却費」として複数年にわたって費用化されます。\n' +
      '（PLはまだ動きません）',
    changes: [
      { account: '現金預金',     delta: -240 },
      { account: '建物付属設備', delta:  240 },
    ],
  },
  {
    id: 5,
    phase: '開業準備',
    title: '厨房備品購入（掛け買い）',
    description:
      'エスプレッソマシン・冷蔵庫・食器棚など厨房備品一式を120万円で購入。\n' +
      '代金は月末払いの約束（掛け買い）にしました。',
    explanation:
      '【会計のポイント】\n' +
      '備品（固定資産）が120万円増加し、未払金（流動負債）も120万円増加します。\n\n' +
      'お金はまだ払っていないのに、資産と負債が同時に増えています。\n' +
      'これが「掛け取引」の特徴です。現金は1円も動いていません！\n\n' +
      '月末に支払うまでの間、未払金という負債が残ります。',
    changes: [
      { account: '備品',   delta: 120 },
      { account: '未払金', delta: 120 },
    ],
  },
  {
    id: 6,
    phase: '開業準備',
    title: '商品・消耗品仕入れ（掛け買い）',
    description:
      'コーヒー豆（20万円分）と紙コップ等の消耗品（5万円分）を\n' +
      '卸業者から掛けで仕入れました。',
    explanation:
      '【会計のポイント】\n' +
      '商品（流動資産）が25万円増加し、買掛金（流動負債）が25万円増加します。\n\n' +
      'まだ売れていない商品は「資産」として計上されます。\n' +
      'お客様に販売した時点で初めて「売上原価（費用）」になります。\n\n' +
      'ここでもお金は動いていません。BSだけが動いています。',
    changes: [
      { account: '商品',   delta: 25 },
      { account: '買掛金', delta: 25 },
    ],
  },
  {
    id: 7,
    phase: '店舗運営',
    title: '開店！売上が発生',
    description:
      '祝・開店！オープン初週は順調で、レジに現金が60万円入りました。\n' +
      'ここで初めて収益が発生します。',
    explanation:
      '【会計のポイント】\n' +
      'いよいよPL（損益計算書）が動き始めます！\n' +
      '現金預金（資産）が60万円増加し、売上（収益）が60万円計上されます。\n\n' +
      'PLの利益がBSの利益剰余金（純資産）に自動的に反映されているのを確認してください。\n' +
      '「BSとPLの連動」を体感する最初の瞬間です！',
    changes: [
      { account: '現金預金', delta: 60 },
      { account: '売上',     delta: 60 },
    ],
  },
  {
    id: 8,
    phase: '店舗運営',
    title: 'アルバイト給与の発生（翌月払い）',
    description:
      'アルバイトを2名雇用。今月分の給与30万円が発生しましたが、\n' +
      '支払いは来月10日の予定です。',
    explanation:
      '【会計のポイント】\n' +
      '給与手当（費用）が30万円計上され、未払金（負債）が30万円増加します。\n\n' +
      '現金はまだ払っていないのに費用が発生しています。\n' +
      'これが「発生主義会計」の基本原則です。\n\n' +
      '利益剰余金が減少し、売上60万円 - 給与30万円 = 30万円になりました。\n' +
      '「利益とキャッシュのズレ」を体感してください！',
    changes: [
      { account: '未払金',  delta: 30 },
      { account: '給与手当', delta: 30 },
    ],
  },
];
