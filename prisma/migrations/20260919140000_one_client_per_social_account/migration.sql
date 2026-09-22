-- A Page, org or channel belongs to exactly one client workspace.
-- Previously uniqueness was per client, so the same account could be
-- connected to two clients and both would publish to it.
CREATE UNIQUE INDEX "SocialAccount_platform_externalAccountId_key"
  ON "SocialAccount"("platform", "externalAccountId");
