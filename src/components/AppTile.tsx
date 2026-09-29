import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { MiniApp } from "@/apps/registry";

type Props = {
  app: MiniApp;
  index: number;
};

export function AppTile({ app, index }: Props) {
  const Icon = app.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}
      className="group"
    >
      <Link
        to={`/app/${app.id}`}
        aria-label={app.name}
        className="focus-ring flex flex-col items-center gap-3"
      >
        <span
          className={`relative flex aspect-square w-full max-w-[104px] items-center justify-center rounded-[28%] bg-gradient-to-br ${app.tile} shadow-lg ${app.glow} transition duration-300 group-hover:-translate-y-1.5 group-hover:brightness-110`}
        >
          <Icon className="h-1/2 w-1/2 text-ink-950/85" strokeWidth={2.1} />
        </span>
        <span className="text-center text-[13px] leading-tight font-medium text-slate-300 group-hover:text-white">
          {app.name}
        </span>
      </Link>
    </motion.div>
  );
}
