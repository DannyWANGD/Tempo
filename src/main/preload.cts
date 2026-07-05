import { contextBridge, ipcRenderer } from "electron";
import type { DayJournal, InboxItem, Preferences, Session, SessionRange, Task, TempoApi } from "../shared/types.js";

const api: TempoApi = {
  loadAppData: () => ipcRenderer.invoke("app-data:load"),
  savePreferences: (preferences: Preferences) => ipcRenderer.invoke("preferences:save", preferences),
  saveSession: (session: Session) => ipcRenderer.invoke("sessions:save", session),
  updateSession: (session: Session) => ipcRenderer.invoke("sessions:update", session),
  saveTask: (task: Task) => ipcRenderer.invoke("tasks:save", task),
  deleteTask: (taskId: string) => ipcRenderer.invoke("tasks:delete", taskId),
  saveDayJournal: (journal: DayJournal) => ipcRenderer.invoke("day-journals:save", journal),
  saveInboxItem: (item: InboxItem) => ipcRenderer.invoke("inbox:save", item),
  deleteInboxItem: (itemId: string) => ipcRenderer.invoke("inbox:delete", itemId),
  loadSessions: (range?: SessionRange) => ipcRenderer.invoke("sessions:load", range),
  exportData: () => ipcRenderer.invoke("data:export"),
  importData: () => ipcRenderer.invoke("data:import"),
  resetLocalData: () => ipcRenderer.invoke("data:reset"),
  setFocusFullscreen: (enabled: boolean) => ipcRenderer.invoke("window:focus-fullscreen", enabled)
};

contextBridge.exposeInMainWorld("tempo", api);
