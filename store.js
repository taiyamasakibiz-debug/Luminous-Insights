import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// --- Phase 4: The Armor & Shield (判定辞書) ---
const ACCOUNT_DICTIONARY = {
  ExtraInc: ['売却益', '修正益', '特別利益'],
  NonOpInc: ['受取利息', '為替差益', '受取配当', '雑収入'],
  Revenue: ['売上', '報酬', '営業収益'],
  Tax: ['法人税', '住民税', '事業税'],
  ExtraLoss: ['売却損', '減損損失', '火災', '災害', '特別損失'],
  NonOpExp: ['支払利息', '為替差損', '社債利息', '雑損失'],
  COGS: ['仕入', '材料', '外注', '労務', '製造', '原価'],
  SGA_Default: ['給料', '役員報酬', '広告', '減価償却費', '貸倒引当金', '家賃', '水道', '光熱', '旅費', '交通', '通信', '消耗品', '手数料'],
  
  // 詳細分析用分類
  Asset_Current: ['現金', '預金', '売掛', '受取手形', '商品', '製品', '仕掛品', '原材料', '流動資産', '未収入金'],
  Asset_TangibleFixed: ['建物', '機械', '車両', '土地', '有形固定資産'],
  Liab_Current: ['買掛', '支払手形', '短期借入', '未払金', '未払費用', '流動負債'],
  Equity_RetainedEarnings: ['利益剰余金', '繰越利益'],

  // C/F 調整用（特定機能科目）
  CF_Depreciation: ['減価償却費'],
  CF_BadDebt: ['貸倒引当金'],
  CF_AR: ['売掛', '受取手形', '未収入金', '電子記録債権'],
  CF_INV: ['商品', '製品', '仕掛品', '原材料'],
  CF_AP: ['買掛', '支払手形', '未払金', '電子記録債務']
};

const classifyAccount = (name, group) => {
  if (!name) return null;
  
  // 辞書による判定
  for (const [key, keywords] of Object.entries(ACCOUNT_DICTIONARY)) {
    if (keywords.some(k => name.includes(k))) {
      // SGA_Default は 'SGA' として扱う
      if (key === 'SGA_Default') return 'SGA';
      // CF_ プレフィックスは分類用ではないのでスキップ
      if (key.startsWith('CF_')) continue;
      return key;
    }
  }

  // フォールバック
  if (group === 'Revenue') return 'Revenue';
  if (group === 'Expense') return 'SGA';
  return null;
};

export const MACRO_VISUALS = {
  'vis_liquid': { base: '💧', mid: '🌊', high: '🌀' },
  'vis_solid':  { base: '🧊', mid: '🪨', high: '🏔️' },
  'vis_mist':   { base: '🌫️', mid: '🌫️', high: '🌫️' },
  'vis_drain':  { base: '🕳️', mid: '🕳️', high: '🕳️' },
  'vis_forge':  { base: '⚙️', mid: '⚙️', high: '⚙️' }
};

const calculateFinancials = (events, accounts, categories, visualTypes, benchmark) => {
  const balances = {};
  // カテゴリパスとオーダー情報を保持
  const sortedAccounts = [...accounts].sort((a,b) => (a.order||0) - (b.order||0));
  
  sortedAccounts.forEach(acc => {
    const cat = categories?.find(c => c.id === acc.categoryId);
    balances[acc.id] = { account: acc, category: cat, rawBalance: 0, type: classifyAccount(acc.name, cat?.group) };
  });

  let totalD = 0, totalC = 0;
  const unbalancedEventIds = [];
  events.forEach(evt => {
    let eD = 0, eC = 0;
    const debits = evt.debits || (evt.debitAccountId ? [{ accountId: evt.debitAccountId, amount: evt.amount }] : []);
    const credits = evt.credits || (evt.creditAccountId ? [{ accountId: evt.creditAccountId, amount: evt.amount }] : []);
    debits.forEach(d => { const a = parseFloat(d.amount) || 0; if (d.accountId && balances[d.accountId]) balances[d.accountId].rawBalance += a; eD += a; });
    credits.forEach(c => { const a = parseFloat(c.amount) || 0; if (c.accountId && balances[c.accountId]) balances[c.accountId].rawBalance -= a; eC += a; });
    if (Math.abs(eD - eC) > 0.01) unbalancedEventIds.push(evt.id);
    totalD += eD; totalC += eC;
  });

  const metrics = {
    sales: 0, cogs: 0, grossProfit: 0, sga: 0, operatingProfit: 0,
    nonOpInc: 0, nonOpExp: 0, ordinaryProfit: 0,
    extraInc: 0, extraLoss: 0, netIncomeBeforeTax: 0,
    tax: 0, netIncome: 0,
    operatingCF: 0,
    depreciation: 0, badDebt: 0, ar: 0, inv: 0, ap: 0,
    totalAssets: 0, totalLiabEquity: 0, diff: 0, isBalanced: true
  };

  Object.values(balances).forEach(b => {
    const g = b.category?.group;
    b.displayBalance = (g === 'Asset' || g === 'Expense') ? b.rawBalance : -b.rawBalance;
    const val = b.displayBalance;
    const type = b.type;

    if (type === 'Revenue') metrics.sales += val;
    else if (type === 'COGS') metrics.cogs += val;
    else if (type === 'SGA') {
      metrics.sga += val;
      if (ACCOUNT_DICTIONARY.CF_Depreciation.some(k => b.account.name?.includes(k))) metrics.depreciation += val;
      if (ACCOUNT_DICTIONARY.CF_BadDebt.some(k => b.account.name?.includes(k))) metrics.badDebt += val;
    }
    else if (type === 'NonOpInc') metrics.nonOpInc += val;
    else if (type === 'NonOpExp') metrics.nonOpExp += val;
    else if (type === 'ExtraInc') metrics.extraInc += val;
    else if (type === 'ExtraLoss') metrics.extraLoss += val;
    else if (type === 'Tax') metrics.tax += val;

    // カテゴリがなくても Type に基づいて A/L/E 合計に加算
    if (g === 'Asset' || type === 'Asset') {
      metrics.totalAssets += val;
      if (ACCOUNT_DICTIONARY.CF_AR.some(k => b.account.name?.includes(k))) metrics.ar += val;
      if (ACCOUNT_DICTIONARY.CF_INV.some(k => b.account.name?.includes(k))) metrics.inv += val;
      if (ACCOUNT_DICTIONARY.CF_BadDebt.some(k => b.account.name?.includes(k))) metrics.badDebt -= val; // 評価勘定
    }
    if (g === 'Liability' || type === 'Liability' || g === 'Equity' || type === 'Equity') {
      metrics.totalLiabEquity += val;
      if (g === 'Liability' || type === 'Liability') {
        if (ACCOUNT_DICTIONARY.CF_AP.some(k => b.account.name?.includes(k))) metrics.ap += val;
      }
    }
  });

  metrics.grossProfit = metrics.sales - metrics.cogs;
  metrics.operatingProfit = metrics.grossProfit - metrics.sga;
  metrics.ordinaryProfit = metrics.operatingProfit + metrics.nonOpInc - metrics.nonOpExp;
  metrics.netIncomeBeforeTax = metrics.ordinaryProfit + metrics.extraInc - metrics.extraLoss;
  metrics.netIncome = metrics.netIncomeBeforeTax - metrics.tax;

  metrics.diff = Math.abs(metrics.totalAssets - (metrics.totalLiabEquity + metrics.netIncome));
  metrics.isBalanced = metrics.diff < 1;

  // 簡易間接法CF
  metrics.operatingCF = (metrics.netIncome || 0) + (metrics.depreciation || 0) + (metrics.badDebt || 0) - (metrics.ar || 0) - (metrics.inv || 0) + (metrics.ap || 0);

  // --- View Data Calculation ---
  const viewData = { scale: {}, prism: {}, matrix: {} };

  // ScaleView Data
  const aAccs = Object.values(balances).filter(b => b.category?.group === 'Asset');
  const lAccs = Object.values(balances).filter(b => b.category?.group === 'Liability');
  const eAccs = Object.values(balances).filter(b => b.category?.group === 'Equity');

  const rawL = [], rawR = [];
  Object.values(balances).forEach(b => {
    const acc = b.account; const bal = b.rawBalance; if (Math.abs(bal) <= 0) return;
    const isL = bal > 0; const absA = Math.abs(bal);
    const v = (visualTypes || []).find(vt => vt.id === acc.visualTypeId);
    const m = MACRO_VISUALS[acc.visualTypeId] || { base: v?.icon || '💠', mid: v?.icon || '💠', high: v?.icon || '💠' };

    const push = (tier, icon, step) => {
      let count = Math.min(5, Math.floor(absA / step));
      if (absA > 0 && tier === 'base' && count === 0) count = 1;
      for(let i=0; i<count; i++) {
        const o = { id: `${acc.id}-${tier}-${i}`, name: acc.name, icon, amount: Math.abs(b.displayBalance) };
        if (isL) rawL.push(o); else rawR.push(o);
      }
    };
    push('high', m.high, 2000000); push('mid', m.mid, 500000); push('base', m.base, 100000);
  });
  
  const totalRightWithIncome = metrics.totalLiabEquity + metrics.netIncome;
  const rot = !metrics.isBalanced ? -Math.sign(metrics.totalAssets - totalRightWithIncome) * Math.min(35, Math.pow((Math.abs(metrics.totalAssets - totalRightWithIncome) / Math.max(1, metrics.totalAssets + totalRightWithIncome)) * 100, 0.4) * 15) : 0;
  
  viewData.scale = { aAccs, lAccs, eAccs, rawL, rawR, rot };

  // --- Phase 5: Analytical Prism Metrics (8-Axis) ---
  const findTotal = (keys) => Object.values(balances).reduce((sum, b) => keys.some(k => b.account.name?.includes(k)) ? sum + (b.displayBalance || 0) : sum, 0);
  
  const currentAssets = findTotal(ACCOUNT_DICTIONARY.Asset_Current);
  const fixedAssets = findTotal(ACCOUNT_DICTIONARY.Asset_TangibleFixed);
  const currentLiabilities = findTotal(ACCOUNT_DICTIONARY.Liab_Current);
  const totalEquity = metrics.totalLiabEquity - Object.values(balances).reduce((sum, b) => b.category?.group === 'Liability' ? sum + (b.displayBalance || 0) : sum, 0) + metrics.netIncome;

  // 8指標の計算（0除算ガード付き）
  metrics.grossProfitMargin = metrics.sales > 0 ? (metrics.grossProfit / metrics.sales) * 100 : 0;
  metrics.operatingProfitMargin = metrics.sales > 0 ? (metrics.operatingProfit / metrics.sales) * 100 : 0;
  metrics.roe = totalEquity > 0 ? (metrics.netIncome / totalEquity) * 100 : 0;
  metrics.roa = metrics.totalAssets > 0 ? (metrics.netIncome / metrics.totalAssets) * 100 : 0;
  metrics.currentRatio = currentLiabilities > 0 ? (currentAssets / currentLiabilities) * 100 : 0;
  metrics.equityRatio = metrics.totalAssets > 0 ? (totalEquity / metrics.totalAssets) * 100 : 0;
  metrics.totalAssetTurnover = metrics.totalAssets > 0 ? metrics.sales / metrics.totalAssets : 0;
  metrics.inventoryTurnover = metrics.inv > 0 ? metrics.cogs / metrics.inv : 0;

  viewData.prism = { metrics: { ...metrics } };

  // MatrixView Data
  const bData = { dep:[], badDebt:[], ar:[], inv:[], ap:[], nonOp:[], sales:[], cogs:[], personnel:[], otherExp:[], unpaidSal:[] };
  const personnelKeywords = ['給料', '給与', '賞与', '賞与引当', '法定福利', '福利厚生', '人件費'];
  const isPersonnel = (name) => personnelKeywords.some(key => name.includes(key));

  Object.values(balances).forEach(item => {
    const acc = item.account; const bal = item.displayBalance || 0; const group = item.category?.group;
    const name = acc.name || '';
    if (group === 'Revenue') {
      if (ACCOUNT_DICTIONARY.NonOpInc.some(k => name.includes(k))) bData.nonOp.push({name, balance:bal});
      else if (ACCOUNT_DICTIONARY.ExtraInc.some(k => name.includes(k))) bData.nonOp.push({name, balance:bal});
      else if (ACCOUNT_DICTIONARY.Revenue.some(k => name.includes(k))) bData.sales.push({name, balance:bal});
    }
    if (group === 'Expense') {
      if (ACCOUNT_DICTIONARY.CF_Depreciation.some(k => name.includes(k))) bData.dep.push({name, balance:bal});
      else if (ACCOUNT_DICTIONARY.NonOpExp.some(k => name.includes(k))) bData.nonOp.push({name, balance:bal});
      else if (ACCOUNT_DICTIONARY.ExtraLoss.some(k => name.includes(k))) bData.nonOp.push({name, balance:bal});
      else if (ACCOUNT_DICTIONARY.COGS.some(k => name.includes(k))) bData.cogs.push({name, balance:bal});
      else if (isPersonnel(name)) bData.personnel.push({name, balance:bal});
      else if (!ACCOUNT_DICTIONARY.Tax.some(k => name.includes(k))) bData.otherExp.push({name, balance:bal});
    }
    if (group === 'Asset') {
      if (ACCOUNT_DICTIONARY.CF_AR.some(k => name.includes(k))) bData.ar.push({name, balance:bal});
      if (ACCOUNT_DICTIONARY.CF_INV.some(k => name.includes(k))) bData.inv.push({name, balance:bal});
      if (ACCOUNT_DICTIONARY.CF_BadDebt.some(k => name.includes(k))) bData.badDebt.push({name, balance:bal});
    }
    if (group === 'Liability') {
      if (ACCOUNT_DICTIONARY.CF_AP.some(k => name.includes(k))) bData.ap.push({name, balance:bal});
      else if (name.includes('未払') && (isPersonnel(name) || name.includes('給与'))) bData.unpaidSal.push({name, balance:bal});
    }
  });

  const nonCash = [
    { label: '減価償却費', amount: metrics?.depreciation ?? 0, type: 'plus', breakdown: bData.dep },
    { label: '貸倒引当金の増減', amount: metrics?.badDebt ?? 0, type: 'plus', breakdown: bData.badDebt }
  ];
  const wc = [
    { label: '売上債権の増減', amount: -(metrics?.ar ?? 0), type: 'minus', breakdown: bData.ar },
    { label: '棚卸資産の増減', amount: -(metrics?.inv ?? 0), type: 'minus', breakdown: bData.inv },
    { label: '仕入債務の増減', amount: metrics?.ap ?? 0, type: 'plus', breakdown: bData.ap }
  ];
  const nonOp = [
    { label: '利息・配当・売却損益', amount: (metrics?.nonOpExp ?? 0) + (metrics?.extraLoss ?? 0) - (metrics?.nonOpInc ?? 0) - (metrics?.extraInc ?? 0), type: 'minus', breakdown: bData.nonOp }
  ].filter(i => i.amount !== 0);
  const direct = [
    { label: '営業収入', amount: (metrics?.sales ?? 0) - (metrics?.ar ?? 0), type: 'plus', breakdown: [...bData.sales, ...bData.ar] },
    { label: '仕入支出', amount: (metrics?.cogs ?? 0) + (metrics?.inv ?? 0) - (metrics?.ap ?? 0), type: 'minus', breakdown: [...bData.cogs, ...bData.inv, ...bData.ap] },
    { label: '人件費の支出', amount: bData.personnel.reduce((s,i)=>s+(i.balance || 0),0) - bData.unpaidSal.reduce((s,i)=>s+(i.balance || 0),0), type: 'minus', breakdown: [...bData.personnel, ...bData.unpaidSal] },
    { label: 'その他の営業支出', amount: bData.otherExp.reduce((s,i)=>s+(i.balance || 0),0), type: 'minus', breakdown: bData.otherExp }
  ];
  
  viewData.matrix = { cfData: { nonCash, wc, nonOp, direct } };

  return { balances, metrics, viewData, globalUnbalancedAmount: totalD - totalC, unbalancedEventIds };
};

export const useLuminousStore = create(
  persist(
    (set, get) => ({
      categories: [
        { id: 'cat_asset', name: '資産', group: 'Asset', parentId: null, order: 0 },
        { id: 'cat_liability', name: '負債', group: 'Liability', parentId: null, order: 1 },
        { id: 'cat_equity', name: '純資産', group: 'Equity', parentId: null, order: 2 },
        { id: 'cat_revenue', name: '収益', group: 'Revenue', parentId: null, order: 3 },
        { id: 'cat_expense', name: '費用', group: 'Expense', parentId: null, order: 4 }
      ],
      accounts: [],
      visualTypes: [
        { id: 'vis_liquid', name: 'Liquid', icon: '💧', desc: '流動的なもの' },
        { id: 'vis_solid', name: 'Solid', icon: '🧊', desc: '固定・蓄積されるもの' },
        { id: 'vis_mist', name: 'Mist', icon: '🌫️', desc: '蒸発・消費されるもの' },
        { id: 'vis_drain', name: 'Drain', icon: '🕳️', desc: '強制的に排出されるもの' },
        { id: 'vis_forge', name: 'Forge', icon: '⚙️', desc: '変換されるもの' }
      ],
      events: [],
      balances: {},
      metrics: { isBalanced: true, diff: 0 },
      globalUnbalancedAmount: 0,
      unbalancedEventIds: [],
      stories: [],
      activeStoryId: null,
      activeQuest: null,
      activeComparisonId: null,
      benchmark: {
        name: "製造業平均",
        metrics: {
          grossProfitMargin: 20.0,
          operatingProfitMargin: 5.0,
          roe: 10.0,
          roa: 6.0,
          currentRatio: 150.0,
          equityRatio: 40.0,
          totalAssetTurnover: 1.0,
          inventoryTurnover: 6.0
        }
      },
      activeModule: new URLSearchParams(window.location.search).get('m') || 'home',
      lastNotification: { message: '', type: '', id: 0 },
      hasHydrated: false,
      lastUpdatedAt: Date.now(),

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setActiveModule: (m) => set({ activeModule: m }),
      showToast: (message, type = 'success', options = {}) => set({ lastNotification: { message, type, ...options, id: Date.now() + Math.random() } }),

      syncFinancials: (newEvents) => {
        const { accounts, categories, visualTypes, benchmark } = get();
        const evts = newEvents || get().events;
        const results = calculateFinancials(evts, accounts, categories, visualTypes, benchmark);
        set({ ...results, events: evts, lastUpdatedAt: Date.now() });
      },

      dispatchEvent: (event) => {
        const newEvents = [...get().events, { ...event, id: 'evt_' + Date.now() }];
        get().syncFinancials(newEvents);
      },
      clearAllEvents: () => get().syncFinancials([]),
      deleteEvent: (id) => {
        const newEvents = get().events.filter(e => e.id !== id);
        get().syncFinancials(newEvents);
      },
      undoLastEvent: () => {
        if (get().events.length === 0) return;
        const newEvents = get().events.slice(0, -1);
        get().syncFinancials(newEvents);
      },
      reverseEvent: (id) => {
        const orig = get().events.find(e => e.id === id);
        if (!orig) return;
        const debits = orig.debits || (orig.debitAccountId ? [{ accountId: orig.debitAccountId, amount: orig.amount }] : []);
        const credits = orig.credits || (orig.creditAccountId ? [{ accountId: orig.creditAccountId, amount: orig.amount }] : []);
        const reversal = { id: 'evt_' + Date.now(), description: `[取消] ${orig.description}`, date: new Date().toISOString(), isReversal: true, debits: credits.map(c => ({...c})), credits: debits.map(d => ({...d})) };
        get().syncFinancials([...get().events, reversal]);
      },

      addCategory: (name, parentId, group) => set((s) => {
        const parent = s.categories.find(c => c.id === parentId);
        const effectiveGroup = parent ? parent.group : (group || 'Asset');
        const siblings = s.categories.filter(c => c.parentId === parentId);
        const maxOrder = siblings.reduce((max, x) => Math.max(max, x.order || 0), -1);
        const newState = { categories: [...s.categories, { id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2,5), name, parentId, group: effectiveGroup, order: maxOrder + 1 }], lastUpdatedAt: Date.now() };
        set(newState);
        get().syncFinancials();
        return newState;
      }),
      addAccount: (newAcc) => set((s) => {
        const siblings = s.accounts.filter(a => a.categoryId === newAcc.categoryId);
        const maxOrder = siblings.reduce((max, x) => Math.max(max, x.order || 0), -1);
        const newState = { accounts: [...s.accounts, { ...newAcc, id: 'acc_' + Date.now() + '_' + Math.random().toString(36).substr(2,5), order: maxOrder + 1 }], lastUpdatedAt: Date.now() };
        set(newState);
        get().syncFinancials();
        return newState;
      }),
      moveNode: (type, id, direction) => set((s) => {
        const list = type === 'category' ? [...s.categories] : [...s.accounts];
        const node = list.find(n => n.id === id);
        if (!node) return s;
        const parentKey = type === 'category' ? 'parentId' : 'categoryId';
        const siblings = list.filter(n => n[parentKey] === node[parentKey]).sort((a, b) => (a.order||0) - (b.order||0));
        const idx = siblings.findIndex(x => x.id === id);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= siblings.length) return s;
        const swapWith = siblings[swapIdx];
        const newList = list.map(item => {
          if (item.id === node.id) return { ...item, order: swapWith.order || 0 };
          if (item.id === swapWith.id) return { ...item, order: node.order || 0 };
          return item;
        });
        const newState = { [type === 'category' ? 'categories' : 'accounts']: newList, lastUpdatedAt: Date.now() };
        set(newState);
        get().syncFinancials();
        return newState;
      }),
      deleteNode: (type, id) => set((s) => {
        const rootIds = ['cat_asset','cat_liability','cat_equity','cat_revenue','cat_expense'];
        if (type === 'category' && rootIds.includes(id)) return s;
        const result = type === 'category' ? { categories: s.categories.filter(c => c.id !== id) } : { accounts: s.accounts.filter(a => a.id !== id) };
        const newState = { ...result, lastUpdatedAt: Date.now() };
        set(newState);
        get().syncFinancials();
        return newState;
      }),
      addVisualType: (v) => set((s) => ({ visualTypes: [...s.visualTypes, { ...v, id: 'vis_' + Date.now() }], lastUpdatedAt: Date.now() })),
      updateBenchmark: (data) => {
        set((s) => ({ benchmark: { ...s.benchmark, ...data }, lastUpdatedAt: Date.now() }));
        get().syncFinancials();
      },
      resetToDefault: () => {
        localStorage.removeItem('luminous-storage');
        window.location.reload();
      },
      addStory: (story) => set((s) => ({ stories: [...s.stories, { ...story, id: 'story_' + Date.now(), savedEvents: [], metricsSnapshot: {}, isCleared: false, createdAt: new Date().toISOString() }], lastUpdatedAt: Date.now() })),
      deleteStory: (id) => set((s) => ({ stories: s.stories.filter(x => x.id !== id), activeStoryId: s.activeStoryId === id ? null : s.activeStoryId, activeComparisonId: s.activeComparisonId === id ? null : s.activeComparisonId, lastUpdatedAt: Date.now() })),
      setActiveComparisonId: (id) => set((s) => ({ activeComparisonId: s.activeComparisonId === id ? null : id, lastUpdatedAt: Date.now() })),
      setActiveStory: (id) => {
        const s = get();
        const activeQuest = s.stories.find(x => x.id === id) || null;
        const newEvents = id ? [] : s.events;
        set({ activeStoryId: id, activeQuest });
        get().syncFinancials(newEvents);
      },
      clearQuest: (id) => {
        const s = get();
        const metricsSnapshot = JSON.parse(JSON.stringify(s.metrics || {}));
        const stories = s.stories.map(x => x.id === id ? { ...x, savedEvents: JSON.parse(JSON.stringify(s.events)), metricsSnapshot, isCleared: true } : x);
        set({ stories, activeStoryId: null, activeQuest: null });
        get().syncFinancials([]);
      },
      restoreStoryEvents: (id) => {
        const story = get().stories.find(x => x.id === id);
        if (story) {
          set({ activeStoryId: id, activeQuest: story });
          get().syncFinancials(JSON.parse(JSON.stringify(story.savedEvents)));
        }
      },
      
      calculateBalances: () => ({ balances: get().balances, globalUnbalancedAmount: get().globalUnbalancedAmount, unbalancedEventIds: get().unbalancedEventIds }),
      
      confirmation: null,
      requestConfirmation: (data) => set({ confirmation: data }),
      closeConfirmation: () => set({ confirmation: null }),
      
      executeEpochClose: () => {
        const { accounts, balances, globalUnbalancedAmount } = get();
        if (Math.abs(globalUnbalancedAmount) > 0.01) return { success: false, error: 'SYSTEM_UNBALANCED' };
        let reAcc = accounts.find(a => a.name.includes('利益剰余金'));
        if (!reAcc) return { success: false, error: 'MISSING_RETAINED_EARNINGS' };
        const cD = [], cC = [];
        let netIncome = 0;
        Object.values(balances).forEach(b => {
          const g = b.category?.group, bal = b.rawBalance;
          if (g === 'Revenue') { if (Math.abs(bal) < 0.01) return; if (bal < 0) { cD.push({ accountId: b.account.id, amount: Math.abs(bal) }); netIncome += Math.abs(bal); } else { cC.push({ accountId: b.account.id, amount: bal }); netIncome -= bal; } }
          else if (g === 'Expense') { if (Math.abs(bal) < 0.01) return; if (bal > 0) { cC.push({ accountId: b.account.id, amount: bal }); netIncome -= bal; } else { cD.push({ accountId: b.account.id, amount: Math.abs(bal) }); netIncome += Math.abs(bal); } }
        });
        if (cD.length === 0 && cC.length === 0) return { success: false, error: 'NO_BALANCES_TO_CLOSE' };
        if (netIncome > 0) cC.push({ accountId: reAcc.id, amount: netIncome });
        else if (netIncome < 0) cD.push({ accountId: reAcc.id, amount: Math.abs(netIncome) });
        const newEvents = [...get().events, { id: 'evt_' + Date.now(), description: '[EPOCH CLOSE] 決算振替', date: new Date().toISOString(), debits: cD, credits: cC }];
        get().syncFinancials(newEvents);
        return { success: true };
      }
    }),
    { name: 'luminous-storage', partialize: (s) => ({ categories: s.categories, accounts: s.accounts, events: s.events, stories: s.stories, benchmark: s.benchmark, lastUpdatedAt: s.lastUpdatedAt, activeStoryId: s.activeStoryId, activeQuest: s.activeQuest, activeComparisonId: s.activeComparisonId, balances: s.balances, metrics: s.metrics, viewData: s.viewData }),
      onRehydrateStorage: () => (state) => { if (state) { state.setHasHydrated(true); state.syncFinancials(); } }
    }
  )
);
window.addEventListener('storage', (e) => {
  if (e.key === 'luminous-storage') {
    try {
      const p = JSON.parse(e.newValue);
      const newState = p.state;
      const current = useLuminousStore.getState();
      
      // Residual Cleansing: ストーリーIDがない場合はクエスト情報も道連れに破棄
      if (newState && !newState.activeStoryId) {
        newState.activeQuest = null;
      }
      
      if ((newState?.lastUpdatedAt || 0) > (current.lastUpdatedAt || 0)) {
        useLuminousStore.setState(newState);
      }
    } catch(err){}
  }
});

