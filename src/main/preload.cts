import { contextBridge, ipcRenderer } from "electron";
import type { Preferences, Session, SessionRange, TempoApi } from "../shared/types.js";

const api: TempoApi = {
  loadAppData: () => ipcRenderer.invoke("app-data:load"),
  savePreferences: (preferences: Preferences) => ipcRenderer.invoke("preferences:save", preferences),
  saveSession: (session: Session) => ipcRenderer.invoke("sessions:save", session),
  updateSession: (session: Session) => ipcRenderer.invoke("sessions:update", session),
  loadSessions: (range?: SessionRange) => ipcRenderer.invoke("sessions:load", range),
  exportData: () => ipcRenderer.invoke("data:export"),
  importData: () => ipcRenderer.invoke("data:import"),
  resetLocalData: () => ipcRenderer.invoke("data:reset")
};

contextBridge.exposeInMainWorld("tempo", api);
