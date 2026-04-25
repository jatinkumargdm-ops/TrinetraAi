import { useState } from "react";
import Landing, { type SourceConfig } from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Broadcaster from "./pages/Broadcaster";
import { unlockAudio } from "./lib/audio";

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

  if (broadcastId) {
    return <Broadcaster peerId={broadcastId} />;
  }

  return view.kind === "landing" ? (
    <Landing
      onStart={(source) => {
        unlockAudio();
        setView({ kind: "dashboard", source });
      }}
    />
  ) : (
    <Dashboard
      key={JSON.stringify(view.source)}
      source={view.source}
      onChangeSource={() => setView({ kind: "landing" })}
    />
  );
}
