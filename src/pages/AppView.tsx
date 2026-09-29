import { Suspense, useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { getApp } from "@/apps/registry";

export default function AppView() {
  const { id } = useParams();
  const app = getApp(id);

  useEffect(() => {
    if (app) document.title = `${app.name} — MiniMix`;
    return () => {
      document.title = "MiniMix — tiny apps, one tap away";
    };
  }, [app]);

  if (!app) return <Navigate to="/" replace />;

  const Icon = app.icon;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-4 sm:px-6">
      <div className="sticky top-0 z-30 -mx-4 border-b border-white/5 bg-ink-950/80 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back to home"
            className="focus-ring glass flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br ${app.tile} ${app.glow}`}
          >
            <Icon className="h-4 w-4 text-ink-950/85" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-white">{app.name}</h1>
            <p className="truncate text-[11px] text-slate-500">{app.tagline}</p>
          </div>
          <span className="hidden font-mono text-[11px] text-slate-700 sm:block">/app/{app.id}</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={app.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col pt-5"
        >
          <Suspense
            fallback={
              <div className="glass flex h-64 items-center justify-center rounded-3xl">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-aqua-400/30 border-t-aqua-400" />
              </div>
            }
          >
            <app.Component />
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
