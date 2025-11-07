import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();
const dataDir = path.join(process.cwd(), "data");
const filePath = path.join(dataDir, "steps.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]");

let steps: any[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

const clients: Map<string, express.Response> = new Map();

function broadcastUpdate(content: string, version: number, excludeClientId?: string) {
  const message = `data: ${JSON.stringify({
    type: 'content_update',
    content: content,
    version: version,
    timestamp: new Date().toISOString()
  })}\n\n`;

  clients.forEach((res, clientId) => {
    if (clientId === excludeClientId) return;
    
    try {
      res.write(message);
    } catch (error) {
      console.log(`Client ${clientId} disconnected during broadcast`);
      clients.delete(clientId);
    }
  });
}

function getCurrentContent(): string {
  if (steps.length === 0) return "";
  
  const lastStepWithContent = steps.slice().reverse().find(step => step.content);
  return lastStepWithContent?.content || "";
}

router.get("/events", (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  // Important: Flush the headers to establish the connection
  res.flushHeaders();

  const clientId = req.query.clientId as string || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`Client ${clientId} connected to SSE`);
  
  // Store this client's response object
  clients.set(clientId, res);

  // Send initial connection message
  const initialMessage = `data: ${JSON.stringify({
    type: 'connected',
    content: getCurrentContent(),
    version: steps.length,
    clientId: clientId,
    timestamp: new Date().toISOString()
  })}\n\n`;
  
  res.write(initialMessage);

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      if (clients.has(clientId)) {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
      } else {
        clearInterval(heartbeatInterval);
      }
    } catch (error) {
      console.log(`Heartbeat failed for client ${clientId}`);
      clearInterval(heartbeatInterval);
      clients.delete(clientId);
    }
  }, 15000); // Send heartbeat every 15 seconds

  // Handle client disconnect
  req.on('close', () => {
    console.log(`Client ${clientId} disconnected`);
    clearInterval(heartbeatInterval);
    clients.delete(clientId);
  });

  req.on('error', (err) => {
    console.log(`Client ${clientId} connection error:`, err.message);
    clearInterval(heartbeatInterval);
    clients.delete(clientId);
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

  console.log(`POST / - Client: ${clientId}, Version: ${version}, Content length: ${content?.length || 0}`);

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
    
    console.log(`Broadcasting update to ${clients.size - 1} clients (excluding ${clientId})`);
    
    // Broadcast to all clients EXCEPT the one that made the change
    broadcastUpdate(content || getCurrentContent(), steps.length, clientId);
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
    
    // Broadcast to all clients EXCEPT the one that made the change
    broadcastUpdate(getCurrentContent(), steps.length, clientId);
  }

  res.json({ 
    version: steps.length,
    message: `Added ${newSteps.length} steps via /steps endpoint`
  });
});

router.post("/init", (req, res) => {
  steps = [];
  fs.writeFileSync(filePath, JSON.stringify(steps, null, 2));
  
  broadcastUpdate("", steps.length);
  
  res.json({ 
    message: "Document reset",
    version: steps.length,
    content: ""
  });
});

export default router;