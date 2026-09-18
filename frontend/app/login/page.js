"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "../../components/auth-card";
import { login } from "../../lib/auth";

const inputClass =
  "h-11 w-full rounded-lg border border-hairline-strong bg-canvas px-4 text-[16px] text-ink placeholder:text-muted focus-ring";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const set = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await login(form);
      router.push("/profile");
    } catch (err) {
      if (err.code === "INVALID_CREDENTIALS") {
        setError("Incorrect email/username or password. Try again.");
      } else if (err.fields?.identifier) {
        setError(err.fields.identifier);
      } else {
        setError(err.message);
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
