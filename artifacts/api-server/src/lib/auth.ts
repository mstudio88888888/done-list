import { getAuth } from "@clerk/express";
import type { Request } from "express";

export type UserIdResolver = (req: Request) => string | null;

export function getRequestUserId(req: Request): string | null {
  const resolver = req.app.locals.userIdResolver as UserIdResolver | undefined;
  return resolver ? resolver(req) : getAuth(req).userId ?? null;
}