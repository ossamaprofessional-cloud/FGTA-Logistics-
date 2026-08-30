import express from "express";
import path from "path";
import { createRequire } from "module";
import dotenv from "dotenv";

dotenv.config();

const require = createRequire(import.meta.url);
const app = require("./server/app.js");

const PORT = 3000;

// Serve public directory for static assets and html pages
const publicPath = path.join(process.cwd(), "public");
app.use(express.static(publicPath));

// Fallback for html pages
app.get("*", (req: express.Request, res: express.Response) => {
  const requestedPath = req.path === "/" ? "index.html" : req.path;
  const filePath = path.join(publicPath, requestedPath);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.sendFile(path.join(publicPath, "index.html"));
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
