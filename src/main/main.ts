import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type MessageBoxOptions,
  type OpenDialogOptions,
  type SaveDialogOptions
} from "electron";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDaySummaries } from "../shared/time.js";
import {
  DEFAULT_PREFERENCES,
  SCHEMA_VERSION,
  type AppData,
  type AccentColor,
  type DayJournal,
  type ExportedData,
  type InboxItem,
  type Preferences,
  type Session,
  type SessionRange,
  type Task
} from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const capturePath = process.env.TEMPO_CAPTURE_PATH;
const captureDelayMs = Number(process.env.TEMPO_CAPTURE_DELAY_MS ?? 800);
const captureAction = process.env.TEMPO_CAPTURE_ACTION;
const userDataDir = process.env.TEMPO_USER_DATA_DIR;
const debugRenderer = process.env.TEMPO_DEBUG_RENDERER === "1";

if (userDataDir) {
  const resolvedUserDataDir = path.resolve(userDataDir);
  fsSync.mkdirSync(resolvedUserDataDir, { recursive: true });
  app.setPath("userData", resolvedUserDataDir);
  app.setPath("sessionData", path.join(resolvedUserDataDir, "session"));
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-rasterization");
app.commandLine.appendSwitch("disable-accelerated-2d-canvas");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-features", "CanvasOopRasterization,UseSkiaRenderer,Vulkan");

if (capturePath || process.env.TEMPO_DISABLE_SANDBOX === "1") {
  app.commandLine.appendSwitch("no-sandbox");
}

function dataDir(): string {
  return path.join(app.getPath("userData"), "data");
}

function dataPath(name: string): string {
  return path.join(dataDir(), name);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
}

async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(dataPath(fileName), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(fileName: string, value: unknown): Promise<void> {
  await ensureDataDir();
  const target = dataPath(fileName);
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temp, target);
}

async function showSaveDialog(options: SaveDialogOptions) {
  return mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options);
}

async function showOpenDialog(options: OpenDialogOptions) {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

async function showMessageBox(options: MessageBoxOptions) {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

function normalizePreferences(value: Partial<Preferences> | null | undefined): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...(value ?? {}),
    focusLength: clampMinutes(value?.focusLength, DEFAULT_PREFERENCES.focusLength),
    shortBreakLength: clampMinutes(value?.shortBreakLength, DEFAULT_PREFERENCES.shortBreakLength),
    longBreakLength: clampMinutes(value?.longBreakLength, DEFAULT_PREFERENCES.longBreakLength),
    cycles: clampCycles(value?.cycles, DEFAULT_PREFERENCES.cycles),
    accentColor: normalizeAccentColor(value?.accentColor)
  };
}

function normalizeAccentColor(value: unknown): AccentColor {
  return value === "sage" || value === "blue" || value === "rose"
    ? value
    : DEFAULT_PREFERENCES.accentColor;
}

function clampMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(180, Math.max(1, Math.round(value)))
    : fallback;
}

function clampCycles(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(12, Math.max(1, Math.round(value)))
    : fallback;
}

function normalizeSortOrder(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function compareTasks(a: Task, b: Task): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.createdAt.localeCompare(b.createdAt);
}

function normalizeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((session): session is Session => {
      return (
        typeof session === "object" &&
        session !== null &&
        typeof session.id === "string" &&
        ["focus", "shortBreak", "longBreak"].includes(String(session.type)) &&
        typeof session.startedAt === "string" &&
        typeof session.endedAt === "string" &&
        typeof session.plannedMinutes === "number" &&
        typeof session.actualMinutes === "number" &&
        typeof session.cycleIndex === "number" &&
        typeof session.cycleTotal === "number" &&
        ["completed", "interrupted"].includes(String(session.status)) &&
        typeof session.interrupted === "boolean" &&
        typeof session.note === "string"
      );
    })
    .map((session) => ({
      ...session,
      taskId: typeof session.taskId === "string" ? session.taskId : undefined,
      tag: typeof session.tag === "string" ? session.tag : undefined
    }));
}

function normalizeTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((task): task is Task => {
      return (
        typeof task === "object" &&
        task !== null &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        typeof task.date === "string" &&
        ["open", "done", "archived"].includes(String(task.status)) &&
        Array.isArray(task.completedSessionIds) &&
        typeof task.createdAt === "string" &&
        typeof task.updatedAt === "string"
      );
    })
    .map((task) => ({
      ...task,
      title: task.title.trim(),
      tag: typeof task.tag === "string" && task.tag.trim() ? task.tag.trim() : undefined,
      plannedSessions:
        typeof task.plannedSessions === "number" && Number.isFinite(task.plannedSessions)
          ? Math.max(0, Math.round(task.plannedSessions))
          : undefined,
      sortOrder: normalizeSortOrder(task.sortOrder),
      completedSessionIds: task.completedSessionIds.filter((id): id is string => typeof id === "string")
    }))
    .filter((task) => task.title.length > 0)
    .sort(compareTasks);
}

function normalizeDayJournals(value: unknown): DayJournal[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((journal): journal is DayJournal => {
      return (
        typeof journal === "object" &&
        journal !== null &&
        typeof journal.date === "string" &&
        (typeof journal.closedAt === "string" || journal.closedAt === null) &&
        typeof journal.summary === "string" &&
        typeof journal.blockerNote === "string" &&
        typeof journal.tomorrowNote === "string" &&
        Array.isArray(journal.completedTaskIds) &&
        Array.isArray(journal.carriedTaskIds)
      );
    })
    .map((journal) => ({
      ...journal,
      summary: journal.summary.trim(),
      blockerNote: journal.blockerNote.trim(),
      tomorrowNote: journal.tomorrowNote.trim(),
      improvementNote:
        typeof journal.improvementNote === "string" ? journal.improvementNote.trim() : "",
      completedTaskIds: journal.completedTaskIds.filter((id): id is string => typeof id === "string"),
      carriedTaskIds: journal.carriedTaskIds.filter((id): id is string => typeof id === "string")
    }));
}

function normalizeInboxItems(value: unknown): InboxItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is InboxItem => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.text === "string" &&
        typeof item.createdAt === "string" &&
        typeof item.updatedAt === "string"
      );
    })
    .map((item) => ({
      ...item,
      text: item.text.trim()
    }))
    .filter((item) => item.text.length > 0);
}

async function loadAppData(): Promise<AppData> {
  await ensureDataDir();
  const preferences = normalizePreferences(
    await readJsonFile<Partial<Preferences>>("preferences.json", DEFAULT_PREFERENCES)
  );
  const sessions = normalizeSessions(await readJsonFile<Session[]>("sessions.json", []));
  const tasks = normalizeTasks(await readJsonFile<Task[]>("tasks.json", []));
  const dayJournals = normalizeDayJournals(await readJsonFile<DayJournal[]>("dayJournals.json", []));
  const inboxItems = normalizeInboxItems(await readJsonFile<InboxItem[]>("inbox.json", []));
  const daySummaries = buildDaySummaries(sessions);
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences,
    sessions,
    tasks,
    dayJournals,
    inboxItems,
    daySummaries
  };
}

async function persistAppData(data: AppData): Promise<AppData> {
  const preferences = normalizePreferences(data.preferences);
  const sessions = normalizeSessions(data.sessions);
  const tasks = normalizeTasks(data.tasks);
  const dayJournals = normalizeDayJournals(data.dayJournals);
  const inboxItems = normalizeInboxItems(data.inboxItems);
  const daySummaries = buildDaySummaries(sessions);
  await writeJsonFile("preferences.json", preferences);
  await writeJsonFile("sessions.json", sessions);
  await writeJsonFile("tasks.json", tasks);
  await writeJsonFile("dayJournals.json", dayJournals);
  await writeJsonFile("inbox.json", inboxItems);
  await writeJsonFile("daySummaries.json", daySummaries);
  await writeJsonFile("appState.json", { schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() });
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences,
    sessions,
    tasks,
    dayJournals,
    inboxItems,
    daySummaries
  };
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: "#F7F0E6",
    show: !capturePath,
    paintWhenInitiallyHidden: true,
    title: "Tempo",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (debugRenderer) {
    mainWindow.webContents.session.webRequest.onErrorOccurred((details) => {
      console.error(`[renderer:resource-failed] ${details.error} ${details.resourceType} ${details.url}`);
    });
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[renderer:gone] ${details.reason} ${details.exitCode}`);
    });
    mainWindow.webContents.on("did-finish-load", () => {
      console.log(`[renderer:loaded] ${mainWindow?.webContents.getURL() ?? ""}`);
    });
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (!capturePath && process.env.TEMPO_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const rendererEntry = path.join(app.getAppPath(), "dist", "renderer", "index.html");
    await mainWindow.loadURL(pathToFileURL(rendererEntry).toString());
  }

  if (capturePath) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (captureAction === "start-focus") {
      await mainWindow.webContents.executeJavaScript("document.querySelector('.timer-controls .primary-button')?.click()");
    } else if (captureAction === "review") {
      await mainWindow.webContents.executeJavaScript("document.querySelectorAll('.nav button')[1]?.click()");
    } else if (captureAction === "review-edit-end-day") {
      await mainWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.querySelectorAll('.nav button')[1]?.click();
          setTimeout(() => {
            document.querySelector('.weekly-review')?.scrollIntoView({ block: 'start' });
            document.querySelector('.weekly-review-day.selected .weekly-review-edit')?.click();
            resolve(true);
          }, 420);
        })
      `);
    } else if (captureAction === "end-day") {
      await mainWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          Array.from(document.querySelectorAll('.timer-controls button')).find((button) => button.textContent?.trim() === 'End Day')?.click();
          setTimeout(() => {
            if (!document.querySelector('.end-day-panel')) {
              document.querySelector('.end-day-strip button')?.click();
            }
            setTimeout(() => {
            document.querySelector('.end-day-panel')?.scrollIntoView({ block: 'center' });
            resolve(true);
            }, 180);
          }, 240);
        })
      `);
    } else if (captureAction === "task-edit") {
      await mainWindow.webContents.executeJavaScript(`
        Array.from(document.querySelectorAll('.task-actions button')).find((button) => button.textContent?.trim() === 'Edit')?.click();
      `);
    } else if (captureAction === "scroll-insights") {
      await mainWindow.webContents.executeJavaScript(
        "document.querySelector('.today-insights-row')?.scrollIntoView({ block: 'center' })"
      );
    } else if (captureAction === "add-inbox") {
      await mainWindow.webContents.executeJavaScript(`
        const textarea = document.querySelector('.inbox-entry textarea');
        const button = document.querySelector('.inbox-entry button');
        if (textarea && button) {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          setter?.call(textarea, 'Runtime inbox capture test');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          button.click();
        }
      `);
    }
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(captureDelayMs) ? captureDelayMs : 800));
    const image = await mainWindow.webContents.capturePage();
    await fs.writeFile(capturePath, image.toPNG());
    app.quit();
  }
}

ipcMain.handle("app-data:load", async () => loadAppData());

ipcMain.handle("preferences:save", async (_event, preferences: Preferences) => {
  const current = await loadAppData();
  return persistAppData({ ...current, preferences });
});

ipcMain.handle("sessions:save", async (_event, session: Session) => {
  const current = await loadAppData();
  const sessions = [...current.sessions.filter((item) => item.id !== session.id), session].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt)
  );
  return persistAppData({ ...current, sessions });
});

ipcMain.handle("sessions:update", async (_event, session: Session) => {
  const current = await loadAppData();
  const sessions = current.sessions.map((item) => (item.id === session.id ? session : item));
  return persistAppData({ ...current, sessions });
});

ipcMain.handle("tasks:save", async (_event, task: Task) => {
  const current = await loadAppData();
  const tasks = [...current.tasks.filter((item) => item.id !== task.id), task].sort(compareTasks);
  return persistAppData({ ...current, tasks });
});

ipcMain.handle("tasks:delete", async (_event, taskId: string) => {
  const current = await loadAppData();
  const tasks = current.tasks.filter((task) => task.id !== taskId);
  const sessions = current.sessions.map((session) =>
    session.taskId === taskId ? { ...session, taskId: undefined } : session
  );
  const dayJournals = current.dayJournals.map((journal) => ({
    ...journal,
    completedTaskIds: journal.completedTaskIds.filter((id) => id !== taskId),
    carriedTaskIds: journal.carriedTaskIds.filter((id) => id !== taskId)
  }));
  return persistAppData({ ...current, sessions, tasks, dayJournals });
});

ipcMain.handle("day-journals:save", async (_event, journal: DayJournal) => {
  const current = await loadAppData();
  const dayJournals = [...current.dayJournals.filter((item) => item.date !== journal.date), journal].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  return persistAppData({ ...current, dayJournals });
});

ipcMain.handle("inbox:save", async (_event, item: InboxItem) => {
  const current = await loadAppData();
  const inboxItems = [...current.inboxItems.filter((entry) => entry.id !== item.id), item].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  return persistAppData({ ...current, inboxItems });
});

ipcMain.handle("inbox:delete", async (_event, itemId: string) => {
  const current = await loadAppData();
  const inboxItems = current.inboxItems.filter((item) => item.id !== itemId);
  return persistAppData({ ...current, inboxItems });
});

ipcMain.handle("window:focus-fullscreen", async (_event, enabled: boolean) => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(Boolean(enabled));
});

ipcMain.handle("sessions:load", async (_event, range?: SessionRange) => {
  const current = await loadAppData();
  if (!range?.from && !range?.to) return current.sessions;
  return current.sessions.filter((session) => {
    if (range.from && session.startedAt < range.from) return false;
    if (range.to && session.startedAt > range.to) return false;
    return true;
  });
});

ipcMain.handle("data:export", async () => {
  const current = await loadAppData();
  const result = await showSaveDialog({
    title: "Export Tempo Data",
    defaultPath: `tempo-export-${new Date().toISOString().slice(0, 10)}.tempo.json`,
    filters: [{ name: "Tempo Data", extensions: ["tempo.json", "json"] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true, message: "Export cancelled." };
  }

  const exported: ExportedData = {
    ...current,
    exportedAt: new Date().toISOString()
  };
  await fs.writeFile(result.filePath, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
  return { ok: true, cancelled: false, path: result.filePath, message: "Data exported." };
});

ipcMain.handle("data:import", async () => {
  const result = await showOpenDialog({
    title: "Import Tempo Data",
    properties: ["openFile"],
    filters: [{ name: "Tempo Data", extensions: ["tempo.json", "json"] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { imported: false, cancelled: true, data: null, message: "Import cancelled." };
  }

  let parsed: Partial<ExportedData>;
  try {
    const raw = await fs.readFile(result.filePaths[0], "utf8");
    parsed = JSON.parse(raw) as Partial<ExportedData>;
  } catch {
    return { imported: false, cancelled: false, data: null, message: "Import failed. Choose a valid Tempo data file." };
  }

  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { imported: false, cancelled: false, data: null, message: "Unsupported data file." };
  }

  const confirmation = await showMessageBox({
    type: "question",
    buttons: ["Replace", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Import Tempo Data",
    message: "Replace local Tempo data with this file?"
  });

  if (confirmation.response !== 0) {
    return { imported: false, cancelled: true, data: null, message: "Import cancelled." };
  }

  const next = await persistAppData({
    schemaVersion: SCHEMA_VERSION,
    preferences: normalizePreferences(parsed.preferences),
    sessions: normalizeSessions(parsed.sessions),
    tasks: normalizeTasks(parsed.tasks),
    dayJournals: normalizeDayJournals(parsed.dayJournals),
    inboxItems: normalizeInboxItems(parsed.inboxItems),
    daySummaries: []
  });

  return { imported: true, cancelled: false, data: next, message: "Data imported." };
});

ipcMain.handle("data:reset", async () => {
  const confirmation = await showMessageBox({
    type: "warning",
    buttons: ["Reset", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Reset Tempo",
    message: "Delete local Tempo sessions, tasks, day summaries, and restore default settings?"
  });

  if (confirmation.response !== 0) {
    return loadAppData();
  }

  return persistAppData({
    schemaVersion: SCHEMA_VERSION,
    preferences: DEFAULT_PREFERENCES,
    sessions: [],
    tasks: [],
    dayJournals: [],
    inboxItems: [],
    daySummaries: []
  });
});

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
