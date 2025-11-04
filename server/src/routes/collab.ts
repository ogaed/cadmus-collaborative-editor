import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();
const dataDir = path.join(process.cwd(), "data");
const filePath = path.join(dataDir, "steps.json");

// Ensure data folder exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]");

let steps: any[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

// GET steps since version
router.get("/", (req, res) => {
  const version = parseInt(req.query.version as string) || 0;
  const newSteps = steps.slice(version);
  res.json({
    steps: newSteps,
    version: steps.length,
  });
});

// POST new steps
router.post("/", (req, res) => {
  const { steps: newSteps, version, clientID } = req.body;

  if (version !== steps.length) {
    return res.status(409).json({ error: "Version mismatch" });
  }

  steps.push(...newSteps);
  fs.writeFileSync(filePath, JSON.stringify(steps, null, 2));
  res.json({ version: steps.length });
});

export default router;
