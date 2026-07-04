import type { DaySummary, Preferences, SegmentType, Session } from "./types.js";

export function plannedMinutesFor(type: SegmentType, preferences: Preferences): number {
  if (type === "focus") return preferences.focusLength;
  if (type === "shortBreak") return preferences.shortBreakLength;
  return preferences.longBreakLength;
}

export function nextSegment(type: SegmentType, cycleIndex: number, cycleTotal: number): {
  type: SegmentType;
  cycleIndex: number;
} {
  if (type === "focus") {
    return cycleIndex >= cycleTotal
      ? { type: "longBreak", cycleIndex }
      : { type: "shortBreak", cycleIndex };
  }

  if (type === "shortBreak") {
    return { type: "focus", cycleIndex: Math.min(cycleIndex + 1, cycleTotal) };
  }

  return { type: "focus", cycleIndex: 1 };
}

export function segmentLabel(type: SegmentType): string {
  if (type === "focus") return "Focus";
  if (type === "shortBreak") return "Short Break";
  return "Long Break";
}

export function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function localDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function daysInMonth(year: number, monthIndex: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, monthIndex, 1);
  while (date.getMonth() === monthIndex) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export function buildDaySummaries(sessions: Session[]): DaySummary[] {
  const summaries = new Map<string, DaySummary>();

  for (const session of sessions) {
    const date = localDateKey(session.startedAt);
    const summary =
      summaries.get(date) ??
      {
        date,
        focusedMinutes: 0,
        completedSessions: 0,
        completedCycles: 0,
        interruptedSessions: 0,
        firstFocusAt: null,
        lastFocusAt: null
      };

    if (session.type === "focus") {
      if (session.status === "completed") {
        summary.focusedMinutes += session.actualMinutes;
        summary.completedSessions += 1;
        if (session.cycleIndex === session.cycleTotal) {
          summary.completedCycles += 1;
        }
      }

      if (summary.firstFocusAt === null || session.startedAt < summary.firstFocusAt) {
        summary.firstFocusAt = session.startedAt;
      }
      if (summary.lastFocusAt === null || session.endedAt > summary.lastFocusAt) {
        summary.lastFocusAt = session.endedAt;
      }
    }

    if (session.interrupted) {
      summary.interruptedSessions += 1;
    }

    summaries.set(date, summary);
  }

  return Array.from(summaries.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function sessionsForDate(sessions: Session[], dateKey: string): Session[] {
  return sessions
    .filter((session) => localDateKey(session.startedAt) === dateKey)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function createId(prefix = "session"): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}
