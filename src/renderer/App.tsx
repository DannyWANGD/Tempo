import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AppData, Preferences, SegmentType, Session } from "../shared/types.js";
import { DEFAULT_PREFERENCES } from "../shared/types.js";
import {
  buildDaySummaries,
  createId,
  daysInMonth,
  formatSeconds,
  localDateKey,
  nextSegment,
  plannedMinutesFor,
  segmentLabel,
  sessionsForDate
} from "../shared/time.js";

type View = "today" | "review" | "settings";

interface TimerSegment {
  type: SegmentType;
  status: "idle" | "running" | "paused";
  remainingSeconds: number;
  elapsedSeconds: number;
  cycleIndex: number;
  startedAt: string | null;
  notice: string;
}

const todayKey = () => localDateKey(new Date());

function buildIdleSegment(type: SegmentType, cycleIndex: number, preferences: Preferences, notice = ""): TimerSegment {
  return {
    type,
    status: "idle",
    remainingSeconds: plannedMinutesFor(type, preferences) * 60,
    elapsedSeconds: 0,
    cycleIndex,
    startedAt: null,
    notice
  };
}

function App() {
  const [view, setView] = useState<View>("today");
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    window.tempo
      .loadAppData()
      .then(setData)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Tempo could not load local data.");
        setData({
          schemaVersion: 1,
          preferences: DEFAULT_PREFERENCES,
          sessions: [],
          daySummaries: []
        });
      });
  }, []);

  const preferences = data?.preferences ?? DEFAULT_PREFERENCES;
  const sessions = data?.sessions ?? [];
  const daySummaries = useMemo(() => buildDaySummaries(sessions), [sessions]);

  async function savePreferences(next: Preferences) {
    const nextData = await window.tempo.savePreferences(next);
    setData(nextData);
  }

  async function saveSession(session: Session) {
    const nextData = await window.tempo.saveSession(session);
    setData(nextData);
  }

  async function importData() {
    const result = await window.tempo.importData();
    if (result.data) setData(result.data);
    return result.message;
  }

  async function resetLocalData() {
    const nextData = await window.tempo.resetLocalData();
    setData(nextData);
  }

  return (
    <main className={`app accent-${preferences.accentColor}`}>
      <aside className="sidebar" aria-label="Primary">
        <div>
          <p className="eyebrow">Tempo</p>
          <h1>Pure Pomodoro Timer</h1>
        </div>
        <nav className="nav">
          <button className={view === "today" ? "active" : ""} onClick={() => setView("today")}>
            Today
          </button>
          <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>
            Review
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            Settings
          </button>
        </nav>
        <div className="sidebar-foot">
          <p>{new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}</p>
          {loadError ? <p className="error-text">{loadError}</p> : null}
        </div>
      </aside>

      {data ? (
        <section className="workspace">
          {view === "today" ? (
            <TodayView preferences={preferences} sessions={sessions} summaries={daySummaries} onSaveSession={saveSession} />
          ) : null}
          {view === "review" ? <ReviewView sessions={sessions} summaries={daySummaries} /> : null}
          {view === "settings" ? (
            <SettingsView
              preferences={preferences}
              onSavePreferences={savePreferences}
              onExport={() => window.tempo.exportData()}
              onImport={importData}
              onReset={resetLocalData}
            />
          ) : null}
        </section>
      ) : (
        <section className="workspace loading">Loading Tempo...</section>
      )}
    </main>
  );
}

interface TodayViewProps {
  preferences: Preferences;
  sessions: Session[];
  summaries: AppData["daySummaries"];
  onSaveSession: (session: Session) => Promise<void>;
}

function TodayView({ preferences, sessions, summaries, onSaveSession }: TodayViewProps) {
  const today = todayKey();
  const todaySessions = useMemo(() => sessionsForDate(sessions, today), [sessions, today]);

  return (
    <div className="today-layout">
      <section className="primary-column">
        <TimerPanel preferences={preferences} onSaveSession={onSaveSession} />
        <DayThread dateKey={today} sessions={todaySessions} />
      </section>
      <aside className="side-column">
        <FocusQuilt summaries={summaries} monthDate={new Date()} compact selectedDate={today} />
        <FocusHerbarium dateKey={today} sessions={todaySessions} />
      </aside>
    </div>
  );
}

interface TimerPanelProps {
  preferences: Preferences;
  onSaveSession: (session: Session) => Promise<void>;
}

function TimerPanel({ preferences, onSaveSession }: TimerPanelProps) {
  const [segment, setSegment] = useState<TimerSegment>(() => buildIdleSegment("focus", 1, preferences));
  const finishingRef = useRef(false);

  useEffect(() => {
    if (segment.status !== "idle" || segment.startedAt) return;
    setSegment((current) => ({
      ...current,
      remainingSeconds: plannedMinutesFor(current.type, preferences) * 60,
      cycleIndex: Math.min(current.cycleIndex, preferences.cycles)
    }));
  }, [preferences, segment.status, segment.startedAt]);

  useEffect(() => {
    if (segment.status !== "running") return undefined;
    const id = window.setInterval(() => {
      setSegment((current) => {
        if (current.status !== "running") return current;
        return {
          ...current,
          remainingSeconds: Math.max(0, current.remainingSeconds - 1),
          elapsedSeconds: current.elapsedSeconds + 1
        };
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [segment.status]);

  useEffect(() => {
    if (segment.status === "running" && segment.remainingSeconds <= 0 && !finishingRef.current) {
      finishingRef.current = true;
      void finishSegment("completed");
    }
  }, [segment.remainingSeconds, segment.status]);

  async function finishSegment(status: "completed" | "interrupted") {
    const snapshot = segment;
    const completed = status === "completed";
    const plannedMinutes = plannedMinutesFor(snapshot.type, preferences);
    const endedAt = new Date().toISOString();
    const startedAt =
      snapshot.startedAt ??
      new Date(Date.now() - Math.max(0, snapshot.elapsedSeconds) * 1000).toISOString();
    const actualSeconds = completed ? plannedMinutes * 60 : snapshot.elapsedSeconds;
    const session: Session = {
      id: createId(),
      type: snapshot.type,
      startedAt,
      endedAt,
      plannedMinutes,
      actualMinutes: Math.max(0, Math.round(actualSeconds / 60)),
      cycleIndex: snapshot.cycleIndex,
      cycleTotal: preferences.cycles,
      status,
      interrupted: !completed,
      note: ""
    };

    await onSaveSession(session);
    maybeNotify(snapshot.type, completed, preferences);
    const next = nextSegment(snapshot.type, snapshot.cycleIndex, preferences.cycles);
    const shouldAutoStart =
      (snapshot.type === "focus" && preferences.autoStartBreaks) ||
      (snapshot.type !== "focus" && preferences.autoStartFocus);

    setSegment({
      ...buildIdleSegment(next.type, next.cycleIndex, preferences, `Next: ${segmentLabel(next.type)}`),
      status: shouldAutoStart ? "running" : "idle",
      startedAt: shouldAutoStart ? new Date().toISOString() : null
    });
    finishingRef.current = false;
  }

  function start() {
    setSegment((current) => ({
      ...current,
      status: "running",
      startedAt: current.startedAt ?? new Date().toISOString(),
      notice: ""
    }));
  }

  function pause() {
    setSegment((current) => ({ ...current, status: "paused" }));
  }

  function reset() {
    finishingRef.current = false;
    setSegment((current) => buildIdleSegment(current.type, current.cycleIndex, preferences, "Reset"));
  }

  function skip() {
    if (segment.status === "idle" && segment.elapsedSeconds === 0 && !segment.startedAt) {
      const next = nextSegment(segment.type, segment.cycleIndex, preferences.cycles);
      setSegment(buildIdleSegment(next.type, next.cycleIndex, preferences, `Skipped to ${segmentLabel(next.type)}`));
      return;
    }
    void finishSegment("interrupted");
  }

  const progress = 1 - segment.remainingSeconds / (plannedMinutesFor(segment.type, preferences) * 60);

  return (
    <section className="timer-panel" aria-label="Timer">
      <div className="timer-meta">
        <span>{segmentLabel(segment.type)}</span>
        <span>
          Cycle {segment.cycleIndex} of {preferences.cycles}
        </span>
      </div>
      <div
        className="timer-face"
        style={{ "--progress": `${Math.max(0, Math.min(1, progress)) * 360}deg` } as CSSProperties}
      >
        <span>{formatSeconds(segment.remainingSeconds)}</span>
      </div>
      <div className="timer-controls">
        {segment.status === "running" ? (
          <button className="primary-button" onClick={pause}>
            Pause
          </button>
        ) : (
          <button className="primary-button" onClick={start}>
            {segment.status === "paused" ? "Resume" : "Start"}
          </button>
        )}
        <button onClick={skip}>Skip</button>
        <button onClick={reset}>Reset</button>
      </div>
      <p className="timer-notice">{segment.notice || statusCopy(segment.status)}</p>
    </section>
  );
}

function statusCopy(status: TimerSegment["status"]): string {
  if (status === "running") return "The current thread is growing.";
  if (status === "paused") return "Paused.";
  return "Ready.";
}

function maybeNotify(type: SegmentType, completed: boolean, preferences: Preferences) {
  if (preferences.soundEnabled) {
    playSoftBell();
  }

  if (!preferences.notificationsEnabled || typeof Notification === "undefined") return;

  const title = completed ? `${segmentLabel(type)} complete` : `${segmentLabel(type)} skipped`;
  if (Notification.permission === "granted") {
    new Notification(title);
  } else if (Notification.permission === "default") {
    void Notification.requestPermission().then((permission) => {
      if (permission === "granted") new Notification(title);
    });
  }
}

function playSoftBell() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.5);
}

interface DayThreadProps {
  dateKey: string;
  sessions: Session[];
}

function DayThread({ dateKey, sessions }: DayThreadProps) {
  const start = new Date(`${dateKey}T06:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  const range = end.getTime() - start.getTime();
  const visible = sessions.filter((session) => new Date(session.endedAt).getTime() >= start.getTime());

  return (
    <section className="visual-section" aria-label="Day Thread">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Day Thread</p>
          <h2>Today in time</h2>
        </div>
        <span>{visible.length} segments</span>
      </div>
      <div className="thread-axis">
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
      <div className="thread-bar">
        {visible.map((session) => {
          const sessionStart = Math.max(new Date(session.startedAt).getTime(), start.getTime());
          const sessionEnd = Math.min(new Date(session.endedAt).getTime(), end.getTime());
          const left = ((sessionStart - start.getTime()) / range) * 100;
          const width = Math.max(1, ((sessionEnd - sessionStart) / range) * 100);
          return (
            <span
              key={session.id}
              className={`thread-segment ${session.type} ${session.interrupted ? "interrupted" : ""}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${segmentLabel(session.type)} | ${new Date(session.startedAt).toLocaleTimeString("en", {
                hour: "2-digit",
                minute: "2-digit"
              })}-${new Date(session.endedAt).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`}
            />
          );
        })}
      </div>
    </section>
  );
}

interface FocusQuiltProps {
  summaries: AppData["daySummaries"];
  monthDate: Date;
  compact?: boolean;
  selectedDate?: string;
  onSelectDate?: (dateKey: string) => void;
}

function FocusQuilt({ summaries, monthDate, compact = false, selectedDate, onSelectDate }: FocusQuiltProps) {
  const summaryMap = useMemo(() => new Map(summaries.map((summary) => [summary.date, summary])), [summaries]);
  const days = daysInMonth(monthDate.getFullYear(), monthDate.getMonth());
  const blanks = days[0]?.getDay() ?? 0;
  const cells = [...Array.from({ length: blanks }, (_, index) => `blank-${index}`), ...days];

  return (
    <section className={`visual-section quilt ${compact ? "compact" : ""}`} aria-label="Focus Quilt">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Focus Quilt</p>
          <h2>
            {monthDate.toLocaleDateString("en", {
              month: "long",
              year: compact ? undefined : "numeric"
            })}
          </h2>
        </div>
      </div>
      <div className="quilt-weekdays" aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
      <div className="quilt-grid">
        {cells.map((item) => {
          if (typeof item === "string") return <span key={item} className="quilt-cell blank" />;
          const date = localDateKey(item);
          const summary = summaryMap.get(date);
          const minutes = summary?.focusedMinutes ?? 0;
          const level = minutes >= 150 ? 4 : minutes >= 100 ? 3 : minutes >= 50 ? 2 : minutes > 0 ? 1 : 0;
          const button = (
            <button
              key={date}
              className={`quilt-cell level-${level} ${selectedDate === date ? "selected" : ""}`}
              title={`${date} | ${minutes} min`}
              onClick={() => onSelectDate?.(date)}
              disabled={!onSelectDate}
            >
              <span>{item.getDate()}</span>
            </button>
          );
          return button;
        })}
      </div>
    </section>
  );
}

interface FocusHerbariumProps {
  dateKey: string;
  sessions: Session[];
}

function FocusHerbarium({ dateKey, sessions }: FocusHerbariumProps) {
  const focusSessions = sessions.filter((session) => session.type === "focus");
  const completed = focusSessions.filter((session) => session.status === "completed");

  return (
    <section className="visual-section herbarium" aria-label="Focus Herbarium">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Focus Herbarium</p>
          <h2>{dateKey}</h2>
        </div>
        <span>{completed.length} leaves</span>
      </div>
      <div className="leaf-board">
        {focusSessions.length === 0 ? <p className="empty-text">No leaves yet.</p> : null}
        {focusSessions.map((session, index) => (
          <span
            key={session.id}
            className={`leaf ${session.interrupted ? "faded" : ""}`}
            title={`${segmentLabel(session.type)} | ${session.actualMinutes} min`}
            style={{ "--turn": `${index % 2 === 0 ? -8 : 8}deg` } as CSSProperties}
          />
        ))}
      </div>
    </section>
  );
}

interface ReviewViewProps {
  sessions: Session[];
  summaries: AppData["daySummaries"];
}

function ReviewView({ sessions, summaries }: ReviewViewProps) {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const selectedSessions = useMemo(() => sessionsForDate(sessions, selectedDate), [sessions, selectedDate]);
  const selectedSummary = summaries.find((summary) => summary.date === selectedDate);

  function moveMonth(delta: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <div className="review-layout">
      <section className="review-main">
        <div className="review-toolbar">
          <button onClick={() => moveMonth(-1)}>Prev</button>
          <button
            onClick={() => {
              const now = new Date();
              setMonthDate(now);
              setSelectedDate(todayKey());
            }}
          >
            Today
          </button>
          <button onClick={() => moveMonth(1)}>Next</button>
        </div>
        <FocusQuilt summaries={summaries} monthDate={monthDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      </section>
      <aside className="review-detail">
        <section className="visual-section stats-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Selected Day</p>
              <h2>{selectedDate}</h2>
            </div>
          </div>
          <div className="stat-grid">
            <Stat label="Focused Minutes" value={selectedSummary?.focusedMinutes ?? 0} />
            <Stat label="Sessions" value={selectedSummary?.completedSessions ?? 0} />
            <Stat label="Cycles" value={selectedSummary?.completedCycles ?? 0} />
            <Stat label="Interrupted" value={selectedSummary?.interruptedSessions ?? 0} />
          </div>
        </section>
        <DayThread dateKey={selectedDate} sessions={selectedSessions} />
        <FocusHerbarium dateKey={selectedDate} sessions={selectedSessions} />
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface SettingsViewProps {
  preferences: Preferences;
  onSavePreferences: (preferences: Preferences) => Promise<void>;
  onExport: () => Promise<{ message: string }>;
  onImport: () => Promise<string>;
  onReset: () => Promise<void>;
}

function SettingsView({ preferences, onSavePreferences, onExport, onImport, onReset }: SettingsViewProps) {
  const [draft, setDraft] = useState(preferences);
  const [message, setMessage] = useState("");

  useEffect(() => setDraft(preferences), [preferences]);

  async function save() {
    await onSavePreferences(draft);
    setMessage("Settings saved.");
  }

  function setNumber(key: "focusLength" | "shortBreakLength" | "longBreakLength" | "cycles", value: string) {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  }

  return (
    <div className="settings-layout">
      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Timer</h2>
          </div>
        </div>
        <div className="form-grid">
          <NumberField label="Focus Length" value={draft.focusLength} min={1} max={180} onChange={(value) => setNumber("focusLength", value)} />
          <NumberField
            label="Short Break"
            value={draft.shortBreakLength}
            min={1}
            max={60}
            onChange={(value) => setNumber("shortBreakLength", value)}
          />
          <NumberField
            label="Long Break"
            value={draft.longBreakLength}
            min={1}
            max={90}
            onChange={(value) => setNumber("longBreakLength", value)}
          />
          <NumberField label="Cycles" value={draft.cycles} min={1} max={12} onChange={(value) => setNumber("cycles", value)} />
        </div>
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2>Flow and appearance</h2>
          </div>
        </div>
        <label className="field">
          <span>Accent Color</span>
          <select
            value={draft.accentColor}
            onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value as Preferences["accentColor"] }))}
          >
            <option value="sage">Sage</option>
            <option value="blue">Dusty Blue</option>
            <option value="rose">Clay Rose</option>
          </select>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={draft.autoStartBreaks}
            onChange={(event) => setDraft((current) => ({ ...current, autoStartBreaks: event.target.checked }))}
          />
          <span>Auto-start Breaks</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={draft.autoStartFocus}
            onChange={(event) => setDraft((current) => ({ ...current, autoStartFocus: event.target.checked }))}
          />
          <span>Auto-start Focus</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={draft.soundEnabled}
            onChange={(event) => setDraft((current) => ({ ...current, soundEnabled: event.target.checked }))}
          />
          <span>Sound</span>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={draft.notificationsEnabled}
            onChange={(event) => setDraft((current) => ({ ...current, notificationsEnabled: event.target.checked }))}
          />
          <span>Notifications</span>
        </label>
        <button className="primary-button" onClick={save}>
          Save Settings
        </button>
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Data</p>
            <h2>Local archive</h2>
          </div>
        </div>
        <div className="data-actions">
          <button
            onClick={async () => {
              const result = await onExport();
              setMessage(result.message);
            }}
          >
            Export Data
          </button>
          <button
            onClick={async () => {
              setMessage(await onImport());
            }}
          >
            Import Data
          </button>
          <button
            className="danger-button"
            onClick={async () => {
              await onReset();
              setMessage("Local data reset.");
            }}
          >
            Reset Local Data
          </button>
        </div>
        <p className="settings-message">{message}</p>
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export default App;
