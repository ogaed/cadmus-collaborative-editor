import type React from "react"
import { useEffect, useRef, useState } from "react"
import Toolbar from "../components/Toolbar"
import WordCount from "../components/WordCount"
import { saveDocumentWithRetry } from "../utils/saveWithRetry"
import type { QueueItem } from "../utils/saveWithRetry"

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

  const debounceTimer = useRef<number | null>(null)
  const textRef = useRef<HTMLTextAreaElement | null>(null)

  // Load remote document on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/collab`)
        if (!res.ok) throw new Error("Failed to load doc")
        const data = await res.json()
        if (!mounted) return
        setText(data.content ?? "")
        setServerVersion(data.version ?? 0)
        setStatusMessage("Loaded")
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
          const result = await saveDocumentWithRetry(next, serverVersion)
          setPendingQueue((q) => q.slice(1))
          setServerVersion(result.version)
          setStatusMessage("All changes synced")
          
          // Update last sync time when successful
          const syncTime = new Date().toISOString()
          setLastSynced(syncTime)
          try {
            localStorage.setItem(LOCAL_SYNC_KEY, syncTime)
          } catch {}
          
        } catch (err) {
          // Conflict or persistent error: log and wait; saveDocumentWithRetry throws Conflict as Error with details
          console.warn("push failed", err)
          setStatusMessage("Sync error — retrying in background")
          await new Promise((r) => setTimeout(r, 2000))
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

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
    debounceTimer.current = window.setTimeout(() => {
      enqueueChange(next)
      debounceTimer.current = null
    }, 450)
  }

  // Toolbar actions insert simple markdown wraps - FIXED VERSION
  function applyWrap(prefix: string, suffix?: string) {
    const textarea = textRef.current
    if (!textarea) return

    // Save current selection and focus state
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const hasSelection = start !== end
    
    // Get the current text
    const currentText = text
    
    // Apply the wrapping
    const wrapSuffix = suffix ?? prefix
    let newText: string
    let newCursorPos: number

    if (hasSelection) {
      // Wrap the selected text
      newText = currentText.slice(0, start) + prefix + currentText.slice(start, end) + wrapSuffix + currentText.slice(end)
      newCursorPos = end + prefix.length + wrapSuffix.length
    } else {
      // Insert markers at cursor position with space for typing
      newText = currentText.slice(0, start) + prefix + wrapSuffix + currentText.slice(end)
      newCursorPos = start + prefix.length
    }

    // Update the text
    setText(newText)

    // Clear any existing debounce timer and enqueue change
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
    debounceTimer.current = window.setTimeout(() => {
      enqueueChange(newText)
      debounceTimer.current = null
    }, 150)

    // Restore cursor position after React re-render
    setTimeout(() => {
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 10)
  }

  const unconfirmedCount = pendingQueue.length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="p-4 sm:p-5 md:p-6 lg:p-8 max-w-4xl mx-auto min-h-screen">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4 sm:mb-5 md:mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold m-0 text-foreground">📝 Cadmus — Editor</h2>
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
            </div>
          )}
        </div>
      </header>

      <Toolbar onBold={() => applyWrap("**", "**")} onItalic={() => applyWrap("_", "_")} />

      <div className="border border-border rounded-lg p-3 sm:p-4 md:p-5 bg-card shadow-sm">
        <textarea
          ref={textRef}
          value={text}
          onChange={onUserEdit}
          placeholder="Write your essay here..."
          className="w-full min-h-[280px] sm:min-h-[380px] md:min-h-[450px] lg:min-h-[500px] border-none outline-none text-sm sm:text-base leading-relaxed font-sans resize-vertical bg-transparent text-foreground placeholder:text-muted-foreground"
        />
      </div>

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