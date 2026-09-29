import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        onChange("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-white/5 bg-ink-950/70 px-4 pt-3 pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="glass focus-within:border-aqua-400/40 flex items-center gap-3 rounded-2xl px-4 py-2.5 transition">
        <Search className="h-4 w-4 shrink-0 text-slate-500" />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search apps…"
          aria-label="Search apps"
          className="placeholder:text-slate-600 w-full bg-transparent text-sm text-slate-100 outline-none"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="focus-ring rounded-md p-1 text-slate-500 transition hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">/</kbd>
        )}
      </div>
    </div>
  );
}
