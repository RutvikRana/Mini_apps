import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, LogIn, UserPlus } from "lucide-react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

/**
 * MiniMix account — email + password sign-in / sign-up via Convex auth.
 * Successful auth lands back on the page the user came from.
 */
export default function Auth() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = params.get("returnTo") || "/app/todo";

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, returnTo]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await signIn(mode, { email: email.trim(), password });
        // ConvexAuthProvider flips isAuthenticated; the effect above navigates.
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
    [busy, email, mode, password, signIn],
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Link
          to="/"
          aria-label="Back to home"
          className="focus-ring glass mb-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="glass rounded-3xl p-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {mode === "signIn" ? "Welcome back" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "signIn"
              ? "Sign in to sync your to-dos across devices."
              : "Sign up to keep your to-dos in the cloud."}
          </p>

          {isAuthenticated && (
            <p className="mt-4 rounded-xl border border-aqua-400/30 bg-aqua-500/10 px-3 py-2 text-xs text-aqua-300">
              Signed in{me?.email ? ` as ${me.email}` : ""} — redirecting…
            </p>
          )}

          <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs text-slate-500">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="focus-ring rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-slate-500">
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="focus-ring rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="focus-ring mt-1 flex items-center justify-center gap-2 rounded-xl bg-aqua-500/25 px-4 py-2.5 text-sm font-medium text-aqua-300 transition hover:bg-aqua-500/40 disabled:opacity-50"
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
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signIn" ? "signUp" : "signIn");
              setError(null);
            }}
            className="focus-ring mt-4 w-full rounded-lg px-2 py-1.5 text-xs text-slate-500 transition hover:text-slate-300"
          >
            {mode === "signIn" ? "No account yet? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-600">
          Signed-in tasks sync via Convex. Signed out, everything stays on this device.
        </p>
      </motion.div>
    </div>
  );
}
