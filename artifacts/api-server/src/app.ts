import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import type { UserIdResolver } from "./lib/auth";

export function createApp(options: {
  authMiddleware?: RequestHandler;
  userIdResolver?: UserIdResolver;
} = {}): Express {
  const app: Express = express();
  app.locals.userIdResolver = options.userIdResolver;

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(cors());
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(options.authMiddleware ?? clerkMiddleware());

  app.use("/api", router);

  return app;
}

export default createApp();
