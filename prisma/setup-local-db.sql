-- Local development database bootstrap.
--
-- Creates the role and database that .env expects. Run once per machine,
-- as the postgres superuser:
--
--   psql -U postgres -h localhost -f prisma/setup-local-db.sql
--
-- Safe to re-run: it creates what's missing and resets the role's
-- password to match .env if the role already exists. Local dev only —
-- the password is the committed one from .env.example, and production
-- credentials never come from this file.

-- The role. CREATE ROLE has no IF NOT EXISTS, hence the DO block.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cadence') THEN
    CREATE ROLE cadence LOGIN PASSWORD 'cadence_dev_password';
    RAISE NOTICE 'created role cadence';
  ELSE
    ALTER ROLE cadence WITH LOGIN PASSWORD 'cadence_dev_password';
    RAISE NOTICE 'role cadence already existed — password reset to match .env';
  END IF;
END
$$;

-- The database. CREATE DATABASE cannot run inside a DO block or a
-- transaction, so \gexec runs it only when the row comes back.
SELECT 'CREATE DATABASE cadence OWNER cadence'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cadence')\gexec

-- Switch into the new database before granting — a GRANT is scoped to
-- whichever database the session is connected to, so running it here
-- would have applied to `postgres` instead.
\connect cadence

-- Postgres 15+ locked down the public schema; the database owner can
-- already create in it, but this makes it explicit and survives the
-- database being created by hand with a different owner.
GRANT ALL ON SCHEMA public TO cadence;
