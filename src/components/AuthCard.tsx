import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Cloud, CloudOff, Loader2, LogIn, LogOut, UserPlus } from "lucide-react";
import { api } from "../../convex/_generated/api";

/**
 * Global account card for MiniMix.
 *
 * Signed out → inline email/password sign-in / sign-up (the password provider
 * is named "password"; the mode is passed as its `flow` param).
 * Signed in → email chip + sign out. The session is app-wide: every mini app
 * that talks to Convex (sync, reminders) sees it immediately.
 */
export function AuthCard({ redirectTo, compact = false }: { redirectTo?: string; compact?: boolean }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const navigate = useNavigate();

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [open, setOpen] = useState(!compact);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && redirectTo) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await signIn("password", { flow: mode, email: email.trim(), password });
        setPassword("");
        if (compact) setOpen(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message.replace("Uncaught Error: ", "")
            : "Something went wrong — try again",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, compact, email, mode, password, signIn],
  );

  if (isLoading) {
    return (
      <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking account…
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-aqua-400 to-teal-600">
            <Cloud className="h-4 w-4 text-ink-950/85" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{me?.email ?? "Signed in"}</span>
            <span className="block text-[11px] text-slate-500">Tasks sync to your account</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    );
  }

  const form = (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        className="focus-ring rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
      />
      <input
        type="password"
        required
        minLength={8}
        autoComplete={mode === "signIn" ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (8+ characters)"
        aria-label="Password"
        className="focus-ring rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
      />
      {error && (
        <p role="alert" className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl bg-aqua-500/25 px-4 py-2.5 text-sm font-medium text-aqua-300 transition hover:bg-aqua-500/40 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mode === "signIn" ? (
            <LogIn className="h-4 w-4" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          {mode === "signIn" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
          className="focus-ring rounded-xl px-3 py-2.5 text-xs text-slate-500 transition hover:text-slate-300"
        >
          {mode === "signIn" ? "Sign up instead" : "Have an account?"}
        </button>
      </div>
    </form>
  );

  if (compact) {
    return (
      <div className="glass rounded-2xl px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-300">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-slate-500 to-slate-700">
              <CloudOff className="h-4 w-4 text-slate-200" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-white">Sign in to MiniMix</span>
              <span className="block text-[11px] text-slate-500">Sync your tasks across devices</span>
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-aqua-500/20 px-2.5 py-1 text-xs font-medium text-aqua-300">
            {open ? "Close" : "Sign in"}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3">{form}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return <div>{form}</div>;
}
