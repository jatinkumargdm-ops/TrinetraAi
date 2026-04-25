export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthError = {
  message: string;
  status: number;
};

async function jsonOrError(res: Response): Promise<unknown> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ??
      `Request failed (${res.status})`;
    const err: AuthError = { message, status: res.status };
    throw err;
  }
  return body;
}

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const res = await fetch("/_api/auth/me", {
      credentials: "include",
    });
    if (res.status === 401) return null;
    const body = (await jsonOrError(res)) as { user: SessionUser };
    return body.user;
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string,
): Promise<SessionUser> {
  const res = await fetch("/_api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const body = (await jsonOrError(res)) as { user: SessionUser };
  return body.user;
}

export async function signup(
  name: string,
  email: string,
  password: string,
): Promise<SessionUser> {
  const res = await fetch("/_api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, email, password }),
  });
  const body = (await jsonOrError(res)) as { user: SessionUser };
  return body.user;
}

export async function logout(): Promise<void> {
  await fetch("/_api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}
