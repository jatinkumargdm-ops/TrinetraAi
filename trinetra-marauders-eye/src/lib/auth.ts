export type AuthUser = { id: string; email: string; name: string };

async function jsonRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const data = await jsonRequest<{ user: AuthUser | null }>("/api/auth/me");
  return data.user;
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<AuthUser> {
  const data = await jsonRequest<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function registerRequest(
  email: string,
  password: string,
  name: string,
): Promise<AuthUser> {
  const data = await jsonRequest<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  return data.user;
}

export async function logoutRequest(): Promise<void> {
  await jsonRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}
