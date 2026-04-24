import { useState } from "react";
import Landing, { type SourceConfig } from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import { unlockAudio } from "./lib/audio";

type View =
  | { kind: "landing" }
  | { kind: "dashboard"; source: SourceConfig };

export default function App() {
  const [view, setView] = useState<View>({ kind: "landing" });

  if (view.kind === "landing") {
    return (
      <Landing
        onStart={(source) => {
          unlockAudio();
          setView({ kind: "dashboard", source });
        }}
      />
    );
  }

  return (
    <Dashboard
      key={JSON.stringify(view.source)}
      source={view.source}
      onChangeSource={() => setView({ kind: "landing" })}
    />
  );
}
