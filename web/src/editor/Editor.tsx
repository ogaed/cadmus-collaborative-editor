import type React from "react"
import { useEffect, useRef, useState } from "react"
import Toolbar from "../components/Toolbar"
import WordCount from "../components/WordCount"
import { saveDocumentWithRetry } from "../utils/saveWithRetry"
import type { QueueItem } from "../utils/saveWithRetry"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const API_BASE = "http://localhost:4000"

const LOCAL_QUEUE_KEY = "cadmus_pending_queue_v1"
const LOCAL_DOC_KEY = "cadmus_local_doc_v1"
const LOCAL_SYNC_KEY = "cadmus_last_sync_v1"

export default function Editor() {
  const [text, setText] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_DOC_KEY)
      return saved ?? ""
    } catch {
      return ""
    }
  })
  const [serverVersion, setServerVersion] = useState<number>(0)
  const [pendingQueue, setPendingQueue] = useState<QueueItem[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_QUEUE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_SYNC_KEY)
    } catch {
      return null
    }
  })
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isUserTyping, setIsUserTyping] = useState<boolean>(false)
  const [showPreview, setShowPreview] = useState<boolean>(false)

  const debounceTimer = useRef<number | null>(null)
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const isApplyingRemoteUpdate = useRef<boolean>(false)
  const lastUserActivityRef = useRef<number>(Date.now())
  const reconnectAttemptsRef = useRef<number>(0)

  useEffect(() => {
    const maxReconnectDelay = 10000;

    const setupEventSource = () => {
      try {
        // Include clientId in the SSE URL to avoid sending updates back to sender
        const clientId = localClientId();
        eventSourceRef.current = new EventSource(`${API_BASE}/collab/events?clientId=${clientId}`);
        
        eventSourceRef.current.onopen = () => {
          console.log('SSE connection opened');
          setIsConnected(true);
          setStatusMessage("Connected - real-time updates active");
          reconnectAttemptsRef.current = 0;
        };

        eventSourceRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Ignore heartbeat messages
            if (data.type === 'heartbeat') return;
            
            if (data.type === 'content_update' || data.type === 'connected') {
              const now = Date.now();
              const timeSinceLastActivity = now - lastUserActivityRef.current;
              
              // Don't apply updates if user is actively typing or we're applying changes
              if (isApplyingRemoteUpdate.current || 
                  isUserTyping || 
                  timeSinceLastActivity < 1000 || 
                  document.activeElement === textRef.current) {
                console.log('Skipping remote update - user is active');
                return;
              }
              
              console.log('Received remote update:', data);
              
              // Only update if the content is different and version is newer
              if (data.content !== text && data.version >= serverVersion) {
                isApplyingRemoteUpdate.current = true;
                setText(data.content);
                setServerVersion(data.version);
                setStatusMessage("Updated from another user");
                
                setTimeout(() => {
                  setStatusMessage("All changes synced");
                  isApplyingRemoteUpdate.current = false;
                }, 2000);
              }
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error);
          }
        };

        eventSourceRef.current.onerror = (error) => {
          console.error('SSE error:', error);
          setIsConnected(false);
          
          // Calculate reconnect delay with exponential backoff
          const reconnectDelay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), maxReconnectDelay);
          reconnectAttemptsRef.current++;
          
          setStatusMessage(`Connection lost - reconnecting in ${reconnectDelay/1000}s...`);
          
          // Close current connection
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
          }
          
          // Attempt to reconnect after delay
          setTimeout(() => {
            setupEventSource();
          }, reconnectDelay);
        };

      } catch (error) {
        console.error('Failed to setup SSE:', error);
        setStatusMessage("Real-time updates unavailable");
        
        // Retry connection after error
        setTimeout(() => {
          setupEventSource();
        }, 3000);
      }
    };

    setupEventSource();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [text, serverVersion, isUserTyping]);

  // Load remote document on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/collab`)
        if (!res.ok) throw new Error("Failed to load doc")
        const data = await res.json()
        if (!mounted) return
        
        if (data.content !== undefined) {
          setText(data.content)
        }
        setServerVersion(data.version ?? 0)
        setStatusMessage("Loaded from server")
      } catch (err) {
        setStatusMessage("Failed to load from server — working offline")
        console.warn("load error", err)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Persist queue and doc to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(pendingQueue))
    } catch {}
  }, [pendingQueue])

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_DOC_KEY, text)
    } catch {}
  }, [text])

  // Background flush loop to send pending queue items
  useEffect(() => {
    let stopped = false

    async function flushLoop() {
      while (!stopped) {
        if (pendingQueue.length === 0) {
          await new Promise((r) => setTimeout(r, 1200))
          continue
        }
        const next = pendingQueue[0]
        try {
          setStatusMessage("Syncing...")
          isApplyingRemoteUpdate.current = true;
          const result = await saveDocumentWithRetry(next, serverVersion)
          setPendingQueue((q) => q.slice(1))
          setServerVersion(result.version)
          setStatusMessage("All changes synced")
          
          const syncTime = new Date().toISOString()
          setLastSynced(syncTime)
          try {
            localStorage.setItem(LOCAL_SYNC_KEY, syncTime)
          } catch {}
          
        } catch (err) {
          console.warn("push failed", err)
          setStatusMessage("Sync error — retrying in background")
          await new Promise((r) => setTimeout(r, 2000))
        } finally {
          isApplyingRemoteUpdate.current = false;
        }
      }
    }

    flushLoop()

    return () => {
      stopped = true
    }
  }, [pendingQueue, serverVersion])

  function enqueueChange(nextText: string) {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: nextText,
      clientId: localClientId(),
      createdAt: new Date().toISOString(),
      attempt: 0,
    }
    setPendingQueue((q) => [...q, item])
  }

  function onUserEdit(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value
    setText(next)
    
    setIsUserTyping(true)
    lastUserActivityRef.current = Date.now()

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
    debounceTimer.current = window.setTimeout(() => {
      enqueueChange(next)
      debounceTimer.current = null
      setIsUserTyping(false)
    }, 450)
  }

  const handleTextareaInteraction = () => {
    lastUserActivityRef.current = Date.now();
    setIsUserTyping(true);
    
    setTimeout(() => {
      if (!isUserTyping) {
        setIsUserTyping(false);
      }
    }, 1000);
  };

  // Improved toolbar actions with better selection handling
  function applyWrap(prefix: string, suffix?: string) {
    const textarea = textRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const hasSelection = start !== end
    
    const currentText = text
    const wrapSuffix = suffix ?? prefix
    
    let newText: string
    let newCursorPos: number

    if (hasSelection) {
      const selectedText = currentText.slice(start, end)
      newText = currentText.slice(0, start) + prefix + selectedText + wrapSuffix + currentText.slice(end)
      newCursorPos = end + prefix.length + wrapSuffix.length
    } else {
      newText = currentText.slice(0, start) + prefix + wrapSuffix + currentText.slice(end)
      newCursorPos = start + prefix.length
    }

    setText(newText)
    setIsUserTyping(true)
    lastUserActivityRef.current = Date.now()

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
    enqueueChange(newText)

    // Restore cursor position after React re-render
    setTimeout(() => {
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(newCursorPos, newCursorPos)
        setIsUserTyping(false)
      }
    }, 10)
  }

  const unconfirmedCount = pendingQueue.length

  return (
    <div className="p-4 sm:p-5 md:p-6 lg:p-8 max-w-4xl mx-auto min-h-screen">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4 sm:mb-5 md:mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold m-0 text-foreground">
          Cadmus — Collaborative Editor
          <span className={`ml-2 text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
            {isConnected ? '●' : '●'} {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </h2>
        <div className="flex flex-col items-start sm:items-end gap-1 sm:gap-1.5">
          <div className="text-xs sm:text-sm text-muted-foreground">Server ver: {serverVersion}</div>
          <div
            className={`text-xs sm:text-sm font-medium ${unconfirmedCount ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
          >
            {unconfirmedCount ? `${unconfirmedCount} pending` : "All saved"}
          </div>
          {statusMessage && (
            <div className="text-xs text-muted-foreground max-w-[200px] sm:max-w-none text-left sm:text-right">
              {statusMessage}
              {isUserTyping && " (Typing...)"}
            </div>
          )}
        </div>
      </header>

      <div className="flex items-center gap-4 mb-4">
        <Toolbar 
          onBold={() => applyWrap("**", "**")} 
          onItalic={() => applyWrap("*", "*")} 
        />
        
        {/* Preview Toggle */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`px-3 py-1 text-sm border rounded ${
            showPreview 
              ? 'bg-blue-600 text-white border-blue-600' 
              : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
          }`}
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {showPreview ? (
        // Preview Mode
        <div className="border border-border rounded-lg p-3 sm:p-4 md:p-5 bg-card shadow-sm min-h-[380px]">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {text}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        // Edit Mode - Simple textarea without overlay
        <div className="border border-border rounded-lg bg-card shadow-sm">
          <textarea
            ref={textRef}
            value={text}
            onChange={onUserEdit}
            onFocus={handleTextareaInteraction}
            onKeyDown={handleTextareaInteraction}
            onMouseDown={handleTextareaInteraction}
            placeholder="Start collaborating... (Use Preview button to see formatted Markdown)"
            className="w-full min-h-[380px] p-3 sm:p-4 md:p-5 outline-none resize-none bg-transparent text-foreground caret-foreground border-0 font-mono text-sm leading-relaxed"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
          />
        </div>
      )}

      <footer className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0 mt-4 sm:mt-5 md:mt-6">
        <WordCount text={text} />
        <div className="text-xs sm:text-sm text-muted-foreground">
          {pendingQueue.length > 0 ? (
            <>
              <span className="hidden sm:inline">Last queued: </span>
              <span className="sm:hidden">Queued: </span>
              {new Date(pendingQueue[pendingQueue.length - 1].createdAt).toLocaleTimeString()}
            </>
          ) : (
            <>
              <span className="hidden sm:inline">Last synced: </span>
              <span className="sm:hidden">Synced: </span>
              {lastSynced ? new Date(lastSynced).toLocaleTimeString() : "—"}
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

/** helper to get a stable client id */
function localClientId() {
  const key = "cadmus_local_client_v1"
  let id = localStorage.getItem(key)
  if (!id) {
    id = `client-${Math.floor(Math.random() * 1e9).toString(36)}`
    try {
      localStorage.setItem(key, id)
    } catch {}
  }
  return id
}