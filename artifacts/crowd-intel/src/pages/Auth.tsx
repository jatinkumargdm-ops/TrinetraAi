import { useState } from "react";
import { Brand } from "./Landing";
import { ThemeToggle } from "../components/ThemeToggle";
import { login, signup, type SessionUser } from "../lib/auth";

type Mode = "login" | "signup";

export default function Auth({
  onAuthed,
}: {
  onAuthed: (user: SessionUser) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === "login"
          ? await login(email.trim(), password)
          : await signup(name.trim(), email.trim(), password);
      onAuthed(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
      setError(msg ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const swapMode = () => {
    setError(null);
    setMode((m) => (m === "login" ? "signup" : "login"));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#b59868] bg-[#fbf3dd]/70 backdrop-blur">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Brand />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 items-center">
        <section>
          <span className="tag bg-[#efd6c1] text-[#740001] mb-5 border border-[#b59868] inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#740001]" />
            The Marauder's Eye · Wizards Only
          </span>
          <h1 className="font-display font-extrabold text-[36px] lg:text-[48px] leading-[1.05] tracking-tight text-[#2b1d0e]">
            <span className="font-quill italic">"Show me your wand,</span>
            <br />
            <span className="brand-gradient font-quill italic">
              and I'll show you the map."
            </span>
          </h1>
          <p className="mt-6 text-[16px] leading-[1.7] text-[#5a4226] max-w-[520px] font-quill italic">
            The Eye won't open for just anyone. Sign in with your wizarding
            credentials to enter the corridor — only registered watchers may see
            the live map.
          </p>
        </section>

        <section>
          <form onSubmit={submit} className="card p-6 sm:p-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-[20px] text-[#2b1d0e] tracking-wide uppercase">
                {mode === "login" ? "Sign in" : "Create account"}
              </h2>
              <span className="text-[12px] font-quill italic text-[#8a6f44]">
                {mode === "login" ? "Returning watcher" : "New watcher"}
              </span>
            </div>

            {mode === "signup" && (
              <Field
                label="Wizard name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={setName}
                placeholder="Harry Potter"
                required
                disabled={busy}
              />
            )}

            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={setEmail}
              placeholder="harry@hogwarts.edu"
              required
              disabled={busy}
            />

            <Field
              label="Password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={setPassword}
              placeholder="At least 6 characters"
              required
              minLength={mode === "signup" ? 6 : 1}
              disabled={busy}
            />

            {error && (
              <div className="text-[13px] text-[#b91c1c] bg-[#fee2e2] border border-[#fecaca] rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary w-full justify-center"
            >
              {busy
                ? "Casting…"
                : mode === "login"
                  ? "Sign in →"
                  : "Create account →"}
            </button>

            <div className="text-center text-[13px] text-[#5a4226]">
              {mode === "login" ? (
                <>
                  No account yet?{" "}
                  <button
                    type="button"
                    onClick={swapMode}
                    className="text-[#740001] font-semibold underline-offset-2 hover:underline"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already a watcher?{" "}
                  <button
                    type="button"
                    onClick={swapMode}
                    className="text-[#740001] font-semibold underline-offset-2 hover:underline"
                  >
                    Sign in instead
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </main>

      <footer className="border-t border-[#b59868] py-5">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-center text-[12px] text-[#8a6f44]">
          <span className="font-quill italic">
            Messrs Moony, Wormtail, Padfoot &amp; Prongs guard the gate.
          </span>
        </div>
      </footer>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44] mb-1.5">
        {label}
      </div>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-md border border-[#b59868] bg-[#fffaf0] text-[#2b1d0e] focus:outline-none focus:border-[#740001] focus:ring-2 focus:ring-[#740001]/20 transition"
      />
    </label>
  );
}
