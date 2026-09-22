import { getReviewQueue } from "@/lib/actions/review";
import { SignOutButton } from "@/components/sign-out-button";
import { ReviewQueue } from "./review-queue";

export default async function ReviewPage() {
  const { user, posts } = await getReviewQueue();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7" fill="none" stroke="var(--ring-track)" strokeWidth="2.6" />
            <circle
              cx="10" cy="10" r="7" fill="none" stroke="var(--foreground)" strokeWidth="2.6"
              strokeDasharray="29.91 43.98" transform="rotate(-90 10 10)" strokeLinecap="round"
            />
          </svg>
          Cadence
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Posts for your review</h1>
        <p className="mb-6 text-sm text-[var(--ink3)]">
          Approve, request changes, or leave a comment — right from your phone.
        </p>
        <ReviewQueue posts={posts} />
      </main>
    </div>
  );
}
