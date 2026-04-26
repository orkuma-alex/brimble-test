import { useEffect, useRef } from 'react'
import { useLogs } from '../lib/useLogs'

interface Props {
  deploymentId: string
  deploymentName?: string
  onClose: () => void
}

export function LogViewer({ deploymentId, deploymentName, onClose }: Props) {
  const { lines, connected } = useLogs(deploymentId)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom as new lines arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="log-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="log-panel" role="dialog" aria-label="Deployment logs">
        <div className="log-panel-header">
          <div className="log-panel-title">
            <span style={{ fontSize: 15 }}>📋</span>
            <span>{deploymentName ?? 'Logs'}</span>
            <span className="log-panel-id">{deploymentId.slice(0, 8)}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className={`live-indicator ${connected ? 'connected' : 'disconnected'}`}>
              <span className="live-dot" />
              {connected ? 'Live' : 'Ended'}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {lines.length} line{lines.length !== 1 ? 's' : ''}
            </span>
            <button
              className="log-panel-close"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close log viewer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="log-body">
          {lines.length === 0 && (
            <div className="log-empty">
              {connected ? 'Waiting for logs…' : 'No logs yet.'}
            </div>
          )}

          {lines.map((log, i) => (
            <div key={i} className={`log-line ${log.stream}`}>
              <span className="log-ts">{formatTs(log.createdAt)}</span>
              <span className="log-text">{log.line}</span>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString().slice(11, 23)
}
