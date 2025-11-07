
import React, { useEffect, useRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { exampleSetup } from 'prosemirror-example-setup';
import { CollabService } from './CollabService';

interface ProseMirrorEditorProps {
  collabService: CollabService;
}

export default function ProseMirrorEditor({ collabService }: ProseMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const mySchema = new Schema({
      nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
      marks: schema.spec.marks
    });

    // Create initial state
    const state = EditorState.create({
      doc: DOMParser.fromSchema(mySchema).parse(editorRef.current),
      plugins: exampleSetup({ schema: mySchema })
    });

    // Create editor view
    const view = new EditorView(editorRef.current, {
      state,
      dispatchTransaction: (transaction) => {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        
        // Send steps to collaboration service
        collabService.sendSteps(transaction.steps, transaction.before, transaction.doc);
      }
    });

    viewRef.current = view;

    // Initialize collaboration
    collabService.init(view);

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
      }
    };
  }, [collabService]);

  return (
    <div className="prose-editor">
      <div ref={editorRef} style={{ display: 'none' }}>
        <p>Start collaborating in real-time!</p>
      </div>
    </div>
  );
}