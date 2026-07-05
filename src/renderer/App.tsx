import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { AppData, DayJournal, InboxItem, Preferences, SegmentType, Session, Task } from "../shared/types.js";
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
const tomorrowKey = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateKey(tomorrow);
};

const endDayPromptItems = [
  "What actually got finished today?",
  "What protected or improved your focus?",
  "What slowed you down or interrupted the day?",
  "What is the first concrete step for tomorrow?"
];

function taskOrderValue(task: Task, fallbackIndex = 0): number {
  return typeof task.sortOrder === "number" ? task.sortOrder : fallbackIndex + 1000;
}

function sortTasksForDisplay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const order = taskOrderValue(a) - taskOrderValue(b);
    if (order !== 0) return order;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function nextTaskSortOrder(tasks: Task[], dateKey: string): number {
  const sameDay = tasks.filter((task) => task.date === dateKey);
  if (sameDay.length === 0) return 1;
  return Math.max(...sameDay.map((task, index) => taskOrderValue(task, index))) + 1;
}

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
  const [focusMode, setFocusMode] = useState(false);

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
          tasks: [],
          dayJournals: [],
          inboxItems: [],
          daySummaries: []
        });
      });
  }, []);

  const preferences = data?.preferences ?? DEFAULT_PREFERENCES;
  const sessions = data?.sessions ?? [];
  const tasks = data?.tasks ?? [];
  const dayJournals = data?.dayJournals ?? [];
  const inboxItems = data?.inboxItems ?? [];
  const daySummaries = useMemo(() => buildDaySummaries(sessions), [sessions]);

  async function savePreferences(next: Preferences) {
    const nextData = await window.tempo.savePreferences(next);
    setData(nextData);
  }

  async function saveSession(session: Session) {
    const nextData = await window.tempo.saveSession(session);
    setData(nextData);
    return nextData;
  }

  async function updateSession(session: Session) {
    const nextData = await window.tempo.updateSession(session);
    setData(nextData);
    return nextData;
  }

  async function saveTask(task: Task) {
    const nextData = await window.tempo.saveTask(task);
    setData(nextData);
    return nextData;
  }

  async function deleteTask(taskId: string) {
    const nextData = await window.tempo.deleteTask(taskId);
    setData(nextData);
    return nextData;
  }

  async function saveDayJournal(journal: DayJournal) {
    const nextData = await window.tempo.saveDayJournal(journal);
    setData(nextData);
    return nextData;
  }

  async function saveInboxItem(item: InboxItem) {
    if (typeof window.tempo.saveInboxItem !== "function") {
      throw new Error("Inbox storage is not loaded. Restart Tempo and try again.");
    }
    const nextData = await window.tempo.saveInboxItem(item);
    setData(nextData);
    return nextData;
  }

  async function deleteInboxItem(itemId: string) {
    if (typeof window.tempo.deleteInboxItem !== "function") {
      throw new Error("Inbox storage is not loaded. Restart Tempo and try again.");
    }
    const nextData = await window.tempo.deleteInboxItem(itemId);
    setData(nextData);
    return nextData;
  }

  async function convertInboxItemToTask(item: InboxItem, dateKey: string) {
    const now = new Date().toISOString();
    const nextTask: Task = {
      id: createId("task"),
      title: item.text,
      date: dateKey,
      status: "open",
      sortOrder: nextTaskSortOrder(tasks, dateKey),
      completedSessionIds: [],
      createdAt: now,
      updatedAt: now
    };
    await saveTask(nextTask);
    return deleteInboxItem(item.id);
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
    <main className={`app accent-${preferences.accentColor} ${focusMode ? "focus-mode" : ""}`}>
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-block">
          <p className="eyebrow">Tempo</p>
          <h1>Make Time Bloom</h1>
          <p className="brand-copy">One honest session can change the shape of your day.</p>
        </div>
        {data ? (
          <InboxPanel
            items={inboxItems}
            onSaveItem={saveInboxItem}
            onDeleteItem={deleteInboxItem}
            onConvertToTask={convertInboxItemToTask}
          />
        ) : null}
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
          <div className="view-pane" hidden={view !== "today"} aria-hidden={view !== "today"}>
            <TodayView
              preferences={preferences}
              sessions={sessions}
              tasks={tasks}
              dayJournals={dayJournals}
              summaries={daySummaries}
              onSaveSession={saveSession}
              onUpdateSession={updateSession}
              onSaveTask={saveTask}
              onDeleteTask={deleteTask}
              onSaveDayJournal={saveDayJournal}
              onFocusModeChange={setFocusMode}
            />
          </div>
          <div className="view-pane" hidden={view !== "review"} aria-hidden={view !== "review"}>
            <ReviewView
              sessions={sessions}
              tasks={tasks}
              dayJournals={dayJournals}
              summaries={daySummaries}
              onUpdateSession={updateSession}
              onSaveDayJournal={saveDayJournal}
            />
          </div>
          <div className="view-pane" hidden={view !== "settings"} aria-hidden={view !== "settings"}>
            <SettingsView
              preferences={preferences}
              onSavePreferences={savePreferences}
              onExport={() => window.tempo.exportData()}
              onImport={importData}
              onReset={resetLocalData}
            />
          </div>
        </section>
      ) : (
        <section className="workspace loading">Loading Tempo...</section>
      )}
    </main>
  );
}

interface InboxPanelProps {
  items: InboxItem[];
  onSaveItem: (item: InboxItem) => Promise<AppData>;
  onDeleteItem: (itemId: string) => Promise<AppData>;
  onConvertToTask: (item: InboxItem, dateKey: string) => Promise<AppData>;
}

function InboxPanel({ items, onSaveItem, onDeleteItem, onConvertToTask }: InboxPanelProps) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  async function addItem() {
    const text = draft.trim();
    if (!text) {
      setMessage("Type an idea first.");
      draftRef.current?.focus();
      return;
    }

    const now = new Date().toISOString();
    setSaving(true);
    setMessage("");
    try {
      await onSaveItem({
        id: createId("inbox"),
        text,
        createdAt: now,
        updatedAt: now
      });
      setDraft("");
      setMessage("Added.");
      draftRef.current?.focus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inbox could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="inbox-panel" aria-label="Inbox">
      <div className="inbox-heading">
        <span>Inbox</span>
        <small>{items.length}</small>
      </div>
      <form
        className="inbox-entry"
        onSubmit={(event) => {
          event.preventDefault();
          void addItem();
        }}
      >
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage("");
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              void addItem();
            }
          }}
          placeholder="Capture a thought"
          rows={3}
        />
        <button className="primary-button" type="button" onClick={() => void addItem()} disabled={saving}>
          {saving ? "Adding" : "Add"}
        </button>
        {message ? <p className="inbox-message">{message}</p> : null}
      </form>
      <div className="inbox-list">
        {items.length === 0 ? <p className="empty-text">No ideas yet.</p> : null}
        {items.map((item) => (
          <InboxItemRow
            key={item.id}
            item={item}
            onSaveItem={onSaveItem}
            onDeleteItem={onDeleteItem}
            onConvertToTask={onConvertToTask}
          />
        ))}
      </div>
    </section>
  );
}

function InboxItemRow({
  item,
  onSaveItem,
  onDeleteItem,
  onConvertToTask
}: {
  item: InboxItem;
  onSaveItem: (item: InboxItem) => Promise<AppData>;
  onDeleteItem: (itemId: string) => Promise<AppData>;
  onConvertToTask: (item: InboxItem, dateKey: string) => Promise<AppData>;
}) {
  const [draft, setDraft] = useState(item.text);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(item.text);
    setMessage("");
  }, [item]);

  async function save() {
    const text = draft.trim();
    if (!text) {
      setMessage("Use Delete to remove this idea.");
      return;
    }
    setBusy(true);
    try {
      await onSaveItem({
        ...item,
        text,
        updatedAt: new Date().toISOString()
      });
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inbox could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this Inbox item?")) return;
    setBusy(true);
    try {
      await onDeleteItem(item.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inbox item could not be deleted.");
      setBusy(false);
    }
  }

  async function convert(dateKey: string) {
    const text = draft.trim();
    if (!text) {
      setMessage("Type an idea before converting.");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await onConvertToTask({ ...item, text, updatedAt: now }, dateKey);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not convert idea.");
      setBusy(false);
    }
  }

  return (
    <div className="inbox-item">
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setMessage("");
        }}
        rows={rowsForText(draft, 24, 3, 7)}
      />
      <div className="inbox-item-actions">
        <button onClick={() => void save()} disabled={busy || draft.trim() === item.text.trim()}>
          Save
        </button>
        <button onClick={() => void convert(todayKey())} disabled={busy || !draft.trim()}>
          Today
        </button>
        <button onClick={() => void convert(tomorrowKey())} disabled={busy || !draft.trim()}>
          Tomorrow
        </button>
        <button className="danger-button" onClick={() => void remove()} disabled={busy}>
          Delete
        </button>
        {message ? <span>{message}</span> : null}
      </div>
    </div>
  );
}

function rowsForText(text: string, charactersPerLine: number, minRows: number, maxRows: number): number {
  const visualRows = text
    .split(/\r\n|\r|\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return Math.min(maxRows, Math.max(minRows, visualRows));
}

interface TodayViewProps {
  preferences: Preferences;
  sessions: Session[];
  tasks: Task[];
  dayJournals: DayJournal[];
  summaries: AppData["daySummaries"];
  onSaveSession: (session: Session) => Promise<AppData>;
  onUpdateSession: (session: Session) => Promise<AppData>;
  onSaveTask: (task: Task) => Promise<AppData>;
  onDeleteTask: (taskId: string) => Promise<AppData>;
  onSaveDayJournal: (journal: DayJournal) => Promise<AppData>;
  onFocusModeChange: (enabled: boolean) => void;
}

function TodayView({
  preferences,
  sessions,
  tasks,
  dayJournals,
  summaries,
  onSaveSession,
  onUpdateSession,
  onSaveTask,
  onDeleteTask,
  onSaveDayJournal,
  onFocusModeChange
}: TodayViewProps) {
  const today = todayKey();
  const todaySessions = useMemo(() => sessionsForDate(sessions, today), [sessions, today]);
  const todayTasks = useMemo(() => sortTasksForDisplay(tasks.filter((task) => task.date === today)), [tasks, today]);
  const openTasks = useMemo(() => todayTasks.filter((task) => task.status === "open"), [todayTasks]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [endDayOpen, setEndDayOpen] = useState(false);

  useEffect(() => {
    if (activeTaskId && openTasks.some((task) => task.id === activeTaskId)) return;
    setActiveTaskId(openTasks[0]?.id ?? null);
  }, [activeTaskId, openTasks]);

  const activeTask = todayTasks.find((task) => task.id === activeTaskId) ?? null;
  const todayJournal = dayJournals.find((journal) => journal.date === today) ?? null;

  return (
    <div className="today-layout">
      <section className="primary-column">
        <TimerPanel
          preferences={preferences}
          activeTask={activeTask}
          onSaveSession={onSaveSession}
          onUpdateSession={onUpdateSession}
          onSaveTask={onSaveTask}
          onEndDay={() => setEndDayOpen(true)}
          onFocusModeChange={onFocusModeChange}
        />
        {endDayOpen ? (
          <EndDayPanel
            dateKey={today}
            sessions={todaySessions}
            tasks={todayTasks}
            allTasks={tasks}
            journal={todayJournal}
            onSaveTask={onSaveTask}
            onSaveDayJournal={onSaveDayJournal}
            onClose={() => setEndDayOpen(false)}
          />
        ) : todayJournal ? (
          <EndDaySummaryStrip journal={todayJournal} onEdit={() => setEndDayOpen(true)} />
        ) : null}
        <DayThread dateKey={today} sessions={todaySessions} />
        <div className="today-insights-row">
          <FocusQuilt summaries={summaries} monthDate={new Date()} compact selectedDate={today} />
          <FocusHerbarium dateKey={today} sessions={todaySessions} />
        </div>
      </section>
      <aside className="side-column">
        <TodayTasks
          dateKey={today}
          tasks={todayTasks}
          activeTaskId={activeTaskId}
          onSetActiveTask={setActiveTaskId}
          onSaveTask={onSaveTask}
          onDeleteTask={onDeleteTask}
        />
      </aside>
    </div>
  );
}

interface TimerPanelProps {
  preferences: Preferences;
  activeTask: Task | null;
  onSaveSession: (session: Session) => Promise<AppData>;
  onUpdateSession: (session: Session) => Promise<AppData>;
  onSaveTask: (task: Task) => Promise<AppData>;
  onEndDay: () => void;
  onFocusModeChange: (enabled: boolean) => void;
}

function TimerPanel({
  preferences,
  activeTask,
  onSaveSession,
  onUpdateSession,
  onSaveTask,
  onEndDay,
  onFocusModeChange
}: TimerPanelProps) {
  const [segment, setSegment] = useState<TimerSegment>(() => buildIdleSegment("focus", 1, preferences));
  const [pendingNote, setPendingNote] = useState<{ session: Session; title: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [focusViewDismissed, setFocusViewDismissed] = useState(false);
  const finishingRef = useRef(false);

  useEffect(() => {
    const enabled =
      segment.type === "focus" &&
      (segment.status === "running" || segment.status === "paused") &&
      !focusViewDismissed;
    onFocusModeChange(enabled);
    if (typeof window.tempo.setFocusFullscreen === "function") {
      void window.tempo.setFocusFullscreen(enabled);
    }
  }, [focusViewDismissed, onFocusModeChange, segment.status, segment.type]);

  useEffect(() => {
    return () => {
      onFocusModeChange(false);
      if (typeof window.tempo.setFocusFullscreen === "function") {
        void window.tempo.setFocusFullscreen(false);
      }
    };
  }, [onFocusModeChange]);

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
      void finishSegment("completed");
    }
  }, [segment.remainingSeconds, segment.status]);

  async function finishSegment(status: "completed" | "interrupted") {
    if (finishingRef.current) return;
    finishingRef.current = true;
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
      note: "",
      taskId: snapshot.type === "focus" ? activeTask?.id : undefined,
      tag: snapshot.type === "focus" ? activeTask?.tag : undefined
    };

    await onSaveSession(session);
    if (completed && session.type === "focus" && activeTask) {
      await onSaveTask({
        ...activeTask,
        completedSessionIds: activeTask.completedSessionIds.includes(session.id)
          ? activeTask.completedSessionIds
          : [...activeTask.completedSessionIds, session.id],
        updatedAt: endedAt
      });
    }
    if (session.type === "focus") {
      setPendingNote({
        session,
        title: activeTask?.title ?? segmentLabel(session.type)
      });
      setNoteDraft("");
    }
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
    if (segment.type === "focus") {
      setFocusViewDismissed(false);
    }
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
    setFocusViewDismissed(false);
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

  async function saveSessionNote() {
    if (!pendingNote) return;
    await onUpdateSession({
      ...pendingNote.session,
      note: noteDraft.trim()
    });
    setPendingNote(null);
    setNoteDraft("");
  }

  function dismissSessionNote() {
    setPendingNote(null);
    setNoteDraft("");
  }

  function exitFocusView() {
    setFocusViewDismissed(true);
    onFocusModeChange(false);
    if (typeof window.tempo.setFocusFullscreen === "function") {
      void window.tempo.setFocusFullscreen(false);
    }
  }

  const progress = 1 - segment.remainingSeconds / (plannedMinutesFor(segment.type, preferences) * 60);
  const focusViewActive =
    segment.type === "focus" && (segment.status === "running" || segment.status === "paused") && !focusViewDismissed;

  return (
    <section className="timer-panel" aria-label="Timer">
      <div className="timer-meta">
        <span>{segmentLabel(segment.type)}</span>
        <span>
          Cycle {segment.cycleIndex} of {preferences.cycles}
        </span>
      </div>
      <div className="current-task-strip">
        <span>Now</span>
        <strong>{activeTask?.title ?? "Choose a task for this session"}</strong>
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
        <button onClick={onEndDay}>End Day</button>
        {focusViewActive ? <button onClick={exitFocusView}>Exit Focus</button> : null}
      </div>
      {pendingNote ? (
        <div className="session-note-composer">
          <div>
            <span>Session Note</span>
            <strong>{pendingNote.title}</strong>
          </div>
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="What moved forward in this session?"
            rows={3}
          />
          <div className="note-actions">
            <button className="primary-button" onClick={saveSessionNote} disabled={!noteDraft.trim()}>
              Save Note
            </button>
            <button onClick={dismissSessionNote}>Skip Note</button>
          </div>
        </div>
      ) : null}
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

interface TodayTasksProps {
  dateKey: string;
  tasks: Task[];
  activeTaskId: string | null;
  onSetActiveTask: (taskId: string | null) => void;
  onSaveTask: (task: Task) => Promise<AppData>;
  onDeleteTask: (taskId: string) => Promise<AppData>;
}

function TodayTasks({
  dateKey,
  tasks,
  activeTaskId,
  onSetActiveTask,
  onSaveTask,
  onDeleteTask
}: TodayTasksProps) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [draftSessions, setDraftSessions] = useState("1");

  const openTasks = useMemo(() => sortTasksForDisplay(tasks.filter((task) => task.status === "open")), [tasks]);
  const doneTasks = useMemo(() => sortTasksForDisplay(tasks.filter((task) => task.status === "done")), [tasks]);
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;

    const now = new Date().toISOString();
    const plannedSessions = Number(draftSessions);
    const task: Task = {
      id: createId("task"),
      title,
      date: dateKey,
      status: "open",
      tag: draftTag.trim() || undefined,
      plannedSessions: Number.isFinite(plannedSessions) && plannedSessions > 0 ? Math.round(plannedSessions) : undefined,
      sortOrder: nextTaskSortOrder(tasks, dateKey),
      completedSessionIds: [],
      createdAt: now,
      updatedAt: now
    };

    await onSaveTask(task);
    onSetActiveTask(task.id);
    setDraftTitle("");
    setDraftTag("");
    setDraftSessions("1");
  }

  async function toggleTask(task: Task) {
    const nextStatus = task.status === "done" ? "open" : "done";
    await onSaveTask({
      ...task,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    });
    if (nextStatus === "done" && activeTaskId === task.id) {
      onSetActiveTask(null);
    }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    await onDeleteTask(task.id);
    if (activeTaskId === task.id) {
      onSetActiveTask(null);
    }
  }

  async function saveTaskEdit(task: Task, patch: Pick<Task, "title" | "tag" | "plannedSessions">) {
    const title = patch.title.trim();
    if (!title) return;
    await onSaveTask({
      ...task,
      title,
      tag: patch.tag?.trim() || undefined,
      plannedSessions:
        typeof patch.plannedSessions === "number" && Number.isFinite(patch.plannedSessions) && patch.plannedSessions > 0
          ? Math.round(patch.plannedSessions)
          : undefined,
      updatedAt: new Date().toISOString()
    });
  }

  async function reorderTasks(orderedTasks: Task[]) {
    for (const [index, task] of orderedTasks.entries()) {
      if (task.sortOrder === index + 1) continue;
      await onSaveTask({
        ...task,
        sortOrder: index + 1,
        updatedAt: new Date().toISOString()
      });
    }
  }

  async function moveTask(task: Task, direction: -1 | 1) {
    const sourceList = task.status === "done" ? doneTasks : openTasks;
    const index = sourceList.findIndex((item) => item.id === task.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sourceList.length) return;
    const reordered = [...sourceList];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, removed);
    await reorderTasks(reordered);
  }

  async function dropTask(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const sourceList = openTasks.some((task) => task.id === draggedId) ? openTasks : doneTasks;
    const draggedIndex = sourceList.findIndex((task) => task.id === draggedId);
    const targetIndex = sourceList.findIndex((task) => task.id === targetId);
    if (draggedIndex < 0 || targetIndex < 0) return;
    const reordered = [...sourceList];
    const [dragged] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, dragged);
    await reorderTasks(reordered);
  }

  return (
    <section className="visual-section tasks-panel" aria-label="Today Tasks">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Today Tasks</p>
          <h2>Plan the next block</h2>
        </div>
        <span>{openTasks.length} open</span>
      </div>

      <div className="active-task-card">
        <span>Current block</span>
        <strong>{activeTask?.title ?? "No task selected"}</strong>
        {activeTask?.tag ? <em>{activeTask.tag}</em> : null}
      </div>

      <form className="task-entry" onSubmit={addTask}>
        <input
          type="text"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="Add a task for today"
          aria-label="Task title"
        />
        <div className="task-entry-row">
          <input
            type="text"
            value={draftTag}
            onChange={(event) => setDraftTag(event.target.value)}
            placeholder="Tag"
            aria-label="Task tag"
          />
          <input
            type="number"
            min="1"
            max="12"
            value={draftSessions}
            onChange={(event) => setDraftSessions(event.target.value)}
            aria-label="Planned sessions"
          />
          <button className="primary-button" type="submit" disabled={!draftTitle.trim()}>
            Add
          </button>
        </div>
      </form>

      <TaskList
        title="Open"
        tasks={openTasks}
        activeTaskId={activeTaskId}
        onSetActiveTask={onSetActiveTask}
        onToggleTask={toggleTask}
        onDeleteTask={removeTask}
        onSaveTask={saveTaskEdit}
        onMoveTask={moveTask}
        onDropTask={dropTask}
      />
      <TaskList
        title="Done"
        tasks={doneTasks}
        activeTaskId={activeTaskId}
        onSetActiveTask={onSetActiveTask}
        onToggleTask={toggleTask}
        onDeleteTask={removeTask}
        onSaveTask={saveTaskEdit}
        onMoveTask={moveTask}
        onDropTask={dropTask}
      />
    </section>
  );
}

interface TaskListProps {
  title: string;
  tasks: Task[];
  activeTaskId: string | null;
  onSetActiveTask: (taskId: string | null) => void;
  onToggleTask: (task: Task) => Promise<void>;
  onDeleteTask: (task: Task) => Promise<void>;
  onSaveTask: (task: Task, patch: Pick<Task, "title" | "tag" | "plannedSessions">) => Promise<void>;
  onMoveTask: (task: Task, direction: -1 | 1) => Promise<void>;
  onDropTask: (draggedId: string, targetId: string) => Promise<void>;
}

function TaskList({
  title,
  tasks,
  activeTaskId,
  onSetActiveTask,
  onToggleTask,
  onDeleteTask,
  onSaveTask,
  onMoveTask,
  onDropTask
}: TaskListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  return (
    <div className="task-list">
      <div className="task-list-title">
        <span>{title}</span>
        <small>{tasks.length}</small>
      </div>
      {tasks.length === 0 ? <p className="empty-text">Nothing here yet.</p> : null}
      {tasks.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          index={index}
          count={tasks.length}
          isActive={activeTaskId === task.id}
          draggedId={draggedId}
          onSetDraggedId={setDraggedId}
          onSetActiveTask={onSetActiveTask}
          onToggleTask={onToggleTask}
          onDeleteTask={onDeleteTask}
          onSaveTask={onSaveTask}
          onMoveTask={onMoveTask}
          onDropTask={onDropTask}
        />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  index,
  count,
  isActive,
  draggedId,
  onSetDraggedId,
  onSetActiveTask,
  onToggleTask,
  onDeleteTask,
  onSaveTask,
  onMoveTask,
  onDropTask
}: {
  task: Task;
  index: number;
  count: number;
  isActive: boolean;
  draggedId: string | null;
  onSetDraggedId: (taskId: string | null) => void;
  onSetActiveTask: (taskId: string | null) => void;
  onToggleTask: (task: Task) => Promise<void>;
  onDeleteTask: (task: Task) => Promise<void>;
  onSaveTask: (task: Task, patch: Pick<Task, "title" | "tag" | "plannedSessions">) => Promise<void>;
  onMoveTask: (task: Task, direction: -1 | 1) => Promise<void>;
  onDropTask: (draggedId: string, targetId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftTag, setDraftTag] = useState(task.tag ?? "");
  const [draftSessions, setDraftSessions] = useState(String(task.plannedSessions ?? ""));
  const [message, setMessage] = useState("");
  const isDraggingOver = draggedId !== null && draggedId !== task.id;
  const sessionText = task.plannedSessions
    ? `${task.completedSessionIds.length}/${task.plannedSessions} sessions`
    : `${task.completedSessionIds.length} sessions`;

  useEffect(() => {
    setDraftTitle(task.title);
    setDraftTag(task.tag ?? "");
    setDraftSessions(String(task.plannedSessions ?? ""));
    setMessage("");
  }, [task]);

  async function saveEdit() {
    const plannedSessions = Number(draftSessions);
    await onSaveTask(task, {
      title: draftTitle,
      tag: draftTag,
      plannedSessions:
        Number.isFinite(plannedSessions) && plannedSessions > 0 ? Math.round(plannedSessions) : undefined
    });
    setEditing(false);
    setMessage("Saved");
  }

  return (
    <div
      className={`task-row ${isActive ? "active" : ""} ${task.status === "done" ? "done" : ""} ${
        isDraggingOver ? "drop-target" : ""
      }`}
      draggable={!editing}
      onDragStart={(event) => {
        onSetDraggedId(task.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
      }}
      onDragOver={(event) => {
        if (!draggedId || draggedId === task.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData("text/plain") || draggedId;
        onSetDraggedId(null);
        if (sourceId) void onDropTask(sourceId, task.id);
      }}
      onDragEnd={() => onSetDraggedId(null)}
    >
      <button
        className="task-check"
        onClick={() => void onToggleTask(task)}
        aria-label={task.status === "done" ? "Reopen task" : "Complete task"}
      >
        {task.status === "done" ? "Reopen" : "Done"}
      </button>
      {editing ? (
        <div className="task-edit-form">
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            aria-label="Task title"
          />
          <div className="task-edit-row">
            <input
              type="text"
              value={draftTag}
              onChange={(event) => setDraftTag(event.target.value)}
              placeholder="Tag"
              aria-label="Task tag"
            />
            <input
              type="number"
              min="1"
              max="12"
              value={draftSessions}
              onChange={(event) => setDraftSessions(event.target.value)}
              placeholder="Pomodoros"
              aria-label="Planned sessions"
            />
          </div>
        </div>
      ) : (
        <div className="task-main">
          <strong>{task.title}</strong>
          <span>
            {sessionText}
            {task.tag ? ` | ${task.tag}` : ""}
          </span>
          {message ? <span>{message}</span> : null}
        </div>
      )}
      <div className="task-actions">
        {editing ? (
          <>
            <button className="primary-button" onClick={() => void saveEdit()} disabled={!draftTitle.trim()}>
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button className="task-sort-button" onClick={() => void onMoveTask(task, -1)} disabled={index === 0}>
              Up
            </button>
            <button className="task-sort-button" onClick={() => void onMoveTask(task, 1)} disabled={index === count - 1}>
              Down
            </button>
            <button onClick={() => setEditing(true)}>Edit</button>
            <button onClick={() => onSetActiveTask(isActive ? null : task.id)} disabled={task.status === "done"}>
              {task.status === "done" ? "Closed" : isActive ? "Now" : "Focus"}
            </button>
            <button className="danger-button" onClick={() => void onDeleteTask(task)}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface EndDayPanelProps {
  dateKey: string;
  sessions: Session[];
  tasks: Task[];
  allTasks: Task[];
  journal: DayJournal | null;
  onSaveTask: (task: Task) => Promise<AppData>;
  onSaveDayJournal: (journal: DayJournal) => Promise<AppData>;
  onClose: () => void;
}

function EndDayPanel({
  dateKey,
  sessions,
  tasks,
  allTasks,
  journal,
  onSaveTask,
  onSaveDayJournal,
  onClose
}: EndDayPanelProps) {
  const stats = useMemo(() => buildEndDayStats(sessions, tasks), [sessions, tasks]);
  const suggestedSummary = useMemo(() => {
    if (stats.focusSessions === 0) {
      return "No focus session was logged today. Keep tomorrow small and concrete.";
    }
    return `Focused for ${stats.focusedMinutes} minutes across ${stats.completedFocusSessions} completed sessions. ${stats.doneTasks.length} tasks finished, ${stats.openTasks.length} still open.`;
  }, [stats]);
  const [summary, setSummary] = useState(journal?.summary || suggestedSummary);
  const [blockerNote, setBlockerNote] = useState(journal?.blockerNote ?? "");
  const [tomorrowNote, setTomorrowNote] = useState(journal?.tomorrowNote ?? "");
  const [improvementNote, setImprovementNote] = useState(journal?.improvementNote ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSummary(journal?.summary || suggestedSummary);
    setBlockerNote(journal?.blockerNote ?? "");
    setTomorrowNote(journal?.tomorrowNote ?? "");
    setImprovementNote(journal?.improvementNote ?? "");
    setMessage("");
  }, [journal, suggestedSummary]);

  async function save() {
    await onSaveDayJournal({
      date: dateKey,
      closedAt: new Date().toISOString(),
      summary: summary.trim() || suggestedSummary,
      blockerNote: blockerNote.trim(),
      tomorrowNote: tomorrowNote.trim(),
      improvementNote: improvementNote.trim(),
      completedTaskIds: stats.doneTasks.map((task) => task.id),
      carriedTaskIds: stats.openTasks.map((task) => task.id)
    });
    setMessage("Day summary saved.");
  }

  async function carryOpenTasksToTomorrow() {
    const targetDate = tomorrowKey();
    const existingTomorrow = allTasks.filter((task) => task.date === targetDate);
    const createdTasks: Task[] = [];
    const openTasks = stats.openTasks.filter((task) => {
      const taskTag = task.tag ?? "";
      return !existingTomorrow.some(
        (candidate) => candidate.title === task.title && (candidate.tag ?? "") === taskTag && candidate.status !== "archived"
      );
    });

    if (openTasks.length === 0) {
      setMessage("No new open tasks to carry forward.");
      return;
    }

    for (const task of openTasks) {
      const now = new Date().toISOString();
      const nextTask: Task = {
        id: createId("task"),
        title: task.title,
        date: targetDate,
        status: "open",
        tag: task.tag,
        plannedSessions: task.plannedSessions,
        sortOrder: nextTaskSortOrder([...allTasks, ...createdTasks], targetDate),
        completedSessionIds: [],
        createdAt: now,
        updatedAt: now
      };
      createdTasks.push(nextTask);
      await onSaveTask(nextTask);
    }

    setMessage(`Carried ${createdTasks.length} task${createdTasks.length === 1 ? "" : "s"} to tomorrow.`);
  }

  return (
    <section className="visual-section end-day-panel" aria-label="End Day">
      <div className="section-heading">
        <div>
          <p className="eyebrow">End Day</p>
          <h2>{dateKey}</h2>
        </div>
        <button onClick={onClose}>Close</button>
      </div>

      <div className="end-day-stats">
        <Stat label="Focused Minutes" value={stats.focusedMinutes} />
        <Stat label="Done Tasks" value={stats.doneTasks.length} />
        <Stat label="Open Tasks" value={stats.openTasks.length} />
        <Stat label="Interrupted" value={stats.interruptedSessions} />
      </div>

      <div className="day-window">
        <span>First focus: {formatClock(stats.firstFocusAt)}</span>
        <span>Last focus: {formatClock(stats.lastFocusAt)}</span>
        {journal?.closedAt ? <span>Closed: {formatClock(journal.closedAt)}</span> : null}
      </div>

      <div className="end-day-prompts">
        {endDayPromptItems.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <label className="note-field">
        <span>Daily Summary</span>
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} />
      </label>
      <label className="note-field">
        <span>Blockers</span>
        <textarea
          value={blockerNote}
          onChange={(event) => setBlockerNote(event.target.value)}
          placeholder="What slowed you down today?"
          rows={3}
        />
      </label>
      <label className="note-field">
        <span>Tomorrow</span>
        <textarea
          value={tomorrowNote}
          onChange={(event) => setTomorrowNote(event.target.value)}
          placeholder="What should tomorrow start with?"
          rows={3}
        />
      </label>
      <label className="note-field">
        <span>Next Adjustment</span>
        <textarea
          value={improvementNote}
          onChange={(event) => setImprovementNote(event.target.value)}
          placeholder="What will you change next time?"
          rows={3}
        />
      </label>

      <div className="end-day-tasks">
        <TaskNameList title="Completed" tasks={stats.doneTasks} />
        <TaskNameList title="Carry Forward" tasks={stats.openTasks} />
      </div>

      <div className="note-actions">
        <button onClick={() => void carryOpenTasksToTomorrow()} disabled={stats.openTasks.length === 0}>
          Carry to Tomorrow
        </button>
        <button className="primary-button" onClick={save}>
          Save End Day
        </button>
        <span className="settings-message">{message}</span>
      </div>
    </section>
  );
}

function EndDaySummaryStrip({ journal, onEdit }: { journal: DayJournal; onEdit: () => void }) {
  return (
    <section className="visual-section end-day-strip" aria-label="Saved Day Summary">
      <div>
        <p className="eyebrow">Day Closed</p>
        <h2>{journal.summary || "End Day saved."}</h2>
        <span>{journal.closedAt ? `Saved at ${formatClock(journal.closedAt)}` : "Saved"}</span>
      </div>
      <button onClick={onEdit}>Edit</button>
    </section>
  );
}

function TaskNameList({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <div className="task-name-list">
      <span>{title}</span>
      {tasks.length === 0 ? <p className="empty-text">None</p> : null}
      {tasks.map((task) => (
        <p key={task.id}>{task.title}</p>
      ))}
    </div>
  );
}

function buildEndDayStats(sessions: Session[], tasks: Task[]) {
  const focusSessions = sessions.filter((session) => session.type === "focus");
  const completedFocus = focusSessions.filter((session) => session.status === "completed");
  const focusedMinutes = completedFocus.reduce((total, session) => total + session.actualMinutes, 0);
  const doneTasks = tasks.filter((task) => task.status === "done");
  const openTasks = tasks.filter((task) => task.status === "open");
  const firstFocusAt = focusSessions[0]?.startedAt ?? null;
  const lastFocusAt = focusSessions[focusSessions.length - 1]?.endedAt ?? null;

  return {
    focusSessions: focusSessions.length,
    completedFocusSessions: completedFocus.length,
    focusedMinutes,
    doneTasks,
    openTasks,
    interruptedSessions: sessions.filter((session) => session.interrupted).length,
    firstFocusAt,
    lastFocusAt
  };
}

function formatClock(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
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
  tasks: Task[];
  dayJournals: DayJournal[];
  summaries: AppData["daySummaries"];
  onUpdateSession: (session: Session) => Promise<AppData>;
  onSaveDayJournal: (journal: DayJournal) => Promise<AppData>;
}

function ReviewView({ sessions, tasks, dayJournals, summaries, onUpdateSession, onSaveDayJournal }: ReviewViewProps) {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const selectedSessions = useMemo(() => sessionsForDate(sessions, selectedDate), [sessions, selectedDate]);
  const selectedSummary = summaries.find((summary) => summary.date === selectedDate);
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

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
        <WeeklyEndDayReview
          selectedDate={selectedDate}
          dayJournals={dayJournals}
          summaries={summaries}
          taskMap={taskMap}
          onSaveDayJournal={onSaveDayJournal}
        />
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
        <SessionHistory sessions={selectedSessions} taskMap={taskMap} onUpdateSession={onUpdateSession} />
        <DayThread dateKey={selectedDate} sessions={selectedSessions} />
        <FocusHerbarium dateKey={selectedDate} sessions={selectedSessions} />
      </aside>
    </div>
  );
}

function WeeklyEndDayReview({
  selectedDate,
  dayJournals,
  summaries,
  taskMap,
  onSaveDayJournal
}: {
  selectedDate: string;
  dayJournals: DayJournal[];
  summaries: AppData["daySummaries"];
  taskMap: Map<string, Task>;
  onSaveDayJournal: (journal: DayJournal) => Promise<AppData>;
}) {
  const weekDays = useMemo(() => weekDaysForDate(selectedDate), [selectedDate]);
  const journalMap = useMemo(() => new Map(dayJournals.map((journal) => [journal.date, journal])), [dayJournals]);
  const summaryMap = useMemo(() => new Map(summaries.map((summary) => [summary.date, summary])), [summaries]);
  const savedCount = weekDays.filter((dateKey) => journalMap.has(dateKey)).length;

  return (
    <section className="visual-section weekly-review" aria-label="Weekly End Day Review">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Weekly End Day</p>
          <h2>{formatWeekRange(weekDays)}</h2>
        </div>
        <span>{savedCount} saved</span>
      </div>
      <div className="weekly-review-list">
        {weekDays.map((dateKey) => (
          <WeeklyEndDayItem
            key={dateKey}
            dateKey={dateKey}
            selected={dateKey === selectedDate}
            journal={journalMap.get(dateKey) ?? null}
            focusedMinutes={summaryMap.get(dateKey)?.focusedMinutes ?? 0}
            taskMap={taskMap}
            onSaveDayJournal={onSaveDayJournal}
          />
        ))}
      </div>
    </section>
  );
}

function WeeklyEndDayItem({
  dateKey,
  selected,
  journal,
  focusedMinutes,
  taskMap,
  onSaveDayJournal
}: {
  dateKey: string;
  selected: boolean;
  journal: DayJournal | null;
  focusedMinutes: number;
  taskMap: Map<string, Task>;
  onSaveDayJournal: (journal: DayJournal) => Promise<AppData>;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(journal?.summary ?? "");
  const [blockerNote, setBlockerNote] = useState(journal?.blockerNote ?? "");
  const [tomorrowNote, setTomorrowNote] = useState(journal?.tomorrowNote ?? "");
  const [improvementNote, setImprovementNote] = useState(journal?.improvementNote ?? "");
  const [message, setMessage] = useState("");
  const completedTasks = journal?.completedTaskIds.map((id) => taskMap.get(id)).filter((task): task is Task => Boolean(task)) ?? [];
  const carriedTasks = journal?.carriedTaskIds.map((id) => taskMap.get(id)).filter((task): task is Task => Boolean(task)) ?? [];

  useEffect(() => {
    setSummary(journal?.summary ?? "");
    setBlockerNote(journal?.blockerNote ?? "");
    setTomorrowNote(journal?.tomorrowNote ?? "");
    setImprovementNote(journal?.improvementNote ?? "");
    setMessage("");
  }, [journal]);

  async function save() {
    await onSaveDayJournal({
      date: dateKey,
      closedAt: journal?.closedAt ?? new Date().toISOString(),
      summary: summary.trim(),
      blockerNote: blockerNote.trim(),
      tomorrowNote: tomorrowNote.trim(),
      improvementNote: improvementNote.trim(),
      completedTaskIds: journal?.completedTaskIds ?? [],
      carriedTaskIds: journal?.carriedTaskIds ?? []
    });
    setEditing(false);
    setMessage("Saved");
  }

  return (
    <article className={`weekly-review-day ${selected ? "selected" : ""}`}>
      <div className="weekly-review-date">
        <strong>{formatWeekday(dateKey)}</strong>
        <span>{dateKey}</span>
        <button className="weekly-review-edit" onClick={() => setEditing((current) => !current)}>
          {editing ? "Cancel" : journal ? "Edit" : "Add"}
        </button>
      </div>
      {editing ? (
        <div className="weekly-review-editor">
          <label className="note-field">
            <span>Daily Summary</span>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
          </label>
          <label className="note-field">
            <span>Blockers</span>
            <textarea value={blockerNote} onChange={(event) => setBlockerNote(event.target.value)} rows={2} />
          </label>
          <label className="note-field">
            <span>Tomorrow</span>
            <textarea value={tomorrowNote} onChange={(event) => setTomorrowNote(event.target.value)} rows={2} />
          </label>
          <label className="note-field">
            <span>Next Adjustment</span>
            <textarea value={improvementNote} onChange={(event) => setImprovementNote(event.target.value)} rows={2} />
          </label>
          <div className="note-actions">
            <button className="primary-button" onClick={() => void save()}>
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : journal ? (
        <div className="weekly-review-body">
          <p className="weekly-review-summary">{journal.summary || "End Day saved."}</p>
          <div className="weekly-review-meta">
            <span>{focusedMinutes} focused min</span>
            <span>{completedTasks.length} done</span>
            <span>{carriedTasks.length} carried</span>
            {journal.closedAt ? <span>Closed {formatClock(journal.closedAt)}</span> : null}
          </div>
          {journal.blockerNote ? (
            <p>
              <span>Blockers</span>
              {journal.blockerNote}
            </p>
          ) : null}
          {journal.tomorrowNote ? (
            <p>
              <span>Tomorrow</span>
              {journal.tomorrowNote}
            </p>
          ) : null}
          {journal.improvementNote ? (
            <p>
              <span>Change</span>
              {journal.improvementNote}
            </p>
          ) : null}
          {message ? <span className="settings-message">{message}</span> : null}
        </div>
      ) : (
        <p className="empty-text">{message || "No End Day saved."}</p>
      )}
    </article>
  );
}

function weekDaysForDate(dateKey: string): string[] {
  const date = new Date(`${dateKey}T00:00:00`);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return localDateKey(day);
  });
}

function formatWeekRange(weekDays: string[]): string {
  const first = new Date(`${weekDays[0]}T00:00:00`);
  const last = new Date(`${weekDays[6]}T00:00:00`);
  const firstText = first.toLocaleDateString("en", { month: "short", day: "numeric" });
  const lastText = last.toLocaleDateString("en", { month: "short", day: "numeric" });
  return `${firstText} - ${lastText}`;
}

function formatWeekday(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en", { weekday: "short" });
}

function SessionHistory({
  sessions,
  taskMap,
  onUpdateSession
}: {
  sessions: Session[];
  taskMap: Map<string, Task>;
  onUpdateSession: (session: Session) => Promise<AppData>;
}) {
  const focusSessions = useMemo(() => sessions.filter((session) => session.type === "focus"), [sessions]);

  return (
    <section className="visual-section session-history">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Session Notes</p>
          <h2>What happened</h2>
        </div>
        <span>{focusSessions.length} focus</span>
      </div>
      {focusSessions.length === 0 ? <p className="empty-text">No focus notes for this day.</p> : null}
      {focusSessions.map((session) => (
        <SessionNoteEditor
          key={session.id}
          session={session}
          task={session.taskId ? taskMap.get(session.taskId) ?? null : null}
          onUpdateSession={onUpdateSession}
        />
      ))}
    </section>
  );
}

function SessionNoteEditor({
  session,
  task,
  onUpdateSession
}: {
  session: Session;
  task: Task | null;
  onUpdateSession: (session: Session) => Promise<AppData>;
}) {
  const [draft, setDraft] = useState(session.note);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(session.note);
    setMessage("");
  }, [session]);

  async function save() {
    await onUpdateSession({
      ...session,
      note: draft.trim()
    });
    setMessage("Saved");
  }

  return (
    <div className={`session-note-row ${session.type}`}>
      <div className="session-note-meta">
        <strong>{segmentLabel(session.type)}</strong>
        <span>
          {formatClock(session.startedAt)} - {formatClock(session.endedAt)} | {session.actualMinutes} min
        </span>
        {task ? <em>{task.title}</em> : session.tag ? <em>{session.tag}</em> : null}
      </div>
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setMessage("");
        }}
        placeholder="Add a note for this session"
        rows={2}
      />
      <div className="note-actions">
        <button onClick={save} disabled={draft.trim() === session.note.trim()}>
          Save
        </button>
        <span className="settings-message">{message}</span>
      </div>
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
