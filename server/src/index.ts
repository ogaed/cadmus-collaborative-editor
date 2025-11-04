import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json());

let documentText = "Hello from Cadmus API test👋";
let version = 1;

app.get("/", (req, res) => {
  res.send("Cadmus Collab API Running");
});

// Get the current document
app.get("/collab", (req: Request, res: Response) => {
  res.json({ content: documentText, version });
});

// Save updates with version conflict handling
app.post("/collab", (req: Request, res: Response) => {
  const { content, version: clientVersion, clientId } = req.body;
  
  if (typeof content !== "string") {
    return res.status(400).json({ error: "content must be a string" });
  }

  // Version conflict detection
  if (clientVersion !== version) {
    return res.status(409).json({ 
      error: "Version conflict",
      currentVersion: version,
      currentContent: documentText
    });
  }

  // Update document
  documentText = content;
  version += 1;
  
  console.log(`Update from ${clientId || "unknown"} -> version ${version}`);
  
  res.json({ 
    version: version,
    content: documentText
  });
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));