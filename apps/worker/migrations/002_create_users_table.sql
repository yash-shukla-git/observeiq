-- Migration: 002_create_users_table.sql
-- Dashboard logins. Run with: npm run migrate

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,  -- stored lowercase
    password_hash TEXT         NOT NULL,         -- bcrypt hash, never the password
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
