import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Phone, PhoneOff, PhoneCall, Plus, Play, Square, Upload, FileText, Search, X, Settings as SettingsIcon, TrendingUp, Mail, Download, Trash2, RotateCcw, Check, ChevronRight } from "lucide-react";

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthStr = (dateStr) => dateStr.slice(0, 7);
const fmtMoney = (n) =>
  (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("ru-RU") + " ₽";
const fmtPct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtDur = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const dateLabel = (dateStr) => {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
};

const DEFAULT_SETTINGS = {
  monthGoal: 500000,
  avgCheck: 30000,
  contractorCost: 5000,
  taxPercent: 6,
  email: "",
  fallbackConv: { callDozvon: 0.6, dozvonInteres: 0.35, interesKp: 0.6, kpSale: 0.3 },
};

const STORAGE_KEY = "crm-state-v1";

const emptyState = () => ({
  calls: [],
  blocks: [],
  queue: [],
  settings: DEFAULT_SETTINGS,
});

// ---------- main component ----------
export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [showAddCall, setShowAddCall] = useState(false);
  const [prefillCall, setPrefillCall] = useState(null);
  const [activeBlock, setActiveBlock] = useState(null);
  const [blockElapsed, setBlockElapsed] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState(null);
  const saveTimer = useRef(null);
  const tickRef = useRef(null);

  // load
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setState({ ...emptyState(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) } });
        } else {
          setState(emptyState());
        }
      } catch (e) {
        setState(emptyState());
      }
      setLoaded(true);
    })();
  }, []);

  // debounced save
  useEffect(() => {
    if (!loaded || !state) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(state), false);
      } catch (e) {
        showToast("Не удалось сохранить данные");
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [state, loaded]);

  // block timer tick
  useEffect(() => {
    if (activeBlock) {
      tickRef.current = setInterval(() => setBlockElapsed(Date.now() - activeBlock.start), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
    }
    return () => tickRef.current && clearInterval(tickRef.current);
  }, [activeBlock]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const { calls, blocks, queue, settings } = state || emptyState();

  const update = (fn) => setState((prev) => fn(structuredCloneSafe(prev)));

  // ---------- derived stats ----------
  const today = todayStr();
  const curMonth = monthStr(today);

  const callsToday = useMemo(() => calls.filter((c) => c.date === today), [calls, today]);
  const callsMonth = useMemo(() => calls.filter((c) => monthStr(c.date) === curMonth), [calls, curMonth]);

  const statsOf = (list) => {
    const total = list.length;
    const dozvon = list.filter((c) => c.status === "dozvon").length;
    const nedozvon = list.filter((c) => c.status === "nedozvon").length;
    const interes = list.filter((c) => c.interest === "interes").length;
    const neinteresno = list.filter((c) => c.interest === "neinteresno").length;
    const kp = list.filter((c) => c.kp).length;
    const sales = list.filter((c) => c.sale);
    const revenue = sales.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const cost = sales.length * (Number(settings.contractorCost) || 0);
    const tax = revenue * ((Number(settings.taxPercent) || 0) / 100);
    const profit = revenue - cost - tax;
    return { total, dozvon, nedozvon, interes, neinteresno, kp, sales: sales.length, revenue, profit };
  };

  const sToday = statsOf(callsToday);
  const sMonth = statsOf(callsMonth);

  const conv = (s) => ({
    callDozvon: fmtPct(s.dozvon, s.total),
    dozvonInteres: fmtPct(s.interes, s.dozvon),
    interesKp: fmtPct(s.kp, s.interes),
    kpSale: fmtPct(s.sales, s.kp),
    callSale: fmtPct(s.sales, s.total),
  });
  const convMonth = conv(sMonth);

  const remaining = Math.max(0, settings.monthGoal - sMonth.profit);
  const progressPct = Math.min(100, fmtPct(sMonth.profit, settings.monthGoal));

  const forecast = useMemo(() => {
    const fb = settings.fallbackConv;
    const rateCallDozvon = sMonth.total > 0 ? sMonth.dozvon / sMonth.total : fb.callDozvon;
    const rateDozvonInteres = sMonth.dozvon > 0 ? sMonth.interes / sMonth.dozvon : fb.dozvonInteres;
    const rateInteresKp = sMonth.interes > 0 ? sMonth.kp / sMonth.interes : fb.interesKp;
    const rateKpSale = sMonth.kp > 0 ? sMonth.sales / sMonth.kp : fb.kpSale;
    const profitPerSale =
      sMonth.sales > 0
        ? sMonth.profit / sMonth.sales
        : (Number(settings.avgCheck) || 0) -
          (Number(settings.contractorCost) || 0) -
          (Number(settings.avgCheck) || 0) * ((Number(settings.taxPercent) || 0) / 100);
    const dealsNeeded = profitPerSale > 0 ? Math.ceil(remaining / profitPerSale) : 0;
    const kpNeeded = rateKpSale > 0 ? Math.ceil(dealsNeeded / rateKpSale) : dealsNeeded;
    const interesNeeded = rateInteresKp > 0 ? Math.ceil(kpNeeded / rateInteresKp) : kpNeeded;
    const dozvonNeeded = rateDozvonInteres > 0 ? Math.ceil(interesNeeded / rateDozvonInteres) : interesNeeded;
    const callsNeeded = rateCallDozvon > 0 ? Math.ceil(dozvonNeeded / rateCallDozvon) : dozvonNeeded;
    return { dealsNeeded, kpNeeded, callsNeeded, profitPerSale };
  }, [sMonth, remaining, settings]);

  // ---------- day-by-day table for month ----------
  const monthDays = useMemo(() => {
    const map = {};
    callsMonth.forEach((c) => {
      if (!map[c.date]) map[c.date] = [];
      map[c.date].push(c);
    });
    return Object.keys(map)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((date) => {
        const list = map[date];
        const s = statsOf(list);
        const dayBlocks = blocks.filter((b) => b.date === date);
        const time = dayBlocks.reduce((sum, b) => sum + b.duration, 0);
        return { date, ...s, time };
      });
  }, [callsMonth, blocks]);

  // ---------- add call ----------
  const saveCall = (call) => {
    update((prev) => {
      const record = {
        id: call.id || uid(),
        date: call.date || todayStr(),
        time: call.time || new Date().toTimeString().slice(0, 5),
        company: call.company || "",
        url: call.url || "",
        contact: call.contact || "",
        phone: call.phone || "",
        status: call.status || "dozvon",
        interest: call.status === "dozvon" ? call.interest || null : null,
        kp: call.status === "dozvon" && call.interest === "interes" ? !!call.kp : false,
        sale: !!call.sale,
        amount: call.sale ? Number(call.amount) || 0 : 0,
        comment: call.comment || "",
        callback: !!call.callback,
        callbackDate: call.callback ? call.callbackDate : "",
        blockId: activeBlock ? activeBlock.id : call.blockId || null,
      };
      const idx = prev.calls.findIndex((c) => c.id === record.id);
      if (idx >= 0) prev.calls[idx] = record;
      else prev.calls.unshift(record);
      if (call.fromQueueId) {
        prev.queue = prev.queue.map((q) => (q.id === call.fromQueueId ? { ...q, called: true } : q));
      }
      return prev;
    });
    setShowAddCall(false);
    setPrefillCall(null);
    if (activeBlock) {
      const newCount = activeBlock.count + 1;
      if (newCount >= activeBlock.target) {
        finishBlock(newCount);
      } else {
        setActiveBlock({ ...activeBlock, count: newCount });
      }
    }
  };

  const startBlock = () => {
    setActiveBlock({ id: uid(), start: Date.now(), target: 10, count: 0, date: todayStr() });
    setBlockElapsed(0);
  };

  const finishBlock = (countOverride) => {
    setActiveBlock((cur) => {
      if (!cur) return null;
      const end = Date.now();
      const duration = end - cur.start;
      const count = countOverride != null ? countOverride : cur.count;
      const blockCalls = calls.filter((c) => c.blockId === cur.id);
      const s = statsOf(blockCalls);
      const block = {
        id: cur.id,
        date: cur.date,
        start: cur.start,
        end,
        duration,
        count,
        avgTime: count > 0 ? duration / count : 0,
        dozvon: s.dozvon,
        interes: s.interes,
        kp: s.kp,
      };
      update((prev) => {
        prev.blocks.unshift(block);
        return prev;
      });
      return null;
    });
  };

  // ---------- import docx ----------
  const handleImportFile = async (file) => {
    try {
      const mammoth = await import("mammoth");
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      const lines = result.value.split("\n").map((l) => l.trim()).filter(Boolean);
      const items = lines.map((line) => {
        const parts = line.split(/\t|;|,{1,}(?=\s*[A-ZА-Яa-zа-я0-9+])/).map((p) => p.trim()).filter(Boolean);
        return {
          id: uid(),
          company: parts[0] || line,
          phone: parts.find((p) => /\d{5,}/.test(p)) || "",
          contact: parts[1] && !/\d{5,}/.test(parts[1]) ? parts[1] : "",
          url: parts.find((p) => /\./.test(p) && /[a-zа-я]/i.test(p) && !/\d{5,}/.test(p) && p !== parts[0]) || "",
          called: false,
          added: todayStr(),
        };
      });
      update((prev) => {
        prev.queue = [...items, ...prev.queue];
        return prev;
      });
      showToast(`Импортировано контактов: ${items.length}`);
      setShowImport(false);
    } catch (e) {
      showToast("Не удалось прочитать файл. Проверьте формат .docx");
    }
  };

  const clearCalledQueue = () => {
    update((prev) => {
      prev.queue = prev.queue.filter((q) => !q.called);
      return prev;
    });
  };

  if (!loaded) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center", display: "flex" }}>
        <style>{CSS}</style>
        <div style={{ color: C.textDim, fontFamily: F.body }}>Загрузка…</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      <Sidebar view={view} setView={setView} queueLeft={queue.filter((q) => !q.called).length} />
      <div style={S.main}>
        <TopBar
          settings={settings}
          onAddCall={() => {
            setPrefillCall(null);
            setShowAddCall(true);
          }}
          onImport={() => setShowImport(true)}
        />

        {view === "dashboard" && (
          <Dashboard
            settings={settings}
            sToday={sToday}
            sMonth={sMonth}
            convMonth={convMonth}
            progressPct={progressPct}
            remaining={remaining}
            forecast={forecast}
            activeBlock={activeBlock}
            blockElapsed={blockElapsed}
            onStartBlock={startBlock}
            onFinishBlock={() => finishBlock()}
            blocksToday={blocks.filter((b) => b.date === today)}
            queue={queue}
            onAddCall={() => {
              setPrefillCall(null);
              setShowAddCall(true);
            }}
            onQueueCall={(item) => {
              setPrefillCall({ company: item.company, phone: item.phone, contact: item.contact, url: item.url, fromQueueId: item.id });
              setShowAddCall(true);
            }}
            onReport={() => setShowReport(true)}
          />
        )}

        {view === "stats" && <StatsView monthDays={monthDays} sMonth={sMonth} settings={settings} today={today} />}

        {view === "history" && (
          <HistoryView
            calls={calls}
            onEdit={(c) => {
              setPrefillCall(c);
              setShowAddCall(true);
            }}
            onDelete={(id) =>
              update((prev) => {
                prev.calls = prev.calls.filter((c) => c.id !== id);
                return prev;
              })
            }
          />
        )}

        {view === "settings" && (
          <SettingsView
            settings={settings}
            onChange={(patch) =>
              update((prev) => {
                prev.settings = { ...prev.settings, ...patch };
                return prev;
              })
            }
          />
        )}
      </div>

      {showAddCall && (
        <AddCallModal
          initial={prefillCall}
          activeBlock={activeBlock}
          onClose={() => {
            setShowAddCall(false);
            setPrefillCall(null);
          }}
          onSave={saveCall}
        />
      )}

      {showReport && (
        <ReportModal
          sToday={sToday}
          sMonth={sMonth}
          convMonth={convMonth}
          settings={settings}
          today={today}
          onClose={() => setShowReport(false)}
        />
      )}

      {showImport && (
        <ImportModal
          queue={queue}
          onClose={() => setShowImport(false)}
          onFile={handleImportFile}
          onClearCalled={clearCalledQueue}
          onDeleteItem={(id) =>
            update((prev) => {
              prev.queue = prev.queue.filter((q) => q.id !== id);
              return prev;
            })
          }
          onUseItem={(item) => {
            setPrefillCall({ company: item.company, phone: item.phone, contact: item.contact, url: item.url, fromQueueId: item.id });
            setShowImport(false);
            setShowAddCall(true);
          }}
        />
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

function structuredCloneSafe(obj) {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

// ---------- tokens ----------
const C = {
  bg: "#12151B",
  panel: "#1A1F28",
  panel2: "#20262F",
  line: "#2B323D",
  text: "#EDEFF2",
  textDim: "#8B93A1",
  textFaint: "#5C6472",
  amber: "#E3A23C",
  amberDim: "#8A6526",
  teal: "#4FB0A6",
  tealDim: "#2C5F58",
  red: "#D9756B",
  redDim: "#6E3B36",
  blue: "#6C93D9",
};
const F = {
  head: "'Space Grotesk', 'Inter', sans-serif",
  body: "'Inter', sans-serif",
  num: "'Space Grotesk', 'Inter', sans-serif",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 4px; }
input, select, textarea, button { font-family: ${F.body}; }
input::placeholder, textarea::placeholder { color: ${C.textFaint}; }
button { cursor: pointer; }
.tnum { font-variant-numeric: tabular-nums; }
`;

const S = {
  app: {
    display: "flex",
    minHeight: "600px",
    background: C.bg,
    color: C.text,
    fontFamily: F.body,
    fontSize: 14,
  },
  main: { flex: 1, minWidth: 0, padding: "20px 24px 40px", overflowY: "auto" },
  toast: {
    position: "fixed",
    bottom: 20,
    right: 20,
    background: C.panel2,
    border: `1px solid ${C.line}`,
    padding: "10px 16px",
    borderRadius: 6,
    fontSize: 13,
    color: C.text,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    zIndex: 200,
  },
};

// ---------- Sidebar ----------
function Sidebar({ view, setView, queueLeft }) {
  const items = [
    { id: "dashboard", label: "Пульт" },
    { id: "history", label: "История" },
    { id: "stats", label: "Статистика" },
    { id: "settings", label: "Настройки" },
  ];
  return (
    <div
      style={{
        width: 168,
        flexShrink: 0,
        background: C.panel,
        borderRight: `1px solid ${C.line}`,
        padding: "20px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
      className="sidebar-el"
    >
      <div style={{ padding: "0 10px 20px", fontFamily: F.head, fontWeight: 700, fontSize: 16, letterSpacing: -0.3 }}>
        Прозвон<span style={{ color: C.amber }}>.</span>
      </div>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setView(it.id)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            textAlign: "left",
            padding: "9px 10px",
            borderRadius: 6,
            border: "none",
            background: view === it.id ? C.panel2 : "transparent",
            color: view === it.id ? C.text : C.textDim,
            fontSize: 13.5,
            fontWeight: 500,
          }}
        >
          {it.label}
          {it.id === "dashboard" && queueLeft > 0 && (
            <span style={{ fontSize: 11, color: C.amber, background: "rgba(227,162,60,0.12)", padding: "1px 6px", borderRadius: 10 }}>
              {queueLeft}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- TopBar ----------
function TopBar({ settings, onAddCall, onImport }) {
  const now = new Date();
  const dateFmt = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontFamily: F.head, fontSize: 20, fontWeight: 600 }}>{cap(dateFmt)}</div>
        <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>Цель месяца: {fmtMoney(settings.monthGoal)}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onImport} style={btn.ghost}>
          <Upload size={15} /> Импорт плана
        </button>
        <button onClick={onAddCall} style={btn.primary}>
          <Plus size={16} /> Новый звонок
        </button>
      </div>
    </div>
  );
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const btn = {
  primary: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: C.amber,
    color: "#1A1305",
    border: "none",
    borderRadius: 6,
    padding: "9px 14px",
    fontWeight: 600,
    fontSize: 13.5,
  },
  ghost: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    color: C.textDim,
    border: `1px solid ${C.line}`,
    borderRadius: 6,
    padding: "9px 14px",
    fontWeight: 500,
    fontSize: 13.5,
  },
  small: {
    background: C.panel2,
    color: C.text,
    border: `1px solid ${C.line}`,
    borderRadius: 5,
    padding: "6px 10px",
    fontSize: 12.5,
    fontWeight: 500,
  },
};

// ---------- Dashboard ----------
function Dashboard(props) {
  const {
    settings, sToday, sMonth, convMonth, progressPct, remaining, forecast,
    activeBlock, blockElapsed, onStartBlock, onFinishBlock, blocksToday,
    queue, onAddCall, onQueueCall, onReport,
  } = props;

  const metrics = [
    { label: "Звонки", val: sToday.total, color: C.text },
    { label: "Дозвоны", val: sToday.dozvon, color: C.blue },
    { label: "Не дозвон", val: sToday.nedozvon, color: C.textFaint },
    { label: "Интерес", val: sToday.interes, color: C.teal },
    { label: "Неинтересно", val: sToday.neinteresno, color: C.textFaint },
    { label: "КП", val: sToday.kp, color: C.amber },
    { label: "Продажи", val: sToday.sales, color: C.teal },
    { label: "Выручка", val: fmtMoney(sToday.revenue), color: C.text },
  ];

  const queueLeft = queue.filter((q) => !q.called);

  return (
    <div>
      {/* goal progress */}
      <div style={{ ...card, marginBottom: 16, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>Прибыль за месяц</div>
            <div className="tnum" style={{ fontFamily: F.num, fontSize: 34, fontWeight: 600 }}>
              {fmtMoney(sMonth.profit)}
              <span style={{ fontSize: 15, color: C.textDim, fontWeight: 500 }}> / {fmtMoney(settings.monthGoal)}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: C.textDim }}>Осталось до цели</div>
            <div className="tnum" style={{ fontFamily: F.num, fontSize: 20, fontWeight: 600, color: remaining > 0 ? C.amber : C.teal }}>
              {remaining > 0 ? fmtMoney(remaining) : "Цель достигнута"}
            </div>
          </div>
        </div>
        <div style={{ height: 8, background: C.panel2, borderRadius: 4, marginTop: 14, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: `linear-gradient(90deg, ${C.amberDim}, ${C.amber})`, borderRadius: 4, transition: "width .4s" }} />
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
          <ForecastBit label="Нужно продаж" val={forecast.dealsNeeded} />
          <ForecastBit label="Нужно КП" val={forecast.kpNeeded} />
          <ForecastBit label="Нужно звонков" val={forecast.callsNeeded} />
          <ForecastBit label="Прибыль со сделки" val={fmtMoney(forecast.profitPerSale)} />
        </div>
      </div>

      {/* today metrics */}
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8, fontWeight: 600, letterSpacing: 0.2 }}>Сегодня</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 20 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ ...card, padding: "14px 14px" }}>
            <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 6 }}>{m.label}</div>
            <div className="tnum" style={{ fontFamily: F.num, fontSize: 22, fontWeight: 600, color: m.color }}>{m.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, alignItems: "start" }} className="dash-grid">
        {/* left: block + conversions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>Блок звонков</div>
              {activeBlock ? (
                <button onClick={onFinishBlock} style={{ ...btn.small, color: C.red, borderColor: C.redDim }}>
                  <Square size={12} style={{ marginRight: 4 }} /> Завершить
                </button>
              ) : (
                <button onClick={onStartBlock} style={{ ...btn.small, color: C.teal, borderColor: C.tealDim }}>
                  <Play size={12} style={{ marginRight: 4 }} /> Начать блок 10
                </button>
              )}
            </div>
            {activeBlock ? (
              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.textDim }}>Время</div>
                  <div className="tnum" style={{ fontFamily: F.num, fontSize: 24, fontWeight: 600 }}>{fmtDur(blockElapsed)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.textDim }}>Звонков в блоке</div>
                  <div className="tnum" style={{ fontFamily: F.num, fontSize: 24, fontWeight: 600, color: C.amber }}>{activeBlock.count} / {activeBlock.target}</div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12.5, color: C.textDim }}>
                Блок помогает держать темп — 10 звонков подряд с замером времени.
              </div>
            )}
            {blocksToday.length > 0 && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Блоки сегодня</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {blocksToday.map((b) => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.textDim }}>
                      <span>{new Date(b.start).toTimeString().slice(0, 5)}–{new Date(b.end).toTimeString().slice(0, 5)}</span>
                      <span>{b.count} звонков</span>
                      <span>{fmtDur(b.duration)}</span>
                      <span>~{fmtDur(b.avgTime)}/зв</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 12 }}>Конверсия за месяц</div>
            <ConvRow label="Звонок → дозвон" pct={convMonth.callDozvon} />
            <ConvRow label="Дозвон → интерес" pct={convMonth.dozvonInteres} />
            <ConvRow label="Интерес → КП" pct={convMonth.interesKp} />
            <ConvRow label="КП → продажа" pct={convMonth.kpSale} />
            <ConvRow label="Звонок → продажа" pct={convMonth.callSale} accent />
          </div>
        </div>

        {/* right: plan queue */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>План на сегодня</div>
            <span style={{ fontSize: 12, color: C.textDim }}>{queueLeft.length} осталось</span>
          </div>
          {queueLeft.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.textDim, padding: "10px 0" }}>
              Список пуст. Загрузите .docx со списком компаний через «Импорт плана».
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {queueLeft.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onQueueCall(item)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: C.panel2,
                    border: `1px solid ${C.line}`,
                    borderRadius: 6,
                    padding: "9px 11px",
                    textAlign: "left",
                    color: C.text,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.company}</div>
                    <div style={{ fontSize: 11, color: C.textDim }}>{item.phone || "без телефона"}{item.contact ? ` · ${item.contact}` : ""}</div>
                  </div>
                  <ChevronRight size={15} color={C.textFaint} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button onClick={onReport} style={{ ...btn.ghost, marginTop: 18 }}>
        <FileText size={15} /> Сформировать отчёт за сегодня
      </button>
    </div>
  );
}

function ForecastBit({ label, val }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textDim }}>{label}</div>
      <div className="tnum" style={{ fontFamily: F.num, fontSize: 16, fontWeight: 600, color: C.text }}>{val}</div>
    </div>
  );
}

function ConvRow({ label, pct, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
      <div style={{ width: 130, fontSize: 12.5, color: C.textDim, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: C.panel2, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: accent ? C.amber : C.blue, borderRadius: 3 }} />
      </div>
      <div className="tnum" style={{ width: 34, fontSize: 12.5, textAlign: "right", color: C.text }}>{pct}%</div>
    </div>
  );
}

const card = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  padding: 16,
};

// ---------- Stats view ----------
function StatsView({ monthDays, sMonth, settings, today }) {
  const cols = ["Дата", "Звонки", "Дозвоны", "Не дозвон", "Интерес", "Неинтересно", "КП", "Продажи", "Выручка", "Прибыль", "Время"];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
        <SumCard label="Звонки за месяц" val={sMonth.total} />
        <SumCard label="Продажи" val={sMonth.sales} />
        <SumCard label="Выручка" val={fmtMoney(sMonth.revenue)} />
        <SumCard label="Прибыль" val={fmtMoney(sMonth.profit)} accent />
      </div>
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 780 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} style={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthDays.length === 0 && (
              <tr>
                <td colSpan={cols.length} style={{ ...td, textAlign: "center", color: C.textDim, padding: 24 }}>
                  Пока нет звонков в этом месяце
                </td>
              </tr>
            )}
            {monthDays.map((d) => (
              <tr key={d.date} style={{ background: d.date === today ? "rgba(227,162,60,0.06)" : "transparent" }}>
                <td style={td}>{dateLabel(d.date)}</td>
                <td style={td}>{d.total}</td>
                <td style={td}>{d.dozvon}</td>
                <td style={td}>{d.nedozvon}</td>
                <td style={td}>{d.interes}</td>
                <td style={td}>{d.neinteresno}</td>
                <td style={td}>{d.kp}</td>
                <td style={td}>{d.sales}</td>
                <td style={td}>{fmtMoney(d.revenue)}</td>
                <td style={{ ...td, color: d.profit >= 0 ? C.teal : C.red }}>{fmtMoney(d.profit)}</td>
                <td style={td}>{d.time ? fmtDur(d.time) : "—"}</td>
              </tr>
            ))}
          </tbody>
          {monthDays.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ ...td, fontWeight: 600 }}>Итого</td>
                <td style={{ ...td, fontWeight: 600 }}>{sMonth.total}</td>
                <td style={{ ...td, fontWeight: 600 }}>{sMonth.dozvon}</td>
                <td style={{ ...td, fontWeight: 600 }}>{sMonth.nedozvon}</td>
                <td style={{ ...td, fontWeight: 600 }}>{sMonth.interes}</td>
                <td style={{ ...td, fontWeight: 600 }}>{sMonth.neinteresno}</td>
                <td style={{ ...td, fontWeight: 600 }}>{sMonth.kp}</td>
                <td style={{ ...td, fontWeight: 600 }}>{sMonth.sales}</td>
                <td style={{ ...td, fontWeight: 600 }}>{fmtMoney(sMonth.revenue)}</td>
                <td style={{ ...td, fontWeight: 600, color: sMonth.profit >= 0 ? C.teal : C.red }}>{fmtMoney(sMonth.profit)}</td>
                <td style={td}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
function SumCard({ label, val, accent }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 6 }}>{label}</div>
      <div className="tnum" style={{ fontFamily: F.num, fontSize: 20, fontWeight: 600, color: accent ? C.amber : C.text }}>{val}</div>
    </div>
  );
}
const th = { textAlign: "left", padding: "10px 12px", color: C.textDim, fontWeight: 500, fontSize: 11.5, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };
const td = { padding: "9px 12px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" };

// ---------- History view ----------
function HistoryView({ calls, onEdit, onDelete }) {
  const [date, setDate] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (date && c.date !== date) return false;
      if (q && !c.company.toLowerCase().includes(q.toLowerCase())) return false;
      if (filter === "kp" && !c.kp) return false;
      if (filter === "interes" && c.interest !== "interes") return false;
      if (filter === "sale" && !c.sale) return false;
      if (filter === "callback" && !c.callback) return false;
      return true;
    });
  }, [calls, date, q, filter]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} color={C.textFaint} style={{ position: "absolute", left: 10, top: 10 }} />
          <input placeholder="Поиск по компании" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, width: "100%", paddingLeft: 30 }} />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={input}>
          <option value="all">Все</option>
          <option value="kp">КП отправлено</option>
          <option value="interes">Интерес</option>
          <option value="sale">Продажа</option>
          <option value="callback">Перезвонить</option>
        </select>
        {date && (
          <button onClick={() => setDate("")} style={btn.ghost}>
            <X size={13} /> Сбросить дату
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && <div style={{ color: C.textDim, fontSize: 13, padding: 20, textAlign: "center" }}>Ничего не найдено</div>}
        {filtered.map((c) => (
          <div key={c.id} style={{ ...card, padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.company || "Без названия"}</span>
                <Badge status={c.status} interest={c.interest} kp={c.kp} sale={c.sale} callback={c.callback} />
              </div>
              <div style={{ fontSize: 12, color: C.textDim }}>
                {dateLabel(c.date)} · {c.time} {c.contact ? `· ${c.contact}` : ""} {c.phone ? `· ${c.phone}` : ""}
              </div>
              {c.comment && <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{c.comment}</div>}
              {c.callback && c.callbackDate && (
                <div style={{ fontSize: 12, color: C.amber, marginTop: 4 }}>Перезвонить: {dateLabel(c.callbackDate)}</div>
              )}
              {c.sale && <div style={{ fontSize: 12, color: C.teal, marginTop: 4 }}>Сумма сделки: {fmtMoney(c.amount)}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <button onClick={() => onEdit(c)} style={btn.small}>Изменить</button>
              <button onClick={() => onDelete(c.id)} style={{ ...btn.small, color: C.red }}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ status, interest, kp, sale, callback }) {
  const chips = [];
  if (status === "dozvon") chips.push({ t: "Дозвон", c: C.blue });
  if (status === "nedozvon") chips.push({ t: "Не дозвон", c: C.textFaint });
  if (interest === "interes") chips.push({ t: "Интерес", c: C.teal });
  if (interest === "neinteresno") chips.push({ t: "Неинтересно", c: C.textFaint });
  if (kp) chips.push({ t: "КП", c: C.amber });
  if (sale) chips.push({ t: "Продажа", c: C.teal });
  if (callback) chips.push({ t: "Перезвонить", c: C.red });
  return (
    <>
      {chips.map((ch, i) => (
        <span key={i} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 10, background: `${ch.c}22`, color: ch.c, fontWeight: 600 }}>
          {ch.t}
        </span>
      ))}
    </>
  );
}

const input = {
  background: C.panel2,
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13,
};

// ---------- Settings ----------
function SettingsView({ settings, onChange }) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);
  const set = (k, v) => setLocal((p) => ({ ...p, [k]: v }));
  const save = () => onChange(local);

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Цель прибыли за месяц, ₽">
          <input type="number" value={local.monthGoal} onChange={(e) => set("monthGoal", Number(e.target.value))} style={input} />
        </Field>
        <Field label="Средний чек, ₽">
          <input type="number" value={local.avgCheck} onChange={(e) => set("avgCheck", Number(e.target.value))} style={input} />
        </Field>
        <Field label="Стоимость подрядчика на сделку, ₽">
          <input type="number" value={local.contractorCost} onChange={(e) => set("contractorCost", Number(e.target.value))} style={input} />
        </Field>
        <Field label="Налог, % от выручки">
          <input type="number" value={local.taxPercent} onChange={(e) => set("taxPercent", Number(e.target.value))} style={input} />
        </Field>
        <Field label="Email для отчётов">
          <input type="email" placeholder="you@mail.ru" value={local.email} onChange={(e) => set("email", e.target.value)} style={input} />
        </Field>
        <button onClick={save} style={{ ...btn.primary, alignSelf: "flex-start" }}>Сохранить</button>
      </div>
      <div style={{ fontSize: 12, color: C.textFaint, marginTop: 14, lineHeight: 1.5 }}>
        Приложение работает в браузере и не имеет своего сервера, поэтому не может само отправлять письма по SMTP —
        а хранить пароль от почты во frontend небезопасно в принципе. Кнопка «Отправить на email» в отчёте открывает
        письмо в вашей обычной почтовой программе с уже заполненным текстом — останется нажать «отправить». Если нужна
        именно автоматическая отправка без вашего участия, для этого потребуется отдельный backend — это можно добавить
        следующим шагом.
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12.5, color: C.textDim }}>{label}</span>
      {children}
    </label>
  );
}

// ---------- Add Call Modal ----------
function AddCallModal({ initial, activeBlock, onClose, onSave }) {
  const [f, setF] = useState({
    id: initial?.id,
    company: initial?.company || "",
    url: initial?.url || "",
    contact: initial?.contact || "",
    phone: initial?.phone || "",
    status: initial?.status || "dozvon",
    interest: initial?.interest || null,
    kp: initial?.kp || false,
    sale: initial?.sale || false,
    amount: initial?.amount || "",
    comment: initial?.comment || "",
    callback: initial?.callback || false,
    callbackDate: initial?.callbackDate || "",
    date: initial?.date || todayStr(),
    time: initial?.time || new Date().toTimeString().slice(0, 5),
    fromQueueId: initial?.fromQueueId,
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const canSave = f.company.trim().length > 0;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={modalHead}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{initial?.id ? "Изменить звонок" : "Новый звонок"}</div>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        {activeBlock && !initial?.id && (
          <div style={{ fontSize: 12, color: C.amber, marginBottom: 10 }}>Звонок №{activeBlock.count + 1} в текущем блоке</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Компания *"><input autoFocus style={input} value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="Ссылка на сайт"><input style={input} value={f.url} onChange={(e) => set("url", e.target.value)} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Контакт/имя"><input style={input} value={f.contact} onChange={(e) => set("contact", e.target.value)} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Телефон"><input style={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field></div>
          </div>

          <Field label="Результат">
            <div style={{ display: "flex", gap: 8 }}>
              <ToggleBtn active={f.status === "dozvon"} onClick={() => set("status", "dozvon")} icon={<PhoneCall size={13} />}>Дозвонился</ToggleBtn>
              <ToggleBtn active={f.status === "nedozvon"} onClick={() => { set("status", "nedozvon"); set("interest", null); set("kp", false); set("sale", false); }} icon={<PhoneOff size={13} />}>Не дозвонился</ToggleBtn>
            </div>
          </Field>

          {f.status === "dozvon" && (
            <>
              <Field label="Реакция">
                <div style={{ display: "flex", gap: 8 }}>
                  <ToggleBtn active={f.interest === "interes"} onClick={() => set("interest", "interes")} color={C.teal}>Интерес</ToggleBtn>
                  <ToggleBtn active={f.interest === "neinteresno"} onClick={() => { set("interest", "neinteresno"); set("kp", false); set("sale", false); }} color={C.textFaint}>Неинтересно</ToggleBtn>
                </div>
              </Field>
              {f.interest === "interes" && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={f.kp} onChange={(e) => set("kp", e.target.checked)} />
                    КП отправлено
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={f.sale} onChange={(e) => set("sale", e.target.checked)} />
                    Продажа
                  </label>
                  {f.sale && (
                    <Field label="Сумма сделки, ₽">
                      <input type="number" style={input} value={f.amount} onChange={(e) => set("amount", e.target.value)} />
                    </Field>
                  )}
                </>
              )}
            </>
          )}

          <Field label="Комментарий">
            <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} value={f.comment} onChange={(e) => set("comment", e.target.value)} />
          </Field>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={f.callback} onChange={(e) => set("callback", e.target.checked)} />
            Перезвонить
          </label>
          {f.callback && (
            <Field label="Дата следующего контакта">
              <input type="date" style={input} value={f.callbackDate} onChange={(e) => set("callbackDate", e.target.value)} />
            </Field>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn.ghost}>Отмена</button>
          <button disabled={!canSave} onClick={() => onSave(f)} style={{ ...btn.primary, opacity: canSave ? 1 : 0.5 }}>
            <Check size={15} /> Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
function ToggleBtn({ active, onClick, children, icon, color }) {
  const c = color || C.blue;
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "9px 8px",
        borderRadius: 6,
        border: `1px solid ${active ? c : C.line}`,
        background: active ? `${c}1f` : "transparent",
        color: active ? c : C.textDim,
        fontSize: 12.5,
        fontWeight: 500,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(8,10,14,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 100,
};
const modal = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  padding: 20,
  width: "100%",
  maxHeight: "88vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};
const modalHead = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
const iconBtn = { background: "transparent", border: "none", color: C.textDim, padding: 4 };

// ---------- Report modal ----------
function buildReportText(sToday, sMonth, convMonth, settings, today) {
  return [
    `ОТЧЁТ ЗА ${dateLabel(today)}`,
    ``,
    `Звонки: ${sToday.total}`,
    `Дозвоны: ${sToday.dozvon}`,
    `Не дозвон: ${sToday.nedozvon}`,
    `Интерес: ${sToday.interes}`,
    `Неинтересно: ${sToday.neinteresno}`,
    `КП: ${sToday.kp}`,
    `Продажи: ${sToday.sales}`,
    `Выручка: ${fmtMoney(sToday.revenue)}`,
    `Прибыль: ${fmtMoney(sToday.profit)}`,
    ``,
    `Конверсии (за месяц): звонок→дозвон ${convMonth.callDozvon}%, дозвон→интерес ${convMonth.dozvonInteres}%, интерес→КП ${convMonth.interesKp}%, КП→продажа ${convMonth.kpSale}%, звонок→продажа ${convMonth.callSale}%`,
    ``,
    `НАКОПИТЕЛЬНЫЙ ИТОГ МЕСЯЦА`,
    `Звонки: ${sMonth.total}`,
    `Продажи: ${sMonth.sales}`,
    `Выручка: ${fmtMoney(sMonth.revenue)}`,
    `Прибыль: ${fmtMoney(sMonth.profit)} из цели ${fmtMoney(settings.monthGoal)}`,
  ].join("\n");
}

function ReportModal({ sToday, sMonth, convMonth, settings, today, onClose }) {
  const text = buildReportText(sToday, sMonth, convMonth, settings, today);

  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `otchet-${today}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mailHref = `mailto:${settings.email || ""}?subject=${encodeURIComponent("Отчёт за " + dateLabel(today))}&body=${encodeURIComponent(text)}`;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={modalHead}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Отчёт за {dateLabel(today)}</div>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <textarea readOnly value={text} style={{ ...input, width: "100%", minHeight: 260, fontFamily: F.num, fontSize: 12.5, lineHeight: 1.6 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={download} style={btn.ghost}><Download size={14} /> Скачать .txt</button>
          <a href={mailHref} style={{ ...btn.primary, textDecoration: "none" }}><Mail size={14} /> Открыть в почте</a>
        </div>
      </div>
    </div>
  );
}

// ---------- Import modal ----------
function ImportModal({ queue, onClose, onFile, onClearCalled, onDeleteItem, onUseItem }) {
  const fileRef = useRef(null);
  const calledCount = queue.filter((q) => q.called).length;
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={modalHead}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Импорт плана на день</div>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${C.line}`,
            borderRadius: 8,
            padding: 24,
            textAlign: "center",
            cursor: "pointer",
            color: C.textDim,
            fontSize: 13,
          }}
        >
          <Upload size={20} style={{ marginBottom: 8 }} />
          <div>Загрузите .docx со списком компаний</div>
          <div style={{ fontSize: 11.5, marginTop: 4, color: C.textFaint }}>
            По одной компании на строку. В строке можно через табуляцию/точку с запятой указать телефон и контакт.
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>

        {queue.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.textDim }}>В плане: {queue.length}{calledCount > 0 ? `, обработано: ${calledCount}` : ""}</div>
              {calledCount > 0 && (
                <button onClick={onClearCalled} style={btn.small}><RotateCcw size={12} style={{ marginRight: 4 }} /> Убрать обработанные</button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {queue.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: C.panel2, borderRadius: 6, opacity: item.called ? 0.5 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.company}</div>
                    <div style={{ fontSize: 11, color: C.textDim }}>{item.phone || "—"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!item.called && <button onClick={() => onUseItem(item)} style={btn.small}>Звонок</button>}
                    <button onClick={() => onDeleteItem(item.id)} style={{ ...btn.small, color: C.red }}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
