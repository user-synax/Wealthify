"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthCard from "../../components/auth-card";
import { useAuth } from "../../components/auth-provider";
import { safeNextTarget, signup } from "../../lib/auth";

const inputClass =
  "h-11 w-full rounded-lg border border-hairline-strong bg-canvas px-4 text-[16px] text-ink placeholder:text-muted focus-ring";

export default function SignupPage() {
  const router = useRouter();
  const { status, refresh } = useAuth();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
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
    setErrors({});
    try {
      await signup(form);
      // Refresh first so the provider is authenticated before the
      // protected route renders (avoids a bounce back to /login).
      await refresh();
      router.push(safeNextTarget());
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      else setErrors({ form: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Virtual money only. No deposits, no bank details, no real risk."
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="username" className="text-sm font-medium text-charcoal">
            Username
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={set("username")}
            placeholder="e.g. priya_saves"
            className={inputClass}
          />
          {errors.username ? (
            <p className="text-sm text-[#e03131]">{errors.username}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <label htmlFor="email" className="text-sm font-medium text-charcoal">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@example.com"
            className={inputClass}
          />
          {errors.email ? (
            <p className="text-sm text-[#e03131]">{errors.email}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <label htmlFor="password" className="text-sm font-medium text-charcoal">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            placeholder="At least 8 characters"
            className={inputClass}
          />
          {errors.password ? (
            <p className="text-sm text-[#e03131]">{errors.password}</p>
          ) : null}
        </div>

        {errors.form ? (
          <p role="alert" className="text-sm text-[#e03131]">
            {errors.form}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="btn-primary focus-ring mt-2 inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-sm text-steel">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-link">
            Log in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
