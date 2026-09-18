export default function AuthCard({ title, subtitle, children }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-canvas p-6 shadow-[rgba(15,15,15,0.08)_0px_4px_12px_0px] sm:p-8">
        <h1 className="text-[28px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-sm leading-[1.5] text-steel">{subtitle}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
