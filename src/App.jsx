import { useState, useEffect, useRef } from "react";

// 1. FIX: Use the correct model ID
const MODEL_ID = "gemini-3-flash-preview"; 

// 2. FIX: Check both Vite and Cloudflare's variable locations
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are a warm, encouraging ADHD coach named Spark. Break a big overwhelming goal into micro-tasks that feel almost TOO easy to start.

Return ONLY valid JSON, no markdown, no backticks, no explanation.

Rules:
- 6-9 micro-tasks, each under 5 minutes
- Each task starts with a strong action verb
- Warm, zero-pressure language
- Include a short coach_note (1 sentence, specific to the goal)
- Include a first_step (single easiest action to start RIGHT NOW)

Strict JSON format:
{
  "coach_note": "...",
  "first_step": "...",
  "tasks": [
    { "id": 1, "action": "...", "duration": "2 min", "tip": "..." }
  ]
}`;

const STORAGE_KEY = "unstuck_v2";
const placeholders = [
  "Clean my entire apartment...",
  "Start my freelance business...",
  "Reply to all my emails...",
  "Begin my workout routine...",
  "Write my resume...",
  "Organize my finances...",
];

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { history: [], streak: 0, lastCompletedDate: null };
    return JSON.parse(raw);
  } catch { return { history: [], streak: 0, lastCompletedDate: null }; }
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function streakEmoji(n) {
  if (n >= 7) return "🔥";
  if (n >= 3) return "⚡";
  return "✦";
}

export default function App() {
  const [tab, setTab] = useState("decompose");
  const [goal, setGoal] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState({});
  const [appData, setAppData] = useState(loadData);
  const [phIdx, setPhIdx] = useState(0);
  const [phFade, setPhFade] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const completionSaved = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setPhFade(false);
      setTimeout(() => { setPhIdx(i => (i + 1) % placeholders.length); setPhFade(true); }, 350);
    }, 2800);
    return () => clearInterval(iv);
  }, []);

  const completedCount = result ? result.tasks.filter(t => checked[t.id]).length : 0;
  const progress = result ? (completedCount / result.tasks.length) * 100 : 0;
  const allDone = result && completedCount === result.tasks.length;

  useEffect(() => {
    if (allDone && result && !completionSaved.current) {
      completionSaved.current = true;
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 3000);

      const today = todayStr();
      setAppData(prev => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
        let newStreak = prev.streak || 0;
        if (prev.lastCompletedDate === today) {
          // already counted today
        } else if (prev.lastCompletedDate === yesterday) {
          newStreak += 1;
        } else {
          newStreak = 1;
        }

        const entry = {
          id: Date.now(),
          date: today,
          goal,
          tasks: result.tasks.map(t => ({ ...t, done: true })),
          coachNote: result.coach_note,
          completedCount: result.tasks.length,
          totalCount: result.tasks.length,
        };

        const updated = {
          history: [entry, ...prev.history].slice(0, 30),
          streak: newStreak,
          lastCompletedDate: today,
        };
        saveData(updated);
        return updated;
      });
    }
  }, [allDone]);

  const decompose = async () => {
    if (!goal.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setChecked({});
    completionSaved.current = false;

    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nMy overwhelming goal: ${goal}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
      });

      const data = await res.json();
      // Log this to your browser console (F12) so you can see if I'm actually talking!
      console.log("Gemini Response:", data); 
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("Empty response");
      
      // Robust JSON extraction
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      const jsonText = text.substring(jsonStart, jsonEnd);
      
      const parsed = JSON.parse(jsonText);
      setResult(parsed);
    } catch (err) {
      console.error("Full error:", err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setGoal("");
    setChecked({});
    completionSaved.current = false;
  };

  const clearHistory = () => {
    if (window.confirm("Clear all history and streak? This can't be undone.")) {
      const cleared = { history: [], streak: 0, lastCompletedDate: null };
      setAppData(cleared);
      saveData(cleared);
    }
  };

  return (
    <div style={S.root}>
      <div style={S.blob1} />
      <div style={S.blob2} />
      <div style={S.blob3} />

      <div style={S.container}>

        {/* Header */}
        <header style={S.header}>
          <div style={S.badge}>✦ ADHD-friendly</div>
          <h1 style={S.title}><span style={S.accent}>Un</span>stuck.</h1>
          <p style={S.subtitle}>Turn any overwhelming goal into tiny steps your brain can actually start.</p>
        </header>

        {/* Streak bar */}
        {appData.streak > 0 && (
          <div style={S.streakBar}>
            <span style={{ fontSize: "22px" }}>{streakEmoji(appData.streak)}</span>
            <span style={{ flex: 1, fontSize: "14px" }}>
              <strong style={{ color: "#ffb43c" }}>{appData.streak}-day streak</strong>
              <span style={{ color: "#666", marginLeft: "8px", fontSize: "13px" }}>
                {appData.streak >= 7 ? "You're on fire!" : appData.streak >= 3 ? "Keep it going!" : "Nice start!"}
              </span>
            </span>
            <div style={{ display: "flex", gap: "5px" }}>
              {Array.from({ length: Math.min(appData.streak, 7) }).map((_, i) => (
                <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffb43c" }} />
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={S.tabs}>
          {["decompose", "history"].map(t => (
            <button key={t} className="tab-btn" onClick={() => setTab(t)}
              style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}>
              {t === "decompose" ? "✦ Break it down" : `📂 History (${appData.history.length})`}
            </button>
          ))}
        </div>

        {/* Decompose tab */}
        {tab === "decompose" && (
          <div style={{ animation: "fadeUp 0.3s ease both" }}>
            <div style={S.card}>
              <label style={S.label}>What's feeling too big right now?</label>
              <textarea
                style={S.textarea}
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder={phFade ? placeholders[phIdx] : ""}
                rows={3}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) decompose(); }}
              />
              <div style={S.inputFooter}>
                <span style={S.hint}>Ctrl + Enter to submit</span>
                <button
                  className="main-btn"
                  style={{ ...S.btn, ...(!goal.trim() || loading ? S.btnOff : {}) }}
                  onClick={decompose}
                  disabled={!goal.trim() || loading}
                >
                  {loading
                    ? <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={S.spinner} /> Breaking it down...
                      </span>
                    : "Break it down ✦"}
                </button>
              </div>
            </div>

            {error && <div style={S.error}>{error}</div>}

            {result && (
              <div style={{ animation: "fadeUp 0.4s ease both" }}>
                <div style={S.coachNote}>
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>🌱</span>
                  <p style={S.coachText}>{result.coach_note}</p>
                </div>

                <div style={S.firstStep}>
                  <div style={S.firstStepLabel}>START HERE → RIGHT NOW</div>
                  <div style={S.firstStepText}>{result.first_step}</div>
                </div>

                {completedCount > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#888", fontSize: "13px" }}>{completedCount} of {result.tasks.length} done</span>
                      {allDone && (
                        <span style={{ color: "#9ee8cc", fontSize: "13px", animation: "pop 0.4s ease both" }}>
                          {celebrate ? "Saved to history! 🎉" : "You did it! 🎉"}
                        </span>
                      )}
                    </div>
                    <div style={S.progressBg}>
                      <div style={{ ...S.progressFill, width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                  {result.tasks.map((task, i) => (
                    <div
                      key={task.id}
                      className="task-card"
                      onClick={() => setChecked(p => ({ ...p, [task.id]: !p[task.id] }))}
                      style={{
                        ...S.taskCard,
                        ...(checked[task.id] ? S.taskDone : {}),
                        animationDelay: `${i * 70}ms`,
                        animation: "fadeUp 0.4s ease both",
                      }}
                    >
                      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", flex: 1 }}>
                        <div style={{ ...S.checkbox, ...(checked[task.id] ? S.checkboxDone : {}) }}>
                          {checked[task.id] && "✓"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ ...S.taskAction, ...(checked[task.id] ? S.taskStrike : {}) }}>
                            {task.action}
                          </p>
                          {task.tip && <p style={S.taskTip}>💡 {task.tip}</p>}
                        </div>
                      </div>
                      <div style={S.duration}>{task.duration}</div>
                    </div>
                  ))}
                </div>

                <button className="reset-btn" onClick={reset} style={S.resetBtn}>
                  Start a new goal →
                </button>
              </div>
            )}
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div style={{ animation: "fadeUp 0.3s ease both" }}>
            {appData.history.length === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: "42px", marginBottom: "12px" }}>📭</div>
                <p style={{ color: "#666", fontSize: "15px", marginBottom: "6px" }}>No goals completed yet.</p>
                <p style={{ color: "#555", fontSize: "13px", marginBottom: "20px" }}>Complete your first goal to see it here!</p>
                <button className="main-btn" style={S.btn} onClick={() => setTab("decompose")}>
                  Break down a goal ✦
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={S.statsRow}>
                  {[
                    { num: appData.history.length, label: "Goals completed", color: "#f5f0e8" },
                    { num: appData.streak, label: `Day streak ${streakEmoji(appData.streak)}`, color: "#ffb43c" },
                    { num: appData.history.reduce((a, h) => a + h.completedCount, 0), label: "Tasks crushed", color: "#9ee8cc" },
                  ].map(({ num, label, color }) => (
                    <div key={label} style={S.statCard}>
                      <div style={{ fontSize: "28px", fontWeight: "900", color, lineHeight: 1 }}>{num}</div>
                      <div style={{ color: "#666", fontSize: "12px", marginTop: "5px" }}>{label}</div>
                    </div>
                  ))}
                </div>

                {appData.history.map((entry, i) => (
                  <div key={entry.id} className="hist-card"
                    style={{ ...S.histCard, animationDelay: `${i * 60}ms`, animation: "fadeUp 0.4s ease both" }}>
                    <div
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <div style={{ flex: 1 }}>
                        <p style={S.histGoal}>{entry.goal}</p>
                        <p style={{ color: "#666", fontSize: "12px", margin: 0 }}>
                          {formatDate(entry.date)} · {entry.completedCount}/{entry.totalCount} tasks
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "12px" }}>
                        <div style={S.doneBadge}>✓ Done</div>
                        <span style={{ color: "#555", fontSize: "11px" }}>
                          {expandedId === entry.id ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {expandedId === entry.id && (
                      <div style={{ marginTop: "14px", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "14px", animation: "fadeUp 0.25s ease both" }}>
                        <p style={{ color: "#9ee8cc", fontSize: "13px", fontStyle: "italic", marginBottom: "12px" }}>
                          🌱 {entry.coachNote}
                        </p>
                        {entry.tasks.map(t => (
                          <div key={t.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "8px" }}>
                            <span style={{ color: "#9ee8cc", fontSize: "13px", flexShrink: 0, marginTop: "1px" }}>✓</span>
                            <span style={{ color: "#888", fontSize: "14px", textDecoration: "line-through" }}>{t.action}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  className="reset-btn"
                  onClick={clearHistory}
                  style={{ ...S.resetBtn, color: "#e06060", borderColor: "rgba(224,96,96,0.2)", marginTop: "8px" }}
                >
                  Clear all history
                </button>
              </div>
            )}
          </div>
        )}

        <p style={S.footer}>Not a replacement for therapy · Just a thinking partner 🤝</p>
      </div>
    </div>
  );
}

const S = {
  root: { minHeight: "100vh", background: "#0d0d0f", fontFamily: "'Georgia','Times New Roman',serif", position: "relative", overflow: "hidden", paddingBottom: "80px" },
  blob1: { position: "fixed", top: "-100px", left: "-80px", width: "420px", height: "420px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,180,60,0.1) 0%, transparent 70%)", pointerEvents: "none", animation: "pulseBg 6s ease-in-out infinite" },
  blob2: { position: "fixed", bottom: "-60px", right: "-60px", width: "360px", height: "360px", borderRadius: "50%", background: "radial-gradient(circle, rgba(100,220,180,0.08) 0%, transparent 70%)", pointerEvents: "none" },
  blob3: { position: "fixed", top: "50%", left: "65%", width: "280px", height: "280px", borderRadius: "50%", background: "radial-gradient(circle, rgba(180,120,255,0.06) 0%, transparent 70%)", pointerEvents: "none" },
  container: { maxWidth: "640px", margin: "0 auto", padding: "56px 20px 40px", position: "relative", zIndex: 1 },
  header: { textAlign: "center", marginBottom: "32px" },
  badge: { display: "inline-block", background: "rgba(255,180,60,0.1)", border: "1px solid rgba(255,180,60,0.25)", color: "#ffb43c", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", padding: "5px 14px", borderRadius: "20px", marginBottom: "18px" },
  title: { fontSize: "clamp(52px,10vw,78px)", fontWeight: "900", color: "#f5f0e8", margin: "0 0 14px", lineHeight: 1, letterSpacing: "-2px" },
  accent: { color: "#ffb43c" },
  subtitle: { color: "#888", fontSize: "16px", lineHeight: 1.6, maxWidth: "380px", margin: "0 auto", fontStyle: "italic" },
  streakBar: { display: "flex", alignItems: "center", gap: "12px", background: "rgba(255,180,60,0.07)", border: "1px solid rgba(255,180,60,0.15)", borderRadius: "14px", padding: "12px 18px", marginBottom: "20px" },
  tabs: { display: "flex", gap: "6px", marginBottom: "24px", background: "rgba(255,255,255,0.04)", borderRadius: "14px", padding: "5px" },
  tab: { flex: 1, background: "transparent", border: "none", color: "#666", fontSize: "14px", fontFamily: "'Georgia',serif", cursor: "pointer", padding: "10px", borderRadius: "10px", transition: "all 0.2s" },
  tabActive: { background: "rgba(255,180,60,0.12)", color: "#ffb43c", border: "1px solid rgba(255,180,60,0.2)" },
  card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "20px", padding: "26px", marginBottom: "20px" },
  label: { display: "block", color: "#aaa", fontSize: "12px", letterSpacing: "0.06em", marginBottom: "12px", textTransform: "uppercase" },
  textarea: { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "12px", color: "#f5f0e8", fontSize: "16px", lineHeight: 1.6, padding: "13px 15px", resize: "none", fontFamily: "'Georgia',serif", boxSizing: "border-box", transition: "border-color 0.2s" },
  inputFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" },
  hint: { color: "#555", fontSize: "12px" },
  btn: { background: "linear-gradient(135deg,#ffb43c,#ff8c42)", color: "#1a0e00", border: "none", borderRadius: "12px", padding: "11px 22px", fontSize: "15px", fontWeight: "700", cursor: "pointer", fontFamily: "'Georgia',serif", transition: "opacity 0.2s, transform 0.15s" },
  btnOff: { opacity: 0.4, cursor: "not-allowed" },
  spinner: { display: "inline-block", width: "13px", height: "13px", border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "#1a0e00", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  error: { background: "rgba(255,80,80,0.09)", border: "1px solid rgba(255,80,80,0.18)", color: "#ff9090", borderRadius: "12px", padding: "13px 17px", fontSize: "14px", marginBottom: "18px" },
  coachNote: { display: "flex", gap: "12px", alignItems: "flex-start", background: "rgba(100,220,180,0.07)", border: "1px solid rgba(100,220,180,0.14)", borderRadius: "14px", padding: "15px 17px", marginBottom: "14px" },
  coachText: { color: "#9ee8cc", fontSize: "15px", lineHeight: 1.6, margin: 0, fontStyle: "italic" },
  firstStep: { background: "rgba(255,180,60,0.09)", border: "1px solid rgba(255,180,60,0.22)", borderRadius: "14px", padding: "16px 18px", marginBottom: "18px" },
  firstStepLabel: { color: "#ffb43c", fontSize: "10px", fontWeight: "700", letterSpacing: "0.14em", marginBottom: "7px", textTransform: "uppercase" },
  firstStepText: { color: "#f5f0e8", fontSize: "16px", fontWeight: "600", lineHeight: 1.5 },
  progressBg: { height: "4px", background: "rgba(255,255,255,0.07)", borderRadius: "4px", overflow: "hidden" },
  progressFill: { height: "100%", background: "linear-gradient(90deg,#ffb43c,#9ee8cc)", borderRadius: "4px", transition: "width 0.4s ease" },
  taskCard: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "15px 17px", cursor: "pointer", transition: "all 0.2s" },
  taskDone: { background: "rgba(100,220,180,0.05)", border: "1px solid rgba(100,220,180,0.13)", opacity: 0.6 },
  checkbox: { width: "21px", height: "21px", border: "2px solid rgba(255,255,255,0.18)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px", fontSize: "12px", color: "#0d0d0f", fontWeight: "700", transition: "all 0.2s" },
  checkboxDone: { background: "#9ee8cc", borderColor: "#9ee8cc" },
  taskAction: { color: "#f5f0e8", fontSize: "15px", fontWeight: "600", margin: "0 0 4px", lineHeight: 1.4 },
  taskStrike: { textDecoration: "line-through", color: "#555" },
  taskTip: { color: "#555", fontSize: "12px", margin: 0, lineHeight: 1.4, fontStyle: "italic" },
  duration: { color: "#555", fontSize: "11px", flexShrink: 0, marginLeft: "12px", marginTop: "3px", letterSpacing: "0.05em", textTransform: "uppercase" },
  resetBtn: { background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#777", borderRadius: "10px", padding: "10px 20px", fontSize: "14px", cursor: "pointer", fontFamily: "'Georgia',serif", display: "block", margin: "0 auto", transition: "all 0.2s" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "16px" },
  statCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "16px", textAlign: "center" },
  histCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "16px 18px", transition: "border-color 0.2s" },
  histGoal: { color: "#f5f0e8", fontSize: "15px", fontWeight: "600", margin: "0 0 5px", lineHeight: 1.4 },
  doneBadge: { background: "rgba(100,220,180,0.1)", border: "1px solid rgba(100,220,180,0.2)", color: "#9ee8cc", fontSize: "11px", padding: "3px 10px", borderRadius: "20px", whiteSpace: "nowrap" },
  empty: { textAlign: "center", padding: "60px 20px" },
  footer: { textAlign: "center", color: "#444", fontSize: "12px", marginTop: "40px", fontStyle: "italic" },
};
