import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteDeployment, redeployDeployment, type Deployment } from '../lib/api'
import { StatusBadge } from './StatusBadge'

interface Props {
  deployment: Deployment
  onViewLogs: () => void
}

export function DeploymentCard({ deployment: dep, onViewLogs }: Props) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['deployments'] })

  const redeploy = useMutation({
    mutationFn: () => redeployDeployment(dep.id),
    onSuccess: invalidate,
  })

  const del = useMutation({
    mutationFn: () => deleteDeployment(dep.id),
    onSuccess: invalidate,
  })

  const timeAgo = formatRelative(dep.createdAt)

  return (
    <div className={`card dep-card ${dep.status}`}>
      <div className="dep-card-top">
        <div>
          <div className="dep-card-name">{dep.name}</div>
          <div style={{ marginTop: 6 }}>
            <StatusBadge status={dep.status} />
          </div>
        </div>
        <span className="dep-card-time">{timeAgo}</span>
      </div>

      <div className="dep-card-meta">
        {dep.imageTag && (
          <span className="dep-tag" title="Docker image tag">
            🐳 {dep.imageTag}
          </span>
        )}
        {dep.url ? (
          <a
            href={dep.url}
            target="_blank"
            rel="noopener noreferrer"
            className="dep-url"
          >
            ↗ {dep.url}
          </a>
        ) : (
          <span className="dep-tag" style={{ color: 'var(--text-muted)' }}>
            {dep.sourceType === 'git'
              ? `⑁ ${truncate(dep.sourceUrl ?? '', 48)}`
              : '📦 upload'}
          </span>
        )}
      </div>

      {dep.errorMessage && (
        <div className="dep-error">{dep.errorMessage}</div>
      )}

      <div className="dep-card-footer">
        <div className="dep-card-actions">
          <button className="btn btn-ghost" onClick={onViewLogs}>
            📋 Logs
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => redeploy.mutate()}
            disabled={
              redeploy.isPending ||
              ['building', 'deploying'].includes(dep.status)
            }
            title="Re-run the pipeline with the same source"
          >
            {redeploy.isPending ? <span className="spinner" /> : '↻'} Redeploy
          </button>
          <button
            className="btn btn-danger btn-ghost"
            onClick={() => {
              if (window.confirm(`Delete deployment "${dep.name}"?`)) {
                del.mutate()
              }
            }}
            disabled={del.isPending}
            title="Stop container and delete"
          >
            {del.isPending ? <span className="spinner" /> : '✕'}
          </button>
        </div>
        <span className="dep-card-time">
          #{dep.id.split('-')[0]}
        </span>
      </div>
    </div>
  )
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ms).toLocaleDateString()
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : `…${str.slice(-(max - 1))}`
}
