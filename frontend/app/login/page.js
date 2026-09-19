"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "../../components/auth-card";
import { useAuth } from "../../components/auth-provider";
import { login, safeNextTarget } from "../../lib/auth";

const inputClass =
  "h-11 w-full rounded-lg border border-hairline-strong bg-canvas px-4 text-[16px] text-ink placeholder:text-muted focus-ring";

export default function LoginPage() {
  const router = useRouter();
  const { status, refresh } = useAuth();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Guest-only: a logged-in visitor landing here goes to their destination.
  useEffect(() => {
    if (status === "authenticated") router.push(safeNextTarget());
  }, [status, router]);

  const set = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await login(form);
      // Refresh first so the provider is authenticated before the
      // protected route renders (avoids a bounce back to /login).
      const session = await refresh();
      if (!session) {
        throw new Error("We could not start your session. Please try again.");
      }
      router.push(safeNextTarget());
    } catch (err) {
      if (err.code === "INVALID_CREDENTIALS" || err.status === 401) {
        setError("Incorrect email/username or password. Check both and try again.");
      } else if (err.fields?.identifier) {
        setError(err.fields.identifier);
      } else {
        setError(err.message || "Unable to log in. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to continue your financial life.">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="identifier" className="text-sm font-medium text-charcoal">
            Email or username
          </label>
          <input
            id="identifier"
            name="identifier"
            autoComplete="username"
            value={form.identifier}
            onChange={set("identifier")}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="password" className="text-sm font-medium text-charcoal">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={set("password")}
            placeholder="Your password"
            className={inputClass}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-[#e03131]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary focus-ring mt-2 inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-sm text-steel">
          New to Wealthify?{" "}
          <Link href="/signup" className="font-medium text-link">
            Create an account
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
