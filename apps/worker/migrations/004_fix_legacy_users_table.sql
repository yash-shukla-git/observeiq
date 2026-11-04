-- Migration: 004_fix_legacy_users_table.sql
-- An older version of the project created a users table with name and password columns.
-- 002 uses CREATE TABLE IF NOT EXISTS, so it skipped that table and login failed with
-- "column password_hash does not exist". This brings the old table in line with 002.
-- Nothing is dropped. On a database made from 002 it does nothing.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'password') THEN
        -- old accounts keep working when their password was already a bcrypt hash
        UPDATE users SET password_hash = password WHERE password_hash IS NULL AND password LIKE '$2%';
        ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'name') THEN
        ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
    END IF;
END $$;
