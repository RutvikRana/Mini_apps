import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Delete, History, RotateCcw } from "lucide-react";

type Operator = "+" | "−" | "×" | "÷";

type Entry = { id: number; label: string; result: string };

const KEYS: { label: string; kind: "fn" | "op" | "util" | "digit"; action: string; span?: boolean }[] = [
  { label: "AC", kind: "util", action: "clear" },
  { label: "±", kind: "util", action: "sign" },
  { label: "%", kind: "util", action: "percent" },
  { label: "÷", kind: "op", action: "/" },
  { label: "7", kind: "digit", action: "7" },
  { label: "8", kind: "digit", action: "8" },
  { label: "9", kind: "digit", action: "9" },
  { label: "×", kind: "op", action: "*" },
  { label: "4", kind: "digit", action: "4" },
  { label: "5", kind: "digit", action: "5" },
  { label: "6", kind: "digit", action: "6" },
  { label: "−", kind: "op", action: "-" },
  { label: "1", kind: "digit", action: "1" },
  { label: "2", kind: "digit", action: "2" },
  { label: "3", kind: "digit", action: "3" },
  { label: "+", kind: "op", action: "+" },
  { label: "0", kind: "digit", action: "0", span: true },
  { label: ".", kind: "digit", action: "." },
  { label: "=", kind: "op", action: "=" },
];

const format = (value: number): string => {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e10) / 1e10;
  if (Math.abs(rounded) >= 1e12) return rounded.toExponential(6);
  const [int, dec] = rounded.toString().split(".");
  const grouped = Number(int).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return dec ? `${grouped}.${dec}` : grouped;
};

const apply = (a: number, b: number, op: Operator): number => {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? Number.NaN : a / b;
  }
};

const symbol: Record<string, Operator | null> = { "+": "+", "-": "−", "*": "×", "/": "÷", "=": null };

export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [replace, setReplace] = useState(true);
  const [history, setHistory] = useState<Entry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const current = useMemo(() => Number(display.replace(/,/g, "")) || 0, [display]);

  const inputDigit = useCallback(
    (digit: string) => {
      setDisplay((prev) => {
        if (replace) return digit === "." ? "0." : digit;
        if (digit === "." && prev.includes(".")) return prev;
        if (prev === "0" && digit !== ".") return digit;
        if (prev.replace(/[^0-9]/g, "").length >= 12) return prev;
        return prev + digit;
      });
      setReplace(false);
    },
    [replace],
  );

  const chooseOperator = useCallback(
    (op: Operator) => {
      if (operator !== null && !replace && stored !== null) {
        const result = apply(stored, current, operator);
        setStored(result);
        setDisplay(format(result));
        setHistory((h) => [{ id: Date.now(), label: `${format(stored)} ${operator} ${format(current)}`, result: format(result) }, ...h].slice(0, 20));
      } else {
        setStored(current);
      }
      setOperator(op);
      setReplace(true);
    },
    [current, operator, replace, stored],
  );

  const equals = useCallback(() => {
    if (operator === null || stored === null) return;
    const result = apply(stored, current, operator);
    setHistory((h) => [{ id: Date.now(), label: `${format(stored)} ${operator} ${format(current)}`, result: format(result) }, ...h].slice(0, 20));
    setDisplay(format(result));
    setStored(null);
    setOperator(null);
    setReplace(true);
  }, [current, operator, stored]);

  const clear = useCallback(() => {
    setDisplay("0");
    setStored(null);
    setOperator(null);
    setReplace(true);
  }, []);

  const backspace = useCallback(() => {
    setDisplay((prev) => {
      if (prev === "Error") return "0";
      const next = prev.length > 1 ? prev.slice(0, -1) : "0";
      return next === "-0" ? "0" : next;
    });
  }, []);

  const toggleSign = useCallback(() => {
    setDisplay((prev) => (prev.startsWith("-") ? prev.slice(1) : prev === "0" ? prev : `-${prev}`));
  }, []);

  const percent = useCallback(() => {
    setDisplay(format(current / 100));
    setReplace(true);
  }, [current]);

  const press = useCallback(
    (action: string) => {
      if (/^[0-9.]$/.test(action)) return inputDigit(action);
      switch (action) {
        case "clear":
          return clear();
        case "sign":
          return toggleSign();
        case "percent":
          return percent();
        case "back":
          return backspace();
        case "=":
          return equals();
        default: {
          const op = symbol[action];
          if (op) chooseOperator(op);
        }
      }
    },
    [backspace, chooseOperator, clear, equals, inputDigit, percent, toggleSign],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      const map: Record<string, string> = {
        Enter: "=",
        "=": "=",
        Backspace: "back",
        Escape: "clear",
        c: "clear",
        C: "clear",
        "%": "%",
      };
      const action = map[key] ?? (key.length === 1 ? key : null);
      if (!action) return;
      if (["+", "-", "*", "/", "="].includes(action)) event.preventDefault();
      press(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const lastEntry = history[0];

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-4">
      <div className="glass rounded-3xl p-5 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-[0.2em] text-slate-500 uppercase">
            {lastEntry ? lastEntry.label : "Ready"}
          </p>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-pressed={showHistory}
            aria-label="Toggle calculation history"
            className="focus-ring rounded-lg p-1.5 text-slate-500 transition hover:text-aqua-300"
          >
            <History className="h-4 w-4" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {showHistory && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="no-scrollbar mt-3 max-h-40 space-y-1 overflow-y-auto border-t border-white/5 pt-3"
            >
              {history.length === 0 && <li className="text-sm text-slate-600">No calculations yet</li>}
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="truncate font-mono text-slate-500">{entry.label}</span>
                  <span className="font-mono text-slate-300">= {entry.result}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <motion.output
          key={display}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="mt-4 block overflow-x-auto text-right font-mono text-5xl font-medium tracking-tight text-white tabular-nums"
        >
          {display}
        </motion.output>
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-4 gap-2.5">
        {KEYS.map((key) => {
          const isActive = key.action === "=" || (operator && symbol[key.action] === operator && replace);
          const style =
            key.kind === "digit"
              ? "bg-white/[0.06] text-white hover:bg-white/[0.12]"
              : key.kind === "op"
                ? "bg-aqua-500/15 text-aqua-300 hover:bg-aqua-500/25"
                : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200";
          return (
            <button
              key={key.action + key.label}
              type="button"
              onClick={() => press(key.action)}
              aria-label={key.label}
              className={`focus-ring rounded-2xl py-4 text-xl font-medium transition active:scale-[0.96] ${
                key.span ? "col-span-2" : ""
              } ${style} ${isActive ? "ring-1 ring-aqua-400/60" : ""}`}
            >
              {key.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-slate-600">
        <span>Keyboard enabled · Enter = · Esc clears</span>
        <span className="flex items-center gap-1">
          <Delete className="h-3.5 w-3.5" /> backspace
        </span>
      </div>

      {history.length > 0 && (
        <button
          type="button"
          onClick={() => setHistory([])}
          className="focus-ring mx-auto flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-500 transition hover:border-white/20 hover:text-slate-300"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Clear history
        </button>
      )}
    </div>
  );
}
