import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";

/**
 * Dedicated sign-in route. The AuthCard handles the email/password form and
 * the signed-in state; once authenticated the user is sent on their way.
 * Sign-in itself is app-wide — the home page hosts the same card.
 */
export default function Auth() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/app/todo";

  // If the user is already signed in, AuthCard's redirectTo fires immediately.
  useEffect(() => {
    document.title = "MiniMix — sign in";
    return () => {
      document.title = "MiniMix — tiny apps, one tap away";
    };
  }, []);

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
          <h1 className="text-2xl font-bold tracking-tight text-white">MiniMix account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in once — every app that syncs (To-Do today, more later) follows your account.
          </p>
          <div className="mt-5">
            <AuthCard redirectTo={returnTo} />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-600">
          Signed-in tasks sync via Convex. Signed out, everything stays on this device.
        </p>
      </motion.div>
    </div>
  );
}
