import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Home from "@/pages/Home";
import AppView from "@/pages/AppView";
import Auth from "@/pages/Auth";
import { ReminderToast } from "@/components/ReminderToast";

export default function App() {
  const location = useLocation();

  return (
    <div className="flex min-h-dvh flex-col">
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1"
        >
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/app/:id" element={<AppView />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </motion.main>
      </AnimatePresence>

      <ReminderToast />

      <footer className="py-6 text-center text-xs text-slate-600">
        Made with <span className="text-rose-400">❤</span> by CryliaSoft
      </footer>
    </div>
  );
}
