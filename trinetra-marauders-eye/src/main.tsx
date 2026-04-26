import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyThemeToHtml } from "./components/ThemeToggle";

// Apply saved theme synchronously, before React paints — no flash.
// `?theme=dark` (or `?theme=light`) overrides and persists.
try {
  const url = new URL(window.location.href);
  const param = url.searchParams.get("theme");
  if (param === "dark" || param === "light") {
    window.localStorage.setItem("trinetra-theme", param);
    applyThemeToHtml(param);
  } else {
    const saved = window.localStorage.getItem("trinetra-theme");
    applyThemeToHtml(saved === "dark" ? "dark" : "light");
  }
} catch {
  applyThemeToHtml("light");
}

createRoot(document.getElementById("root")!).render(<App />);
