import { useEffect, useState } from "react";
import Landing, { type SourceConfig } from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Broadcaster from "./pages/Broadcaster";
import Auth from "./pages/Auth";
import { unlockAudio } from "./lib/audio";
import { fetchMe, logout, type SessionUser } from "./lib/auth";

type View =
  | { kind: "landing" }
  | { kind: "dashboard"; source: SourceConfig };

function readBroadcastId(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("broadcast");
  return id && id.trim().length > 0 ? id.trim() : null;
}

export default function App() {
  const broadcastId = readBroadcastId();
  const [view, setView] = useState<View>({ kind: "landing" });

  // The phone-side broadcaster page is intentionally public — anyone with the
  // shared link can stream to a logged-in user's dashboard.
  if (broadcastId) {
    return <Broadcaster peerId={broadcastId} />;
  }

  return (
    <Gate>
      {(user, signOut) =>
        view.kind === "landing" ? (
          <Landing
            user={user}
            onSignOut={signOut}
            onStart={(source) => {
              unlockAudio();
              setView({ kind: "dashboard", source });
            }}
          />
        ) : (
          <Dashboard
            key={JSON.stringify(view.source)}
            source={view.source}
            user={user}
            onSignOut={signOut}
            onChangeSource={() => setView({ kind: "landing" })}
          />
        )
      }
    </Gate>
  );
}

function Gate({
  children,
}: {
  children: (user: SessionUser, signOut: () => Promise<void>) => React.ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await fetchMe();
      if (cancelled) return;
      setUser(u);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    await logout();
    setUser(null);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fbf3dd] text-[#2b1d0e]">
        <div
          className="w-10 h-10 rounded-full border-2 border-[#b59868] border-t-[#740001]"
          style={{ animation: "spin 0.9s linear infinite" }}
        />
        <div className="mt-3 font-quill italic text-sm text-[#5a4226]">
          Consulting the parchment…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthed={(u) => setUser(u)} />;
  }

  return <>{children(user, signOut)}</>;
}
