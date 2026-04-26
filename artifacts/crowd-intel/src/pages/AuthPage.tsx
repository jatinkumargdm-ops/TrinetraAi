import { useState } from "react";
import { Brand } from "./Landing";
import { useAuth } from "../contexts/AuthContext";

type Mode = "login" | "register";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#b59868] bg-[#fbf3dd]/70 backdrop-blur">
        <div className="max-w-[720px] mx-auto px-5 h-16 flex items-center">
          <Brand />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="card w-full max-w-md p-6 sm:p-7">
          <span className="tag bg-[#efd6c1] text-[#740001] mb-3 border border-[#b59868] inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#740001]" />
            {mode === "login" ? "Speak the password" : "Forge your wand"}
          </span>
          <h1 className="font-display font-extrabold text-[26px] sm:text-[30px] leading-tight text-[#2b1d0e]">
            {mode === "login" ? (
              <>
                <span className="font-quill italic">Welcome back to </span>
                <span className="brand-gradient font-quill italic">
                  the map.
                </span>
              </>
            ) : (
              <>
                <span className="font-quill italic">Enroll at </span>
                <span className="brand-gradient font-quill italic">
                  Trinetra.
                </span>
              </>
            )}
          </h1>
          <p className="mt-2 text-[13px] text-[#5a4226] font-quill italic">
            {mode === "login"
              ? "Sign in to reveal the Marauder's Eye."
              : "Create an account so the Eye remembers your watch."}
          </p>

          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
            {mode === "register" && (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-[0.18em] text-[#8a6f44]">
                  Name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="rounded-md border border-[#b59868] bg-[#fbf3dd] px-3 py-2 text-[14px] text-[#2b1d0e] outline-none focus:border-[#740001]"
                  placeholder="Harry Potter"
                />
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#8a6f44]">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="rounded-md border border-[#b59868] bg-[#fbf3dd] px-3 py-2 text-[14px] text-[#2b1d0e] outline-none focus:border-[#740001]"
                placeholder="you@hogwarts.edu"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-[#8a6f44]">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                className="rounded-md border border-[#b59868] bg-[#fbf3dd] px-3 py-2 text-[14px] text-[#2b1d0e] outline-none focus:border-[#740001]"
                placeholder={
                  mode === "login" ? "••••••••" : "At least 8 characters"
                }
              />
            </label>

            {error && (
              <div className="text-[12px] text-[#b91c1c] bg-[#fee2e2] border border-[#fecaca] rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting
                ? mode === "login"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "login"
                  ? "Sign in →"
                  : "Create account →"}
            </button>
          </form>

          <div className="mt-5 text-center text-[13px] text-[#5a4226]">
            {mode === "login" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                  className="font-semibold text-[#740001] hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already enrolled?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="font-semibold text-[#740001] hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-[#d6c08a] py-4 text-center text-[12px] text-[#8a6f44] font-quill italic">
        Messrs Moony, Wormtail, Padfoot &amp; Prongs are proud to present —
        TRINETRA · The Marauder's Eye
      </footer>
    </div>
  );
}
