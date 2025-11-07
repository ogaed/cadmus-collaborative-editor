export interface TextOperation {
    type: 'insert' | 'delete' | 'retain';
    value?: string;
    length?: number;
  }
  
  export interface DiffSyncPayload {
    version: number;
    clientId: string;
    operations: TextOperation[];
    baseVersion: number;
  }
  
  export class DiffSyncEngine {
    static diff(oldText: string, newText: string): TextOperation[] {
      const operations: TextOperation[] = [];
      let i = 0;
      let j = 0;
      
      while (i < oldText.length || j < newText.length) {
        if (i < oldText.length && j < newText.length && oldText[i] === newText[j]) {
          // Characters match - retain
          let retainCount = 0;
          while (i + retainCount < oldText.length && 
                 j + retainCount < newText.length && 
                 oldText[i + retainCount] === newText[j + retainCount]) {
            retainCount++;
          }
          operations.push({ type: 'retain', length: retainCount });
          i += retainCount;
          j += retainCount;
        } else {
          // Handle insertions and deletions
          if (j < newText.length) {
            // Insertion
            let insertText = '';
            while (j < newText.length && (i >= oldText.length || oldText[i] !== newText[j])) {
              insertText += newText[j];
              j++;
            }
            operations.push({ type: 'insert', value: insertText });
          } else if (i < oldText.length) {
            // Deletion
            let deleteCount = 0;
            while (i + deleteCount < oldText.length && 
                   (j >= newText.length || oldText[i + deleteCount] !== newText[j])) {
              deleteCount++;
            }
            operations.push({ type: 'delete', length: deleteCount });
            i += deleteCount;
          }
        }
      }
      
      return operations;
    }
  
    static applyOperations(text: string, operations: TextOperation[]): string {
      let result = '';
      let position = 0;
      
      for (const op of operations) {
        switch (op.type) {
          case 'retain':
            result += text.slice(position, position + (op.length || 0));
            position += op.length || 0;
            break;
          case 'insert':
            result += op.value || '';
            break;
          case 'delete':
            position += op.length || 0;
            break;
        }
      }
      
      // Add any remaining text
      if (position < text.length) {
        result += text.slice(position);
      }
      
      return result;
    }
  
    static transformOperations(ops1: TextOperation[], ops2: TextOperation[]): TextOperation[] {
      const result: TextOperation[] = [];
      let i1 = 0, i2 = 0;
      let offset1 = 0, offset2 = 0;
      
      while (i1 < ops1.length || i2 < ops2.length) {
        const op1 = ops1[i1];
        const op2 = ops2[i2];
        
        if (op1?.type === 'retain' && op2?.type === 'retain') {
          const minLength = Math.min(op1.length || 0, op2.length || 0);
          result.push({ type: 'retain', length: minLength });
          
          if ((op1.length || 0) > minLength) {
            ops1[i1] = { type: 'retain', length: (op1.length || 0) - minLength };
          } else {
            i1++;
          }
          
          if ((op2.length || 0) > minLength) {
            ops2[i2] = { type: 'retain', length: (op2.length || 0) - minLength };
          } else {
            i2++;
          }
          
          offset1 += minLength;
          offset2 += minLength;
        } else if (op1?.type === 'insert') {
          result.push(op1);
          i1++;
          offset2 += op1.value?.length || 0;
        } else if (op2?.type === 'insert') {
          result.push(op2);
          i2++;
          offset1 += op2.value?.length || 0;
        } else if (op1?.type === 'delete' && op2?.type === 'delete') {
          const minLength = Math.min(op1.length || 0, op2.length || 0);
          
          if ((op1.length || 0) > minLength) {
            ops1[i1] = { type: 'delete', length: (op1.length || 0) - minLength };
          } else {
            i1++;
          }
          
          if ((op2.length || 0) > minLength) {
            ops2[i2] = { type: 'delete', length: (op2.length || 0) - minLength };
          } else {
            i2++;
          }
          
          offset1 += minLength;
          offset2 += minLength;
        } else if (op1?.type === 'delete') {
          result.push(op1);
          i1++;
          offset2 += op1.length || 0;
        } else if (op2?.type === 'delete') {
          result.push(op2);
          i2++;
          offset1 += op2.length || 0;
        }
      }
      
      return result;
    }
  }