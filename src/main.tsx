import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import "./index.css";
import { startSync } from "@/lib/sync";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

if (convex) startSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {convex ? (
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConvexAuthProvider>
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
);
