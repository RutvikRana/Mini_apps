import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, BellRing, Check, Plus, Trash2 } from "lucide-react";
import {
  addTask,
  changeDue,
  clearCompleted,
  getTodoSnapshot,
  removeTask,
  setRepeat,
  subscribe,
  toggleTask,
  testReminder,
} from "./store";

/**
 * MiniMix To-Do UI. State and the reminder engine live in ./store (module
 * level), so reminders keep working on every page and the list survives
 * route changes. This component only renders.
 */

const DEFAULT_REPEAT = 2;
const REPEAT_CHOICES = [1, 2, 5, 10, 15, 30];

const pad = (n: number) => n.toString().padStart(2, "0");

/** Local ISO with minute precision for <input type="datetime-local"> */
const toLocalInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const formatDue = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
};

const relativeDue = (iso: string, now: number) => {
  const diff = new Date(iso).getTime() - now;
  const min = Math.round(diff / 60000);
  if (diff < 0 && min > -60) return `overdue ${Math.abs(min) || 1}m`;
  if (diff < 0) return `overdue ${Math.round(Math.abs(diff) / 3600000)}h`;
  if (min < 1) return "now";
  if (min < 60) return `in ${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `in ${hours}h${min % 60 ? ` ${min % 60}m` : ""}`;
  return `in ${Math.floor(hours / 24)}d`;
};

export default function TodoApp() {
  const snapshot = useSyncExternalStore(subscribe, getTodoSnapshot);
  const tasks = snapshot.tasks;

  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftRepeat, setDraftRepeat] = useState(DEFAULT_REPEAT);
  const [showTime, setShowTime] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const sync = () => setPermission(Notification.permission);
    sync();
    // Permission can change while the tab is open (user flips a browser setting).
    const timer = window.setInterval(sync, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const askPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") testReminder();
    } catch {
      /* iframe/embedded contexts may block the prompt */
    }
  }, []);

  const submit = useCallback(() => {
    const dueDate = draftDue ? new Date(draftDue) : null;
    const dueIso = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null;
    const text = draft.trim();
    if (!text) return;
    addTask(text, dueIso, draftRepeat);
    setDraft("");
    setDraftDue("");
    setShowTime(false);
    setDraftRepeat(DEFAULT_REPEAT);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 600);
    if (dueIso && typeof Notification !== "undefined" && Notification.permission === "default") {
      void askPermission();
    }
  }, [askPermission, draft, draftDue, draftRepeat]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") submit();
    },
    [submit],
  );

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const at = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
        const bt = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        return a.createdAt - b.createdAt;
      }),
    [tasks],
  );

  const now = Date.now();
  const openCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - openCount;

  const permissionLabel =
    permission === "granted"
      ? "Notifications on"
      : permission === "denied"
        ? "Blocked — banner only"
        : permission === "unsupported"
          ? "No notification support — banner only"
          : "Enable notifications";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
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
            onClick={submit}
            aria-label="Add task"
            className={`focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-aqua-500/20 text-aqua-300 transition hover:bg-aqua-500/30 active:scale-95 ${
              justAdded ? "bg-aqua-500/40" : ""
            }`}
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

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
        <span>
          {openCount} open · {doneCount} done
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={askPermission}
            disabled={permission !== "default"}
            className={`focus-ring rounded-full px-2 py-1 transition ${
              permission === "granted"
                ? "text-aqua-300/80"
                : permission === "default"
                  ? "text-slate-400 hover:bg-white/10 hover:text-white"
                  : "text-slate-600"
            }`}
          >
            <BellRing className="mr-1 inline h-3 w-3" />
            {permissionLabel}
          </button>
          <span className="text-slate-700">·</span>
          <button
            type="button"
            onClick={testReminder}
            className="focus-ring rounded-full px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Fire a sample reminder now"
          >
            Test reminder
          </button>
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {sorted.map((task) => {
            const overdue = !task.done && task.nextRemindAt && Date.parse(task.nextRemindAt) <= now;
            const dueSoon =
              !task.done &&
              task.dueAt &&
              !overdue &&
              Date.parse(task.dueAt) - now < 30 * 60000 &&
              Date.parse(task.dueAt) > now;
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
                      <span className="text-slate-500">every</span>
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
                          value={toLocalInput(new Date(task.dueAt))}
                          onChange={(e) => changeDue(task.id, e.target.value ? new Date(e.target.value).toISOString() : null)}
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

      {doneCount > 0 && openCount === 0 && (
        <button
          type="button"
          onClick={clearCompleted}
          className="focus-ring mx-auto flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-500 transition hover:border-white/20 hover:text-slate-300"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear completed
        </button>
      )}
    </div>
  );
}
