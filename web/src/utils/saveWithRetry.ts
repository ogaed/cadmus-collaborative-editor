export interface QueueItem {
    id: string
    content: string
    clientId: string
    createdAt: string
    attempt: number
  }
  
  interface SaveResult {
    version: number
    content: string
  }
  
  const API_BASE = "http://localhost:4000"
  const MAX_RETRIES = 3
  
  export async function saveDocumentWithRetry(item: QueueItem, currentVersion: number): Promise<SaveResult> {
    const maxAttempts = MAX_RETRIES
    let lastError: Error | null = null
  
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/collab`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: item.content,
            version: currentVersion,
            clientId: item.clientId,
          }),
        })
  
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
  
          // Handle version conflict
          if (response.status === 409) {
            throw new Error(`Version conflict: ${JSON.stringify(errorData)}`)
          }
  
          throw new Error(`Save failed: ${response.status} ${response.statusText}`)
        }
  
        const result = await response.json()
        return {
          version: result.version ?? currentVersion + 1,
          content: result.content ?? item.content,
        }
      } catch (error) {
        lastError = error as Error
        console.warn(`Save attempt ${attempt + 1} failed:`, error)
  
        // Don't retry on conflict errors
        if (lastError.message.includes("conflict")) {
          throw lastError
        }
  
        // Wait before retrying (exponential backoff)
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }
  
    throw lastError || new Error("Save failed after all retries")
  }
  