import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLuminousStore } from './store.js?v=2';

const h = React.createElement;

export const THEME = {
  // --- Panels & Containers ---
  panel: "glass p-8 rounded-[2.5rem] border border-white/5 bg-slate-900/60 shadow-2xl",
  panelCyan: "glass p-8 rounded-[2.5rem] border border-cyan-500/20 bg-slate-900/80 shadow-[0_0_30px_rgba(6,182,212,0.1)]",
  panelFuchsia: "glass p-8 rounded-[2.5rem] border border-fuchsia-500/20 bg-slate-900/80 shadow-[0_0_30px_rgba(217,70,239,0.1)]",
  panelItem: "bg-slate-800/20 p-5 border border-white/5 rounded-2xl flex justify-between hover:bg-slate-800/40 transition-colors",

  // --- Typography ---
  h1: "text-4xl font-bold tracking-tighter mt-2 text-slate-100 uppercase",
  h2: "text-2xl font-bold text-slate-100",
  labelSub: "text-[10px] text-slate-500 uppercase tracking-widest font-bold",
  labelCyan: "text-[10px] text-cyan-400 uppercase tracking-widest font-bold",
  labelFuchsia: "text-[10px] text-fuchsia-400 uppercase tracking-widest font-bold",
  
  // --- Numbers (Mono) ---
  numBase: "font-mono font-bold text-xl text-slate-200",
  numCyan: "font-mono font-bold text-xl text-cyan-400",
  numFuchsia: "font-mono font-bold text-xl text-fuchsia-400",
  numDanger: "font-mono font-bold text-xl text-red-400",

  // --- Buttons ---
  btnBase: "px-6 py-3 rounded-2xl text-[10px] font-bold uppercase transition-all cursor-pointer border",
  btnCyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.2)]",
  btnDanger: "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
};

export function ViewShell({ children, className = "" }) {
  return h('div', { className: `p-8 pt-24 max-w-[1400px] mx-auto w-full flex flex-col h-screen overflow-hidden ${className}` }, [
    h('div', { className: "w-full flex-1 overflow-y-auto hide-scroll pb-32" }, children)
  ]);
}

export function GlobalNavigation() {
  const activeModule = useLuminousStore(s => s.activeModule);
  const setActiveModule = useLuminousStore(s => s.setActiveModule);
  const tabs = [
    { id: 'prism', label: 'PRISM', color: 'text-fuchsia-400' },
    { id: 'waterfall', label: 'WATERFALL', color: 'text-cyan-400' },
    { id: 'matrix', label: 'MATRIX', color: 'text-cyan-400' },
    { id: 'scale', label: 'SCALE', color: 'text-cyan-400' },
    { id: 'journal', label: 'JOURNAL', color: 'text-fuchsia-400' }
  ];
  if (activeModule === 'home') return null;
  return h('nav', { className: "absolute top-6 right-6 flex gap-3 z-[100] bg-slate-900/60 p-2.5 px-6 rounded-full border border-white/10 backdrop-blur-md items-center shadow-lg" }, [
    h('button', { key: 'home', onClick: () => setActiveModule('home'), title: 'ホームへ', className: "text-base px-2 transition-all hover:scale-110 text-slate-400 hover:text-cyan-400" }, "🏠"),
    h('div', { key: 'sep-home', className: "w-px h-4 bg-white/10" }),
    ...tabs.map((tab, i) => [
    i > 0 && h('div', { key: `sep-${i}`, className: "w-px h-4 bg-white/10" }),
    h('button', { key: tab.id, onClick: () => setActiveModule(tab.id), className: `text-[10px] uppercase font-bold px-3 transition-all tracking-[0.2em] ${activeModule === tab.id ? `${tab.color} drop-shadow-[0_0_10px_currentColor] scale-110` : 'text-slate-400 hover:text-cyan-400 hover:scale-105'}` }, tab.label)
  ])
  ]);
}

export function GlobalCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const { accounts, dispatchEvent, showToast, undoLastEvent, activeModule } = useLuminousStore();
  const [desc, setDesc] = useState('');
  const [debitLines, setDebitLines] = useState([{ id: 1, accountId: '', amount: '' }]);
  const [creditLines, setCreditLines] = useState([{ id: 2, accountId: '', amount: '' }]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setIsOpen(p => !p); } if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, []);

  if (activeModule === 'home') return null;

  const updateLine = (side, id, field, value) => { const set_ = side === 'debit' ? setDebitLines : setCreditLines; set_(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l)); };
  const addLine = (side) => { const nl = { id: Date.now(), accountId: '', amount: '' }; if (side === 'debit') setDebitLines(p => [...p, nl]); else setCreditLines(p => [...p, nl]); };
  const totalD = debitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const totalC = creditLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const balanced = Math.abs(totalD - totalC) < 0.01 && totalD > 0;

  const handleDispatch = () => {
    if (!desc) return;
    dispatchEvent({ description: desc, debits: debitLines.filter(l => l.accountId && l.amount).map(l => ({ accountId: l.accountId, amount: parseFloat(l.amount) })), credits: creditLines.filter(l => l.accountId && l.amount).map(l => ({ accountId: l.accountId, amount: parseFloat(l.amount) })), date: new Date().toISOString() });
    
    if (balanced) {
      showToast('仕訳が正常に記録されました', 'success', { icon: '✨', action: { label: '↩️ UNDO', onClick: undoLastEvent }});
    } else {
      showToast('危険！世界の崩壊（貸借不一致）に対処してください', 'danger', { icon: '💀', action: { label: '↩️ UNDO', onClick: undoLastEvent }});
    }
    
    setDesc(''); setDebitLines([{ id: Date.now(), accountId: '', amount: '' }]); setCreditLines([{ id: Date.now()+1, accountId: '', amount: '' }]);
    setIsOpen(false);
  };

  const renderLines = (lines, side) => lines.map(l => h('div', { key: l.id, className: "flex gap-2 mb-2" }, [
    h('select', { value: l.accountId, onChange: e => updateLine(side, l.id, 'accountId', e.target.value), className: "flex-1 bg-slate-950/60 border border-white/5 p-3 rounded-xl text-sm appearance-none outline-none text-white" }, [h('option', { value: "" }, "-- 科目 --"), ...(accounts||[]).map(a => h('option', { key: a.id, value: a.id }, a.name))]),
    h('input', { type: "number", placeholder: "金額", value: l.amount, onChange: e => updateLine(side, l.id, 'amount', e.target.value), className: "w-[120px] bg-slate-950/60 border border-white/5 p-3 rounded-xl text-sm font-mono text-cyan-400 outline-none" })
  ]));

  return h(React.Fragment, null, [
    // 呼び出しボタン
    h(AnimatePresence, null, !isOpen && h(motion.div, {
      key: "palette-trigger",
      initial: { opacity: 0, scale: 0.8, y: 20 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.8, y: 20 },
      className: "fixed bottom-8 right-8 z-[100]"
    }, [
      h('button', { 
        onClick: () => setIsOpen(true), 
        className: "px-8 py-3.5 rounded-full bg-slate-900/80 backdrop-blur-xl border border-cyan-500/50 text-cyan-300 shadow-[0_4px_30px_rgba(6,182,212,0.3)] font-bold flex gap-4 items-center hover:scale-105 transition-transform cursor-pointer" 
      }, [
        h('span', null, "⚡️ 仕訳を入力"), 
        h('span', { className: "bg-slate-950 border border-white/10 rounded px-2.5 py-1 text-xs text-slate-400 font-mono" }, "⌘K")
      ])
    ])),

    // パレット本体
    h(AnimatePresence, null, isOpen && h(motion.div, {
      key: "palette-backdrop",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
      className: "fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 backdrop-blur-md",
      onClick: () => setIsOpen(false)
    }, [
      h(motion.div, {
        key: "palette-panel",
        initial: { opacity: 0, y: 30, scale: 0.95 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 20, scale: 0.95 },
        transition: { type: "spring", damping: 25, stiffness: 300 },
        onClick: e => e.stopPropagation(),
        className: `w-full max-w-4xl ${THEME.panel} bg-slate-900/95 border-white/10 relative overflow-hidden`
      }, [
        h('div', { className: "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-cyan-500 opacity-50" }),
        h('h2', { className: `${THEME.h2} mb-6 text-left` }, "Command Palette"),
        h('input', { 
          type: "text", 
          autoFocus: true, 
          placeholder: "取引の説明...", 
          value: desc, 
          onChange: e => setDesc(e.target.value), 
          className: "w-full bg-slate-950/80 border border-white/5 px-6 py-4 rounded-2xl text-lg text-white focus:outline-none mb-6 focus:border-cyan-500/50 transition-colors" 
        }),
        h('div', { className: "grid grid-cols-2 gap-6 mb-6" }, [
          h('div', null, [
            h('div', { className: "flex justify-between items-center mb-4" }, [
              h('span', { className: "text-[10px] font-bold text-cyan-500 uppercase tracking-widest" }, "借方"),
              h('button', { onClick: () => addLine('debit'), className: "w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center hover:bg-cyan-500 hover:text-slate-900 transition-all text-xl font-bold border border-cyan-500/30 cursor-pointer" }, "+")
            ]),
            ...renderLines(debitLines, 'debit')
          ]),
          h('div', null, [
            h('div', { className: "flex justify-between items-center mb-4" }, [
              h('span', { className: "text-[10px] font-bold text-purple-500 uppercase tracking-widest" }, "貸方"),
              h('button', { onClick: () => addLine('credit'), className: "w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center hover:bg-purple-500 hover:text-white transition-all text-xl font-bold border border-purple-500/30 cursor-pointer" }, "+")
            ]),
            ...renderLines(creditLines, 'credit')
          ])
        ]),
        h('div', { className: "flex justify-between items-center pt-4 border-t border-white/5" }, [
          h('span', { className: `font-mono font-bold ${balanced ? 'text-cyan-400' : 'text-red-500'}` }, `差額: ¥${Math.abs(totalD - totalC).toLocaleString()}`),
          h('button', { onClick: handleDispatch, disabled: !desc, className: `${THEME.btnBase} px-10 py-4 text-base ${balanced ? THEME.btnCyan : THEME.btnDanger} disabled:opacity-30` }, balanced ? 'EXECUTE' : '⚠️ FORCE')
        ])
      ])
    ]))
  ]);
}

export function GlobalToast() {
  const n = useLuminousStore(s => s.lastNotification);
  const [vis, setVis] = useState(false);
  const [activeId, setActiveId] = useState(0);

  useEffect(() => {
    if (n?.id > 0 && n.id !== activeId) {
      setVis(true);
      setActiveId(n.id);
    }
  }, [n?.id, activeId]);

  useEffect(() => {
    if (vis && n && !n.persistent) {
      const t = setTimeout(() => setVis(false), 5000);
      return () => clearTimeout(t);
    }
  }, [vis, n?.id, n?.persistent]);

  const typeStyles = {
    success: 'border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.15)] bg-cyan-950/20 text-cyan-100',
    danger: 'border-red-500/50 shadow-[0_0_40px_rgba(239,68,68,0.15)] bg-red-950/20 text-red-100',
    info: 'border-fuchsia-500/50 shadow-[0_0_40px_rgba(192,38,211,0.15)] bg-purple-900/20 text-fuchsia-100'
  };

  return h(AnimatePresence, null, vis && h(motion.div, {
    initial: { y: 100, opacity: 0, x: '-50%' },
    animate: { y: 0, opacity: 1, x: '-50%' },
    exit: { y: 100, opacity: 0, x: '-50%', backdropFilter: 'blur(20px)' },
    className: `fixed bottom-12 left-1/2 z-[9999] px-8 py-5 glass border rounded-[2.5rem] flex items-center gap-5 min-w-[320px] max-w-[90vw] ${typeStyles[n.type] || typeStyles.info}`
  }, [
    h('span', { className: "text-2xl" }, n.icon || (n.type === 'danger' ? '💀' : '✨')),
    h('div', { className: "flex-1 flex flex-col items-start" }, [
      h('span', { className: "text-[10px] uppercase font-bold tracking-[0.2em] opacity-50 mb-0.5" }, n.type),
      h('span', { className: "text-sm font-bold tracking-tight" }, n.message)
    ]),
    n.action && h('button', {
      onClick: () => { n.action.onClick(); setVis(false); },
      className: "ml-4 px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/10 transition-all active:scale-95"
    }, n.action.label),
    n.persistent && h('button', {
      onClick: () => setVis(false),
      className: "ml-2 p-2 opacity-30 hover:opacity-100 transition-opacity"
    }, '✕')
  ]));
}

export function GlobalQuestHUD() {
  const { activeStoryId, activeQuest, stories, clearQuest, showToast } = useLuminousStore();
  
  // フォールバック: activeQuest が null でも activeStoryId があれば stories から復旧
  const quest = activeQuest || (stories || []).find(s => s.id === activeStoryId);
  
  if (!quest) return null;

  const handleClear = () => {
    clearQuest(quest.id);
    showToast(`クエスト「${quest.title}」を達成しました！`, 'success', { icon: '✦' });
  };

  return h(motion.div, {
    initial: { opacity: 0, y: 100 }, animate: { opacity: 1, y: 0 },
    className: `fixed bottom-8 left-8 z-[500] w-[380px] ${THEME.panelCyan} border-cyan-500/30 bg-slate-900/60 shadow-2xl`
  }, [
    h('div', { className: "flex flex-col gap-4 text-left" }, [
      h('div', { className: "flex items-center gap-3" }, [h('div', { className: "w-2 h-2 rounded-full bg-cyan-400 animate-pulse" }), h('span', { className: THEME.labelCyan }, "Active Prophecy")]),
      h('h3', { className: `${THEME.h2} text-xl` }, quest.title),
      h('div', { className: "h-px w-full bg-gradient-to-r from-cyan-500/50 to-transparent" }),
      h('div', { className: "max-h-[250px] overflow-y-auto text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed hide-scroll" }, quest.content),
      h('button', { onClick: handleClear, className: `mt-4 w-full py-4 ${THEME.btnCyan}` }, "✦ Quest Clear")
    ])
  ]);
}

export function GlobalEffects() {
  const questClearedAt = useLuminousStore(s => s.questClearedAt);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (questClearedAt > 0) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [questClearedAt]);

  return h(AnimatePresence, null, flash && h(motion.div, {
    initial: { opacity: 0 }, animate: { opacity: [0, 0.6, 0] }, exit: { opacity: 0 },
    transition: { duration: 1.2 },
    className: "fixed inset-0 pointer-events-none z-[9999] bg-cyan-400/30 mix-blend-screen"
  }));
}
