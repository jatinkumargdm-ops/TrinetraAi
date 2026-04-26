import { useState } from "react";
import Landing, { type SourceConfig } from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Broadcaster from "./pages/Broadcaster";
import AuthPage from "./pages/AuthPage";
import { unlockAudio } from "./lib/audio";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

type View =
  | { kind: "landing" }
  | { kind: "dashboard"; source: SourceConfig };

function readBroadcastId(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("broadcast");
  return id && id.trim().length > 0 ? id.trim() : null;
}

function AuthGatedApp() {
  const auth = useAuth();
  const [view, setView] = useState<View>({ kind: "landing" });

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#5a4226] font-quill italic">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-2 border-[#b59868] border-t-[#740001]"
            style={{ animation: "spin 0.9s linear infinite" }}
          />
          <div>Consulting the Marauder's Map…</div>
        </div>
      </div>
    );
  }

  if (auth.status !== "authenticated") {
    return <AuthPage />;
  }

  const handleSignOut = async () => {
    await auth.logout();
    setView({ kind: "landing" });
  };

  return view.kind === "landing" ? (
    <Landing
      user={auth.user ?? undefined}
      onSignOut={handleSignOut}
      onStart={(source) => {
        unlockAudio();
        setView({ kind: "dashboard", source });
      }}
    />
  ) : (
    <Dashboard
      key={JSON.stringify(view.source)}
      source={view.source}
      user={auth.user ?? undefined}
      onSignOut={handleSignOut}
      onChangeSource={() => setView({ kind: "landing" })}
    />
  );
}

export default function App() {
  const broadcastId = readBroadcastId();

  // The phone broadcaster is opened from a QR shared by an authenticated
  // dashboard owner. It only needs the peerId in the URL — no login required
  // on the phone itself.
  if (broadcastId) {
    return <Broadcaster peerId={broadcastId} />;
  }

  return (
    <AuthProvider>
      <AuthGatedApp />
    </AuthProvider>
  );
}
