-- Migration: 005_drop_legacy_user_columns.sql
-- The older users table had name and password columns that nothing uses any more
-- (004 copied bcrypt passwords into password_hash). Drop them.
-- password is kept if any row still has an old password without a hash, so nothing is lost.
-- On a database made from 002 these columns do not exist and this does nothing.

DO $$
DECLARE
    unsaved boolean;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'password') THEN
        -- dynamic SQL, because this query cannot even be planned when the column is missing
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM users WHERE password IS NOT NULL AND password_hash IS NULL)' INTO unsaved;
        IF NOT unsaved THEN
            ALTER TABLE users DROP COLUMN password;
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'name') THEN
        ALTER TABLE users DROP COLUMN name;
    END IF;
END $$;
