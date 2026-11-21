import { NavLink, Route, Routes } from "react-router";
import { ExercisePage } from "./pages/ExercisePage";
import { LogPage } from "./pages/LogPage";
import { ManagePage } from "./pages/ManagePage";
import { RecordsPage } from "./pages/RecordsPage";

const tabs = [
  { to: "/", label: "Records", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  { to: "/log", label: "Log", icon: "M12 5v14M5 12h14" },
  { to: "/manage", label: "Manage", icon: "M4 6h16M4 12h16M4 18h10" },
];

export function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <main className="flex-1 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
        <Routes>
          <Route index element={<RecordsPage />} />
          <Route path="exercises/:exerciseId" element={<ExercisePage />} />
          <Route path="log" element={<LogPage />} />
          <Route path="log/:entryId" element={<LogPage />} />
          <Route path="manage" element={<ManagePage />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/"}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${isActive ? "text-accent" : "text-zinc-500"}`}
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
