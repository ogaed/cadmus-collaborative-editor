import express from 'express';
import { Step, Transform } from 'prosemirror-transform';
import { Schema, Node } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

const router = express.Router();

// Enhanced schema
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: schema.spec.marks
});

// In-memory document storage
let document: Node = mySchema.node('doc', null, [
  mySchema.node('paragraph', null, [mySchema.text('Start collaborating!')])
]);
let version = 0;
let steps: any[] = [];

router.get('/', (req, res) => {
  console.log('GET / - Returning document version:', version);
  res.json({
    doc: document.toJSON(),
    version: version
  });
});

// Get steps since version
router.get('/steps', (req, res) => {
  const sinceVersion = parseInt(req.query.version as string) || 0;
  const newSteps = steps.slice(sinceVersion);
  console.log(`GET /steps?version=${sinceVersion} - Returning ${newSteps.length} steps, current version: ${version}`);
  
  res.json({
    steps: newSteps,
    version: version
  });
});

// Post new steps
router.post('/steps', (req, res) => {
  const { steps: newSteps, version: clientVersion, clientId } = req.body;
  
  console.log(`POST /steps - Client version: ${clientVersion}, Server version: ${version}, Steps: ${newSteps?.length || 0}`);
  
  // Validate request body
  if (!Array.isArray(newSteps)) {
    return res.status(400).json({ error: 'steps must be an array' });
  }
  
  if (clientVersion !== version) {
    return res.status(409).json({ 
      error: 'Version conflict',
      currentVersion: version
    });
  }
  
  try {
    let transform = new Transform(document);
    
    newSteps.forEach((stepJson: any) => {
      try {
        const step = Step.fromJSON(mySchema, stepJson);
        transform.step(step);
      } catch (stepError) {
        console.error('Error applying step:', stepError);
        throw new Error(`Invalid step: ${stepError}`);
      }
    });
    
    document = transform.doc;
    steps.push(...newSteps);
    version += newSteps.length;
    
    console.log(`Applied ${newSteps.length} steps, new version: ${version}`);
    
    res.json({ 
      version: version,
      doc: document.toJSON()
    });
  } catch (error) {
    console.error('Error applying steps:', error);
    res.status(400).json({ 
      error: 'Invalid steps',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/init', (req, res) => {
  console.log('POST /init - Resetting document');
  document = mySchema.node('doc', null, [
    mySchema.node('paragraph', null, [mySchema.text('Start collaborating!')])
  ]);
  version = 0;
  steps = [];
  
  res.json({ 
    message: 'Document reset',
    version: version,
    doc: document.toJSON()
  });
});

export default router;