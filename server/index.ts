import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Simple per-IP rate limits for CPU-heavy or write endpoints.
const buckets = new Map<string, { n: number; t: number }>();
const limit = (name: string, max: number, windowMs: number) => (req: any, res: any, next: any) => {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const k = name + ip; const now = Date.now(); const b = buckets.get(k);
  if (!b || now - b.t > windowMs) { buckets.set(k, { n: 1, t: now }); return next(); }
  if (++b.n > max) return res.status(429).json({ message: "Too many requests. Please wait a moment and try again." });
  next();
};
setInterval(() => { const now = Date.now(); buckets.forEach((b, k) => { if (now - b.t > 120000) buckets.delete(k); }); }, 60000).unref();
app.use("/api/sim", limit("sim", 30, 60000));
app.use(/^\/api\/rooms\/[^/]+\/predict/, limit("pred", 20, 60000));
app.use("/api/players/import", limit("imp", 10, 60000));
app.use("/api/auth/guest", limit("guest", 40, 60000));
app.use((req, _res, next) => { if (req.method === "PATCH" || req.method === "DELETE") return limit("edit", 60, 60000)(req, _res, next); next(); });

app.use(
  express.json({
    limit: "3mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).replace(/"token":"[^"]*"/g, '"token":"[redacted]"').slice(0, 160)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
