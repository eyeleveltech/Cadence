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
  { name, setupUrl }: { name: string; setupUrl: string },
) {
  const safeSetupUrl = escapeHtml(setupUrl);

  if (!resend) {
    deliverLocally(
      `Cadence invite for ${to} (${name})`,
      `  set password at: ${setupUrl}`,
    );
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to Cadence — Set up your account",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 36px 28px; background-color: #FAF9F7; border: 1px solid #E5E2DC; border-radius: 12px; color: #211D1A;">
        <div style="font-size: 22px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 24px; color: #211D1A;">Cadence</div>
        <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 16px 0; color: #211D1A; letter-spacing: -0.3px;">Welcome to the team, ${escapeHtml(name)}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #57534E; margin: 0 0 20px 0;">
          You've been invited to join <strong>Cadence</strong>, EyeLevel's social media planning and publishing workspace.
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #57534E; margin: 0 0 28px 0;">
          Click below to set your password and access your workspace:
        </p>
        <div style="margin-bottom: 32px;">
          <a href="${safeSetupUrl}" style="display: inline-block; background-color: #211D1A; color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 8px; font-size: 15px; font-weight: 600;">
            Set Password &amp; Get Started &rarr;
          </a>
        </div>
        <p style="font-size: 13px; line-height: 1.5; color: #A8A29E; margin: 0 0 6px 0;">
          Button not working? Copy and paste this link into your browser:
        </p>
        <p style="font-size: 13px; line-height: 1.5; color: #78716C; word-break: break-all; margin: 0 0 24px 0;">
          <a href="${safeSetupUrl}" style="color: #78716C; text-decoration: underline;">${safeSetupUrl}</a>
        </p>
        <div style="border-top: 1px solid #E5E2DC; padding-top: 20px; font-size: 12px; color: #A8A29E; line-height: 1.5;">
          This link will expire in 7 days. If you were not expecting this invitation, you can safely ignore this email.
        </div>
      </div>
    `,
  });
}
