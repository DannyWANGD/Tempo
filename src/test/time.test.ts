import { describe, expect, it } from "vitest";
import { buildDaySummaries, formatSeconds, nextSegment, plannedMinutesFor } from "../shared/time.js";
import { DEFAULT_PREFERENCES, type Session } from "../shared/types.js";

describe("time helpers", () => {
  it("formats seconds as a timer value", () => {
    expect(formatSeconds(0)).toBe("00:00");
    expect(formatSeconds(65)).toBe("01:05");
    expect(formatSeconds(1500)).toBe("25:00");
  });

  it("resolves planned minutes for each segment", () => {
    expect(plannedMinutesFor("focus", DEFAULT_PREFERENCES)).toBe(25);
    expect(plannedMinutesFor("shortBreak", DEFAULT_PREFERENCES)).toBe(5);
    expect(plannedMinutesFor("longBreak", DEFAULT_PREFERENCES)).toBe(15);
  });

  it("moves through manual pomodoro cycle order", () => {
    expect(nextSegment("focus", 1, 4)).toEqual({ type: "shortBreak", cycleIndex: 1 });
    expect(nextSegment("shortBreak", 1, 4)).toEqual({ type: "focus", cycleIndex: 2 });
    expect(nextSegment("focus", 4, 4)).toEqual({ type: "longBreak", cycleIndex: 4 });
    expect(nextSegment("longBreak", 4, 4)).toEqual({ type: "focus", cycleIndex: 1 });
  });

  it("builds day summaries from completed and interrupted sessions", () => {
    const sessions: Session[] = [
      {
        id: "a",
        type: "focus",
        startedAt: "2026-07-04T09:00:00.000Z",
        endedAt: "2026-07-04T09:25:00.000Z",
        plannedMinutes: 25,
        actualMinutes: 25,
        cycleIndex: 1,
        cycleTotal: 4,
        status: "completed",
        interrupted: false,
        note: ""
      },
      {
        id: "b",
        type: "focus",
        startedAt: "2026-07-04T10:00:00.000Z",
        endedAt: "2026-07-04T10:10:00.000Z",
        plannedMinutes: 25,
        actualMinutes: 10,
        cycleIndex: 2,
        cycleTotal: 4,
        status: "interrupted",
        interrupted: true,
        note: ""
      },
      {
        id: "c",
        type: "focus",
        startedAt: "2026-07-04T11:00:00.000Z",
        endedAt: "2026-07-04T11:25:00.000Z",
        plannedMinutes: 25,
        actualMinutes: 25,
        cycleIndex: 4,
        cycleTotal: 4,
        status: "completed",
        interrupted: false,
        note: ""
      },
      {
        id: "d",
        type: "shortBreak",
        startedAt: "2026-07-04T11:25:00.000Z",
        endedAt: "2026-07-04T11:30:00.000Z",
        plannedMinutes: 5,
        actualMinutes: 5,
        cycleIndex: 4,
        cycleTotal: 4,
        status: "completed",
        interrupted: false,
        note: ""
      }
    ];

    expect(buildDaySummaries(sessions)).toEqual([
      {
        date: "2026-07-04",
        focusedMinutes: 50,
        completedSessions: 2,
        completedCycles: 1,
        interruptedSessions: 1,
        firstFocusAt: "2026-07-04T09:00:00.000Z",
        lastFocusAt: "2026-07-04T11:25:00.000Z"
      }
    ]);
  });
});
