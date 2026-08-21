---
name: RLS migrations
description: PostgreSQL account-isolation policies require explicit SQL migration handling alongside the Drizzle schema.
---

Drizzle schema push can create the RLS policy and enable row security, but raw `current_setting` policy expressions should be applied and verified through the checked-in SQL migration. The API must use a transaction-local account setting, and its database role must not be a superuser or table owner.

**Why:** Privileged PostgreSQL roles bypass row-level security, and schema push did not preserve the policy expression in this environment.

**How to apply:** Run the database schema push first, then apply the account RLS migration; verify both `relrowsecurity` and `relforcerowsecurity` plus the policy expressions.