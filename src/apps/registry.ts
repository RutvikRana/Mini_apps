import { lazy } from "react";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { Calculator, ListTodo, Pin } from "lucide-react";

export type AppCategory = "Utilities" | "Creativity" | "Play" | "Lifestyle";

export type MiniApp = {
  /** Unique id — also the route segment: /app/:id */
  id: string;
  name: string;
  tagline: string;
  category: AppCategory;
  /** Extra search terms so the search bar finds apps by intent, not just name. */
  keywords: string[];
  icon: LucideIcon;
  /** Tailwind classes for the app tile gradient. */
  tile: string;
  /** Ring/glow color used when the app is opened. */
  glow: string;
  /** Lazy-loaded so each mini app lands in its own chunk. */
  Component: ComponentType;
};

/**
 * The single source of truth for the launcher.
 *
 * To add an app:
 *  1. create `src/apps/<id>/index.tsx` with a default-exported component
 *  2. add one entry below
 * Done — it shows up in the grid, the search index and gets its own /app/<id> route.
 */
export const miniApps: MiniApp[] = [
  {
    id: "calculator",
    name: "Calculator",
    tagline: "Fast, precise arithmetic with a running history",
    category: "Utilities",
    keywords: ["math", "arithmetic", "sum", "add", "subtract", "multiply", "divide", "percent", "number"],
    icon: Calculator,
    tile: "from-aqua-400 to-teal-600",
    glow: "shadow-aqua-500/30",
    Component: lazy<ComponentType>(() => import("@/apps/calculator")),
  },
  {
    id: "todo",
    name: "To-Do List",
    tagline: "Tasks with checkboxes and repeating reminders",
    category: "Utilities",
    keywords: ["todo", "to-do", "task", "tasks", "list", "checklist", "reminder", "remind", "notify", "notification", "due", "time"],
    icon: ListTodo,
    tile: "from-amber-glow to-orange-600",
    glow: "shadow-amber-glow/30",
    Component: lazy<ComponentType>(() => import("@/apps/todo")),
  },
  {
    id: "pinterest",
    name: "Pinterest No Login",
    tagline: "Open pins and browse topics without an account",
    category: "Lifestyle",
    keywords: ["pinterest", "pin", "pin.it", "pins", "images", "inspiration", "ideas", "browse", "no login"],
    icon: Pin,
    tile: "from-rose-400 to-red-600",
    glow: "shadow-rose-500/30",
    Component: lazy<ComponentType>(() => import("@/apps/pinterest")),
  },
];

export function getApp(id: string | undefined) {
  return miniApps.find((app) => app.id === id);
}
