/**
 * MiniMix To-Do store — module-level singleton.
 *
 * The reminder engine lives here (not inside the component) so reminders keep
 * firing on every page of the app — home included — as long as the tab is open.
 * Tasks are kept in memory and mirrored to localStorage (best effort), so the
 * list survives route changes even if storage is blocked.
 */

export type Task = {
  id: string;
  text: string;
  done: boolean;
  /** ISO timestamp of the due time, or null for tasks without a reminder. */
  dueAt: string | null;
  /** Reminder interval in minutes (used when dueAt is set). */
  repeatMin: number;
  /** ISO timestamp of the next due reminder (rescheduled until done). */
  nextRemindAt: string | null;
  createdAt: number;
};

export type Reminder = { taskId: string; text: string; at: number } | null;

export type TodoSnapshot = { tasks: Task[]; reminder: Reminder };

const STORAGE_KEY = "minimix.todo.v1";

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Task => !!t && typeof (t as Task).text === "string" && typeof (t as Task).done === "boolean",
    );
  } catch {
    return [];
  }
}

let snapshot: TodoSnapshot = { tasks: loadTasks(), reminder: null };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let baseTitle: string | null = null;
let audioCtx: AudioContext | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.tasks));
  } catch {
    /* storage blocked — memory state still works for this session */
  }
}

function restoreTitle() {
  if (baseTitle === null) return;
  try {
    document.title = baseTitle;
  } catch {
    /* noop */
  }
  baseTitle = null;
}

function clearReminderBanner() {
  if (snapshot.reminder !== null) {
    snapshot = { ...snapshot, reminder: null };
    emit();
  }
  restoreTitle();
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [0, 0.18].forEach((offset) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = offset ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.16);
    });
  } catch {
    /* autoplay policy or unsupported — silent fallback */
  }
}

function sendBrowserNotification(text: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("MiniMix To-Do", { body: `Time to: ${text}`, tag });
  } catch {
    /* mobile browsers / embedded iframes may forbid the constructor — the
       banner, title flash and beep below still fire */
  }
}

function tick() {
  const now = Date.now();
  const fired: Task[] = [];
  const next = snapshot.tasks.map((task) => {
    if (task.done || !task.nextRemindAt) return task;
    const due = Date.parse(task.nextRemindAt);
    if (Number.isNaN(due) || due > now) return task;
    fired.push(task);
    const step = Math.max(1, task.repeatMin) * 60000;
    // Skip forward past any backlog (e.g. the tab slept) so we fire once, not N times.
    let nextAt = due + step;
    while (nextAt <= now) nextAt += step;
    return { ...task, nextRemindAt: new Date(nextAt).toISOString() };
  });
  if (fired.length === 0) return;

  for (const task of fired) sendBrowserNotification(task.text, task.id);
  beep();
  const last = fired[fired.length - 1];
  if (!last) return;
  try {
    baseTitle = baseTitle ?? document.title;
    document.title = `🔔 Time to: ${last.text}`;
  } catch {
    /* noop */
  }
  snapshot = { tasks: next, reminder: { taskId: last.id, text: last.text, at: now } };
  persist();
  emit();
}

/** Subscribe to the store; starts the 1s reminder engine on first subscriber. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (ticker === null) {
    tick(); // catch up on reminders that came due while nobody was subscribed
    ticker = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getTodoSnapshot(): TodoSnapshot {
  return snapshot;
}

export function addTask(text: string, dueAtIso: string | null, repeatMin: number): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const task: Task = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
    done: false,
    dueAt: dueAtIso,
    repeatMin: Math.max(1, repeatMin),
    nextRemindAt: dueAtIso,
    createdAt: Date.now(),
  };
  snapshot = { ...snapshot, tasks: [task, ...snapshot.tasks] };
  persist();
  emit();
}

export function toggleTask(id: string): void {
  const now = Date.now();
  snapshot = {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => {
      if (task.id !== id) return task;
      const done = !task.done;
      let nextRemindAt: string | null = null;
      if (!done && task.dueAt) {
        const due = Date.parse(task.dueAt);
        const at = Number.isNaN(due) || due <= now ? now + Math.max(1, task.repeatMin) * 60000 : due;
        nextRemindAt = new Date(at).toISOString();
      }
      return { ...task, done, nextRemindAt };
    }),
  };
  persist();
  emit();
  if (snapshot.reminder?.taskId === id) clearReminderBanner();
}

export function removeTask(id: string): void {
  snapshot = { ...snapshot, tasks: snapshot.tasks.filter((task) => task.id !== id) };
  persist();
  emit();
  if (snapshot.reminder?.taskId === id) clearReminderBanner();
}

export function changeDue(id: string, iso: string | null): void {
  snapshot = {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => {
      if (task.id !== id) return task;
      const valid = iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
      return { ...task, dueAt: valid, nextRemindAt: task.done || !valid ? null : valid };
    }),
  };
  persist();
  emit();
}

export function setRepeat(id: string, minutes: number): void {
  const step = Math.max(1, minutes) * 60000;
  snapshot = {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => {
      if (task.id !== id) return task;
      return {
        ...task,
        repeatMin: Math.max(1, minutes),
        nextRemindAt:
          task.done || !task.dueAt ? task.nextRemindAt : new Date(Date.now() + step).toISOString(),
      };
    }),
  };
  persist();
  emit();
}

/** Push every open timed task's next reminder out by its own interval. */
export function snoozeReminders(): void {
  snapshot = {
    ...snapshot,
    tasks: snapshot.tasks.map((task) =>
      task.done || !task.dueAt
        ? task
        : { ...task, nextRemindAt: new Date(Date.now() + Math.max(1, task.repeatMin) * 60000).toISOString() },
    ),
  };
  persist();
  emit();
  clearReminderBanner();
}

export function completeReminder(): void {
  const reminder = snapshot.reminder;
  if (!reminder) return;
  if (snapshot.tasks.some((task) => task.id === reminder.taskId)) {
    toggleTask(reminder.taskId);
  } else {
    clearReminderBanner();
  }
}

export function dismissReminder(): void {
  clearReminderBanner();
}

export function clearCompleted(): void {
  snapshot = { ...snapshot, tasks: snapshot.tasks.filter((task) => !task.done) };
  persist();
  emit();
}

/** Fire a one-off reminder so the user can verify notifications work. */
export function testReminder(): void {
  const now = Date.now();
  try {
    baseTitle = baseTitle ?? document.title;
    document.title = "🔔 MiniMix To-Do";
  } catch {
    /* noop */
  }
  sendBrowserNotification("Test reminder — it works!", "minimix-test");
  beep();
  snapshot = { ...snapshot, reminder: { taskId: "test", text: "Test reminder — it works!", at: now } };
  emit();
}
