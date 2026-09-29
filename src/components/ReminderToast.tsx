import { useCallback, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Check, X } from "lucide-react";
import { completeReminder, dismissReminder, getTodoSnapshot, snoozeReminders, subscribe } from "@/apps/todo/store";

/**
 * Global reminder toast, rendered by App.tsx so it is visible on every page
 * (home included) — not just inside the To-Do app.
 */
export function ReminderToast() {
  const { reminder } = useSyncExternalStore(subscribe, getTodoSnapshot);

  const onDone = useCallback(() => completeReminder(), []);
  const onSnooze = useCallback(() => snoozeReminders(), []);
  const onDismiss = useCallback(() => dismissReminder(), []);

  return (
    <AnimatePresence>
      {reminder && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          className="glass fixed inset-x-4 top-3 z-50 mx-auto max-w-sm rounded-2xl border-amber-glow/40 bg-ink-800/90 p-3 shadow-2xl shadow-black/50"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-amber-glow to-orange-600">
              <span className="absolute inset-0 animate-ping rounded-[30%] bg-amber-glow/40" />
              <BellRing className="relative h-4 w-4 text-ink-950/85" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium tracking-[0.18em] text-amber-glow/90 uppercase">Reminder</p>
              <p className="mt-0.5 truncate text-sm font-medium text-white">{reminder.text}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Repeats until checked off — snooze or dismiss below.</p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss reminder"
              className="focus-ring rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onDone}
              className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-aqua-500/25 px-3 py-2 text-xs font-medium text-aqua-300 transition hover:bg-aqua-500/40"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Done
            </button>
            <button
              type="button"
              onClick={onSnooze}
              className="focus-ring flex-1 rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.12]"
            >
              Snooze
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="focus-ring flex-1 rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.12]"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
