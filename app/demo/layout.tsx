import Link from "next/link";
import { DemoNav } from "@/components/demo/demo-nav";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex h-screen w-[216px] shrink-0 flex-col gap-5 px-3.5 py-4.5">
        <div className="flex h-6 items-center gap-2 px-1.5">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7" fill="none" stroke="var(--ring-track)" strokeWidth="2.6" />
            <circle
              cx="10" cy="10" r="7" fill="none" stroke="var(--foreground)" strokeWidth="2.6"
              strokeDasharray="29.91 43.98" transform="rotate(-90 10 10)" strokeLinecap="round"
            />
          </svg>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Cadence</span>
          <span className="om-mono ml-auto text-[var(--ink4)]">DEMO</span>
        </div>

        <DemoNav />

        <div className="mt-auto flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <span className="flex size-6 items-center justify-center rounded-full border border-border bg-white text-[9.5px] font-semibold text-[var(--ink2)]">
            AR
          </span>
          <div className="flex min-w-0 flex-col leading-[15px]">
            <span className="truncate text-sm font-medium">Akmal Rahman</span>
            <span className="text-xs text-[var(--ink3)]">Admin (demo)</span>
          </div>
          <Link href="/login" className="ml-auto text-xs font-medium text-[var(--ink3)] hover:text-foreground">
            Exit
          </Link>
        </div>
      </aside>

      <main className="my-2.5 mr-2.5 flex min-h-[calc(100vh-1.25rem)] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(21,22,23,0.04),0_8px_24px_-16px_rgba(21,22,23,0.08)]">
        <div className="flex items-center justify-between border-b border-border bg-[var(--accent-soft)] px-6 py-2 text-xs font-medium text-primary">
          <span>You&apos;re viewing a demo — sample data, nothing here saves.</span>
          <Link href="/login" className="underline underline-offset-2 hover:no-underline">Sign in for real</Link>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
