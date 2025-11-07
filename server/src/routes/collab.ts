//(updated with real-time support)
import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();
const dataDir = path.join(process.cwd(), "data");
const filePath = path.join(dataDir, "steps.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]");

let steps: any[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

const clients: Response[] = [];

function broadcastUpdate() {
  const currentContent = getCurrentContent();
  const message = `data: ${JSON.stringify({
    type: 'content_update',
    content: currentContent,
    version: steps.length,
    timestamp: new Date().toISOString()
  })}\n\n`;

  clients.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      console.log('Client disconnected, removing from broadcast list');
     
      const index = clients.indexOf(client);
      if (index > -1) {
        clients.splice(index, 1);
      }
    }
  });
}

function getCurrentContent(): string {
  if (steps.length === 0) return "";
  
  const lastStepWithContent = steps.slice().reverse().find(step => step.content);
  return lastStepWithContent?.content || "";
}

router.get("/events", (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`data: ${JSON.stringify({
    type: 'connected',
    content: getCurrentContent(),
    version: steps.length,
    timestamp: new Date().toISOString()
  })}\n\n`);

  clients.push(res);

  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
    res.end();
  });
});

router.get("/", (req, res) => {
  const version = parseInt(req.query.version as string);
  
  if (version !== undefined && !isNaN(version)) {
    const newSteps = steps.slice(version);
    res.json({
      steps: newSteps,
      version: steps.length,
    });
  } else {
    res.json({
      content: getCurrentContent(),
      version: steps.length,
    });
  }
});

router.post("/", (req, res) => {
  const { steps: newSteps, content, version, clientId } = req.body;

  if (typeof version !== 'number') {
    return res.status(400).json({ error: "Version must be a number" });
  }

  if (version !== steps.length) {
    return res.status(409).json({ 
      error: "Version mismatch",
      currentVersion: steps.length,
      yourVersion: version
    });
  }

  let stepsToAdd: any[] = [];

  if (Array.isArray(newSteps)) {
    stepsToAdd = newSteps;
  } else if (content !== undefined) {
    stepsToAdd = [{
      type: 'replace',
      content: content,
      clientId: clientId,
      timestamp: new Date().toISOString()
    }];
  } else {
    return res.status(400).json({ error: "Must provide either steps array or content" });
  }

  if (stepsToAdd.length > 0) {
    steps.push(...stepsToAdd);
    fs.writeFileSync(filePath, JSON.stringify(steps, null, 2));
    
    broadcastUpdate();
  }

  res.json({ 
    version: steps.length,
    message: `Added ${stepsToAdd.length} steps`,
    content: content || getCurrentContent()
  });
});
router.post("/steps", (req, res) => {
  const { steps: newSteps, version, clientId } = req.body;

  if (typeof version !== 'number') {
    return res.status(400).json({ error: "Version must be a number" });
  }

  if (!Array.isArray(newSteps)) {
    return res.status(400).json({ error: "Steps must be an array" });
  }

  if (version !== steps.length) {
    return res.status(409).json({ 
      error: "Version mismatch",
      currentVersion: steps.length,
      yourVersion: version
    });
  }

  if (newSteps.length > 0) {
    steps.push(...newSteps);
    fs.writeFileSync(filePath, JSON.stringify(steps, null, 2));
    broadcastUpdate();
  }

  res.json({ 
    version: steps.length,
    message: `Added ${newSteps.length} steps via /steps endpoint`
  });
});

router.post("/init", (req, res) => {
  steps = [];
  fs.writeFileSync(filePath, JSON.stringify(steps, null, 2));
  
  broadcastUpdate();
  
  res.json({ 
    message: "Document reset",
    version: steps.length,
    content: ""
  });
});

export default router;