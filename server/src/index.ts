import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import collabRouter from "./routes/collab";
import prosemirrorRouter from "./routes/prosemirrorServer";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Mount routers
app.use("/collab", collabRouter);
app.use("/prosemirror", prosemirrorRouter);

app.get("/", (req, res) => {
  res.send("Cadmus Collab API Running with ProseMirror Support");
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));