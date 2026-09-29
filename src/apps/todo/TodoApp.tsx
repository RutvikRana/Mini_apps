import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, BellRing, Check, Plus, RefreshCw, Trash2, X } from "lucide-react";

/**
 * MiniMix To-Do — tasks with optional due times and repeating reminders.
 *
 * A reminder fires at the task's due time and repeats every N minutes
 * (per task, default 2) until the task is checked off.
 * Browser notifications are used when permitted; otherwise an in-app
 * banner + title flash keep the fallback visible.
 */

type Task = {
  id: string;
  text: string;
  done: boolean;
  /** ISO timestamp of the due time, or null for tasks without a reminder. */
  dueAt: string | null;
  /** Reminder interval in minutes (used when dueAt is set). */
  repeatMin: number;
  /** ISO timestamp of the next due reminder (recomputed until done). */
  nextRemindAt: string | null;
  createdAt: number;
};

const STORAGE_KEY = "minimix.todo.v1";
const ASKED_KEY = "minimix.todo.notifyAsked";
const DEFAULT_REPEAT = 2;
const REPEAT_CHOICES = [1, 2, 5, 10, 15, 30];

const loadTasks = (): Task[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Task => !!t && typeof t.text === "string" && typeof t.done === "boolean",
    );
  } catch {
    return [];
  }
};

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Local ISO string with minutes precision for <input type="datetime-local"> */
const toLocalInput = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDue = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
};

/** Minutes until due, rounded for display ("overdue by X"). */
const relativeDue = (iso: string, now: number) => {
  const diff = new Date(iso).getTime() - now;
  const min = Math.round(diff / 60000);
  if (diff < 0 && min > -60) return `overdue ${Math.abs(min) || 1}m`;
  if (diff < 0) return `overdue ${Math.round(Math.abs(diff) / 3600000)}h`;
  if (min < 60) return `in ${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `in ${hours}h ${min % 60 ? `${min % 60}m` : ""}`.trim();
  return `in ${Math.floor(hours / 24)}d`;
};

export default function TodoApp() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftRepeat, setDraftRepeat] = useState(DEFAULT_REPEAT);
  const [showTime, setShowTime] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      /* storage full/blocked — keep working in memory */
    }
  }, [tasks]);

  // Ticking clock drives reminders + relative labels
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const notify = useCallback((task: Task) => {
    const message = `Time to: ${task.text}`;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("MiniMix To-Do", { body: message, tag: task.id });
      } catch {
        /* some browsers require SW; fall through to banner */
      }
    }
    setBanner(message);
    try {
      document.title = `🔔 ${message}`;
    } catch {
      /* noop */
    }
  }, []);

  // Reminder engine: when now passes nextRemindAt, fire and reschedule by repeatMin
  useEffect(() => {
    setTasks((prev) => {
      let changed = false;
      const fired: Task[] = [];
      const next = prev.map((task) => {
        if (task.done || !task.nextRemindAt) return task;
        const due = new Date(task.nextRemindAt).getTime();
        if (Number.isNaN(due) || due > now) return task;
        changed = true;
        fired.push(task);
        const step = Math.max(1, task.repeatMin) * 60000;
        // Keep firing while the schedule is behind now (tab slept a while)
        let nextAt = due + step;
        while (nextAt <= now) nextAt += step;
        return { ...task, nextRemindAt: new Date(nextAt).toISOString() };
      });
      fired.forEach(notify);
      return changed ? next : prev;
    });
  }, [now, notify]);

  const askPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {
      /* noop */
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      try {
        new Notification("MiniMix To-Do", { body: "Reminders are on ✅" });
      } catch {
        /* noop */
      }
    }
  }, []);

  useEffect(() => {
    if (permission !== "default") return;
    let asked = false;
    try {
      asked = localStorage.getItem(ASKED_KEY) === "1";
    } catch {
      /* noop */
    }
    if (!asked && tasks.some((t) => !t.done && t.dueAt)) {
      void askPermission();
    }
  }, [askPermission, permission, tasks]);

  const dismissBanner = useCallback(() => {
    setBanner(null);
    document.title = "MiniMix — tiny apps, one tap away";
  }, []);

  const addTask = useCallback(() => {
    const text = draft.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    const dueDate = draftDue ? new Date(draftDue) : null;
    const validDue = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null;
    const task: Task = {
      id: newId(),
      text,
      done: false,
      dueAt: validDue ? validDue.toISOString() : null,
      repeatMin: draftRepeat,
      nextRemindAt: validDue ? validDue.toISOString() : null,
      createdAt: Date.now(),
    };
    setTasks((prev) => [task, ...prev]);
    setDraft("");
    setDraftDue("");
    setShowTime(false);
    setDraftRepeat(DEFAULT_REPEAT);
    inputRef.current?.focus();
  }, [draft, draftDue, draftRepeat]);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, done: !task.done, nextRemindAt: null } : task)),
    );
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const snoozeAll = useCallback(() => {
    setTasks((prev) =>
      prev.map((task) =>
        task.done || !task.dueAt
          ? task
          : { ...task, nextRemindAt: new Date(Date.now() + Math.max(1, task.repeatMin) * 60000).toISOString() },
      ),
    );
    dismissBanner();
  }, [dismissBanner]);

  const setRepeat = useCallback((id: string, repeatMin: number) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              repeatMin,
              nextRemindAt:
                task.done || !task.dueAt
                  ? task.nextRemindAt
                  : new Date(Date.now() + repeatMin * 60000).toISOString(),
            }
          : task,
      ),
    );
  }, []);

  const changeDue = useCallback((id: string, value: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const date = value ? new Date(value) : null;
        const valid = date && !Number.isNaN(date.getTime()) ? date : null;
        return {
          ...task,
          dueAt: valid ? valid.toISOString() : null,
          nextRemindAt: task.done || !valid ? null : valid.toISOString(),
        };
      }),
    );
  }, []);

  const open = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const doneCount = tasks.length - open.length;
  const active = open.length;

  const sortTasks = (a: Task, b: Task) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const at = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bt = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.createdAt - b.createdAt;
  };
  const sorted = useMemo(() => [...tasks].sort(sortTasks), [tasks]);

  const permissionLabel =
    permission === "granted"
      ? "Notifications on"
      : permission === "denied"
        ? "Notifications blocked — in-app reminders only"
        : permission === "unsupported"
          ? "No notification support — in-app reminders"
          : "Enable notifications";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      {banner && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="glass flex items-start gap-3 rounded-2xl border-amber-glow/40 bg-amber-glow/10 p-3"
          role="alert"
        >
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-glow" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-200">{banner}</p>
            <p className="mt-0.5 text-xs text-slate-400">Reminder — repeats until you check it off.</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={snoozeAll}
              className="focus-ring rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Snooze all reminders"
              title="Snooze"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              className="focus-ring rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss reminder"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}

      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
            placeholder="Add a task…"
            aria-label="New task"
            className="focus-ring min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={() => setShowTime((v) => !v)}
            aria-pressed={showTime}
            aria-label="Toggle reminder time"
            title="Remind me at a time"
            className={`focus-ring rounded-xl p-2 transition ${
              showTime ? "bg-amber-glow/20 text-amber-glow" : "text-slate-500 hover:bg-white/10 hover:text-slate-300"
            }`}
          >
            <AlarmClock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={addTask}
            aria-label="Add task"
            className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-aqua-500/20 text-aqua-300 transition hover:bg-aqua-500/30 active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {showTime && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Remind at
                  <input
                    type="datetime-local"
                    value={draftDue}
                    onChange={(e) => setDraftDue(e.target.value)}
                    className="focus-ring rounded-lg border border-white/10 bg-ink-800 px-2 py-1 text-xs text-white [color-scheme:dark]"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  every
                  <select
                    value={draftRepeat}
                    onChange={(e) => setDraftRepeat(Number(e.target.value))}
                    className="focus-ring rounded-lg border border-white/10 bg-ink-800 px-1.5 py-1 text-xs text-white"
                  >
                    {REPEAT_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs text-slate-600">until done</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-slate-600">
        <span>
          {active} open · {doneCount} done
        </span>
        <button
          type="button"
          onClick={askPermission}
          disabled={permission === "granted" || permission === "unsupported"}
          className={`focus-ring rounded-full px-2 py-1 transition ${
            permission === "granted" || permission === "unsupported"
              ? "text-aqua-300/70"
              : "text-slate-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          <BellRing className="mr-1 inline h-3 w-3" />
          {permissionLabel}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {sorted.map((task) => {
            const overdue = !task.done && task.nextRemindAt && new Date(task.nextRemindAt).getTime() <= now;
            const dueSoon =
              !task.done &&
              task.dueAt &&
              !overdue &&
              new Date(task.dueAt).getTime() - now < 30 * 60000 &&
              new Date(task.dueAt).getTime() > now;
            return (
              <motion.li
                key={task.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24 }}
                className={`glass flex items-start gap-3 rounded-2xl p-3 transition ${
                  overdue ? "border-amber-glow/40 bg-amber-glow/[0.07]" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  role="checkbox"
                  aria-checked={task.done}
                  aria-label={task.done ? `Mark "${task.text}" as open` : `Complete "${task.text}"`}
                  className={`focus-ring mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition active:scale-90 ${
                    task.done
                      ? "border-aqua-400 bg-aqua-500 text-ink-950"
                      : "border-white/25 text-transparent hover:border-aqua-400/70 hover:bg-aqua-500/10"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-snug transition ${
                      task.done ? "text-slate-600 line-through decoration-slate-600" : "text-white"
                    }`}
                  >
                    {task.text}
                  </p>
                  {task.dueAt && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={overdue ? "text-amber-glow" : dueSoon ? "text-amber-200/90" : "text-slate-500"}>
                        <AlarmClock className="mr-1 inline h-3 w-3" />
                        {formatDue(task.dueAt)} · {relativeDue(task.dueAt, now)}
                      </span>
                      <span className="text-slate-700">·</span>
                      <span className="text-slate-500">reminds every</span>
                      <select
                        value={task.repeatMin}
                        onChange={(e) => setRepeat(task.id, Number(e.target.value))}
                        aria-label={`Reminder interval for "${task.text}"`}
                        className="focus-ring rounded-md border border-white/10 bg-ink-800 px-1 py-0.5 text-[11px] text-slate-300"
                      >
                        {REPEAT_CHOICES.map((m) => (
                          <option key={m} value={m}>
                            {m}m
                          </option>
                        ))}
                      </select>
                      {!task.done && (
                        <input
                          type="datetime-local"
                          value={task.dueAt ? toLocalInput(new Date(task.dueAt)) : ""}
                          onChange={(e) => changeDue(task.id, e.target.value)}
                          aria-label={`Change due time for "${task.text}"`}
                          className="focus-ring rounded-md border border-white/10 bg-ink-800 px-1 py-0.5 text-[11px] text-slate-300 [color-scheme:dark]"
                        />
                      )}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  aria-label={`Delete "${task.text}"`}
                  className="focus-ring rounded-lg p-1.5 text-slate-600 transition hover:bg-coral/10 hover:text-coral"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {tasks.length === 0 && (
        <p className="glass rounded-2xl p-6 text-center text-sm text-slate-600">
          Nothing here yet. Add your first task — set a time to get reminders.
        </p>
      )}

      {doneCount > 0 && active === 0 && (
        <button
          type="button"
          onClick={() => setTasks((prev) => prev.filter((t) => !t.done))}
          className="focus-ring mx-auto flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-500 transition hover:border-white/20 hover:text-slate-300"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear completed
        </button>
      )}
    </div>
  );
}
