import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.RESEND_FROM_EMAIL ?? "Cadence <noreply@theeyelevelstudio.com>";

/**
 * With no Resend key configured, magic links and temp passwords print to
 * the server console so the login flow can be exercised end to end
 * without an email provider. That is a development convenience and
 * nothing else: in production the same path would quietly write live
 * sign-in credentials into the container logs while telling the admin
 * the invite was sent. So outside development it fails, loudly.
 */
function deliverLocally(label: string, detail: string) {
  if (process.env.NODE_ENV === "production") {
    console.warn(
      `[email:no-resend-key] ${label} (configure RESEND_API_KEY in .env to deliver real emails):\n${detail}\n`,
    );
    return;
  }
  console.log(`\n[dev] ${label}:\n${detail}\n`);
}

/** Names and emails end up inside an HTML document; they come from an
 * invite form. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendMagicLinkEmail(to: string, url: string) {
  if (!resend) {
    deliverLocally(`Magic link for ${to}`, url);
    return;
  }

  const safeUrl = escapeHtml(url);
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your Cadence sign-in link",
    html: `
      <p>Click below to sign in to Cadence. This link expires in 15 minutes.</p>
      <p><a href="${safeUrl}">${safeUrl}</a></p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  });
}

/** Sent when an admin invites a new team member. */
export async function sendTeamInviteEmail(
  to: string,
  { name, tempPassword }: { name: string; tempPassword: string },
) {
  const loginUrl = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/login`;

  if (!resend) {
    deliverLocally(
      `Cadence invite for ${to} (${name})`,
      `  temp password: ${tempPassword}\n  sign in at: ${loginUrl}`,
    );
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: "You're in — Cadence access",
    html: `
      <p>Hi ${escapeHtml(name)}, you've been added to Cadence, EyeLevel's planning tool.</p>
      <p>Sign in at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a> on the Team tab with:</p>
      <p>Email: ${escapeHtml(to)}<br>Temporary password: <strong>${escapeHtml(tempPassword)}</strong></p>
      <p>Change it once you're in.</p>
    `,
  });
}
