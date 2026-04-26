import { useEffect, useRef, useState } from 'react'

export interface LogLine {
  line: string
  stream: 'stdout' | 'stderr' | 'system'
  createdAt: number
}

export function useLogs(deploymentId: string | undefined) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!deploymentId) {
      setLines([])
      setConnected(false)
      return
    }

    setLines([])
    setConnected(false)

    const es = new EventSource(`/api/deployments/${deploymentId}/logs`)
    esRef.current = es

    es.addEventListener('open', () => setConnected(true))

    es.addEventListener('log', (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as LogLine
        setLines((prev) => [...prev, data])
      } catch {
        // ignore malformed events
      }
    })

    es.addEventListener('done', () => {
      setConnected(false)
      es.close()
    })

    es.addEventListener('error', () => {
      setConnected(false)
    })

    return () => {
      es.close()
      esRef.current = null
    }
  }, [deploymentId])

  return { lines, connected }
}
