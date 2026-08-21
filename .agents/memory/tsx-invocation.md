---
name: TSX invocation
description: Workspace behavior for running TypeScript scripts from package commands.
---

When a package command must invoke TSX through Node, use the installed TSX ESM entrypoint rather than passing the shell wrapper to `node`.

**Why:** The workspace `.bin/tsx` file is a shell launcher; Node 24 parses it as JavaScript if it is passed as a script path, producing a syntax error.

**How to apply:** Prefer a package-local executable or a stable package-manager invocation when available; if using the workspace installation directly, keep the TSX version aligned with the lockfile.