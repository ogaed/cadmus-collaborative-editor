
import { EditorView } from 'prosemirror-view';
import { Step, Transform } from 'prosemirror-transform';
import { rebaseSteps } from 'prosemirror-collab';

export class CollabService {
  private view: EditorView | null = null;
  private clientId: string;
  private version: number = 0;
  private pendingSteps: Step[] = [];

  constructor() {
    this.clientId = this.generateClientId();
  }

  init(view: EditorView) {
    this.view = view;
    this.loadDocument();
    this.startSyncLoop();
  }

  async loadDocument() {
    try {
      const response = await fetch('http://localhost:4000/prosemirror');
      const data = await response.json();
      
      if (this.view && data.doc) {
        // Apply initial document
        const state = this.view.state;
        const tr = state.tr;
        tr.replaceWith(0, state.doc.content.size, state.schema.nodeFromJSON(data.doc));
        this.view.dispatch(tr);
        this.version = data.version;
      }
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  }

  async sendSteps(steps: Step[], before: any, after: any) {
    this.pendingSteps.push(...steps);
    
    try {
      const response = await fetch('http://localhost:4000/prosemirror/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: this.version,
          clientId: this.clientId,
          steps: steps.map(step => step.toJSON()),
          clientTime: Date.now()
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.version = result.version;
        this.pendingSteps = this.pendingSteps.filter(s => !steps.includes(s));
      } else if (response.status === 409) {
        await this.handleConflict();
      }
    } catch (error) {
      console.error('Failed to send steps:', error);
    }
  }

  private async handleConflict() {
    const response = await fetch(`http://localhost:4000/prosemirror/steps?version=${this.version}`);
    const data = await response.json();
    
    if (this.view && data.steps) {
      const remoteSteps = data.steps.map((s: any) => Step.fromJSON(this.view!.state.schema, s));
      const newSteps = rebaseSteps(this.pendingSteps, remoteSteps, this.view.state);
      
      this.pendingSteps = newSteps;
      this.version = data.version;
      
      if (newSteps.length > 0) {
        const tr = this.view.state.tr;
        newSteps.forEach(step => tr.step(step));
        this.view.dispatch(tr);
      }
    }
  }

  private async startSyncLoop() {
    setInterval(async () => {
      if (!this.view) return;
      
      try {
        const response = await fetch(`http://localhost:4000/prosemirror/steps?version=${this.version}`);
        const data = await response.json();
        
        if (data.steps && data.steps.length > 0) {
          const remoteSteps = data.steps.map((s: any) => Step.fromJSON(this.view!.state.schema, s));
          
          const tr = this.view.state.tr;
          remoteSteps.forEach(step => tr.step(step));
          this.view.dispatch(tr);
          
          this.version = data.version;
        }
      } catch (error) {
        console.error('Sync error:', error);
      }
    }, 1000); // Sync every second
  }

  private generateClientId(): string {
    return 'client-' + Math.random().toString(36).substr(2, 9);
  }
}
