export const SCHEMA_VERSION = 1;

export type SegmentType = "focus" | "shortBreak" | "longBreak";
export type SessionStatus = "completed" | "interrupted";
export type TimerStatus = "idle" | "running" | "paused";
export type AccentColor = "sage" | "blue" | "rose";
export type TaskStatus = "open" | "done" | "archived";

export interface Preferences {
  focusLength: number;
  shortBreakLength: number;
  longBreakLength: number;
  cycles: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  accentColor: AccentColor;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

export interface Session {
  id: string;
  type: SegmentType;
  startedAt: string;
  endedAt: string;
  plannedMinutes: number;
  actualMinutes: number;
  cycleIndex: number;
  cycleTotal: number;
  status: SessionStatus;
  interrupted: boolean;
  note: string;
  taskId?: string;
  tag?: string;
}

export interface Task {
  id: string;
  title: string;
  date: string;
  status: TaskStatus;
  tag?: string;
  plannedSessions?: number;
  sortOrder?: number;
  completedSessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DayJournal {
  date: string;
  closedAt: string | null;
  summary: string;
  blockerNote: string;
  tomorrowNote: string;
  improvementNote: string;
  completedTaskIds: string[];
  carriedTaskIds: string[];
}

export interface InboxItem {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface DaySummary {
  date: string;
  focusedMinutes: number;
  completedSessions: number;
  completedCycles: number;
  interruptedSessions: number;
  firstFocusAt: string | null;
  lastFocusAt: string | null;
}

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  preferences: Preferences;
  sessions: Session[];
  tasks: Task[];
  dayJournals: DayJournal[];
  inboxItems: InboxItem[];
  daySummaries: DaySummary[];
}

export interface ExportedData extends AppData {
  exportedAt: string;
}

export interface SessionRange {
  from?: string;
  to?: string;
}

export interface ImportResult {
  imported: boolean;
  cancelled: boolean;
  data: AppData | null;
  message: string;
}

export interface FileActionResult {
  ok: boolean;
  cancelled: boolean;
  path?: string;
  message: string;
}

export interface TempoApi {
  loadAppData: () => Promise<AppData>;
  savePreferences: (preferences: Preferences) => Promise<AppData>;
  saveSession: (session: Session) => Promise<AppData>;
  updateSession: (session: Session) => Promise<AppData>;
  saveTask: (task: Task) => Promise<AppData>;
  deleteTask: (taskId: string) => Promise<AppData>;
  saveDayJournal: (journal: DayJournal) => Promise<AppData>;
  saveInboxItem: (item: InboxItem) => Promise<AppData>;
  deleteInboxItem: (itemId: string) => Promise<AppData>;
  loadSessions: (range?: SessionRange) => Promise<Session[]>;
  exportData: () => Promise<FileActionResult>;
  importData: () => Promise<ImportResult>;
  resetLocalData: () => Promise<AppData>;
  setFocusFullscreen: (enabled: boolean) => Promise<void>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  focusLength: 25,
  shortBreakLength: 5,
  longBreakLength: 15,
  cycles: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  accentColor: "sage",
  soundEnabled: false,
  notificationsEnabled: false
};
