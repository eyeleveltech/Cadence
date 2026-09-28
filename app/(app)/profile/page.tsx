import { requireUser } from "@/lib/session";
import { ProfileView } from "./profile-view";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="space-y-6 px-8 pt-[26px] pb-8">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Account &amp; Security</h1>
        <p className="mt-1 text-sm text-[var(--ink3)]">
          Manage your personal profile, credentials, and password security.
        </p>
      </div>

      <ProfileView user={user} />
    </div>
  );
}
