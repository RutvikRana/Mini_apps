import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SearchX, Sparkles } from "lucide-react";
import { miniApps, type AppCategory } from "@/apps/registry";
import { AppTile } from "@/components/AppTile";
import { AuthCard } from "@/components/AuthCard";
import { SearchBar } from "@/components/SearchBar";

const CATEGORIES: (AppCategory | "All")[] = ["All", ...new Set(miniApps.map((app) => app.category))];

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return miniApps.filter((app) => {
      if (category !== "All" && app.category !== category) return false;
      if (!q) return true;
      return [app.name, app.tagline, app.category, ...app.keywords].join(" ").toLowerCase().includes(q);
    });
  }, [category, query]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-20 sm:px-6">
      <header className="mb-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-aqua-300 mb-2 inline-flex items-center gap-1.5 rounded-full border border-aqua-400/20 bg-aqua-400/10 px-3 py-1 text-[11px] font-medium tracking-widest uppercase"
        >
          <Sparkles className="h-3 w-3" /> {miniApps.length} mini apps
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
        >
          MiniMix
        </motion.h1>
      </header>

      <div className="mb-4">
        <AuthCard compact />
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <nav className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="App categories">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`focus-ring shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              category === item
                ? "border-aqua-400/50 bg-aqua-400/15 text-aqua-300"
                : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      {results.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center">
          <SearchX className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">No app matches “{query}”.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
            className="focus-ring rounded-full border border-white/10 px-4 py-2 text-xs text-slate-400 transition hover:text-slate-200"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 grid-cols-sm-4 gap-x-4 gap-y-7 sm:gap-y-8">
          {results.map((app, index) => (
            <AppTile key={app.id} app={app} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
