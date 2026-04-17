import express, { type Express } from "express";
import { createServer as createViteServer } from "vite";
import fs from "node:fs";
import path from "node:path";

export async function registerSpaRoutes(app: Express) {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.use(vite.middlewares);
    return;
  }

  const distPath = path.join(process.cwd(), "dist");
  const assetsPath = path.join(distPath, "assets");
  const indexPath = path.join(distPath, "index.html");

  console.log("[static] distPath:", distPath);
  console.log("[static] index exists:", fs.existsSync(indexPath));
  console.log("[static] assets exists:", fs.existsSync(assetsPath));
  if (fs.existsSync(assetsPath)) {
    console.log("[static] assets files:", fs.readdirSync(assetsPath));
  }

  app.use(
    "/assets",
    express.static(assetsPath, {
      index: false,
      immutable: true,
      maxAge: "1y",
    }),
  );

  app.use(express.static(distPath, { index: false, maxAge: 0 }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();

    if (path.extname(req.path)) {
      return res.status(404).send("Not found");
    }

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.sendFile(indexPath);
  });
}
