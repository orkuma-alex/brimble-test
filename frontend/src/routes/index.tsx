import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearch, useNavigate } from '@tanstack/react-router'
import { listDeployments } from '../lib/api'
import { DeployForm } from '../components/DeployForm'
import { DeploymentCard } from '../components/DeploymentCard'
import { LogViewer } from '../components/LogViewer'

export function IndexPage() {
  const search = useSearch({ strict: false }) as { logs?: string }
  const selectedId = search.logs
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: listDeployments,
    refetchInterval: (query) => {
      const data = query.state.data
      const hasActive = Array.isArray(data) && data.some((d) =>
        ['pending', 'building', 'deploying'].includes(d.status)
      )
      return hasActive ? 2000 : 8000
    },
  })

  const openLogs = (id: string) => {
    navigate({ to: '/', search: { logs: id }, replace: true })
  }

  const closeLogs = () => {
    navigate({ to: '/', search: { logs: undefined }, replace: true })
  }

  const selectedDeployment = deployments.find((d) => d.id === selectedId)

  return (
    <div className="page">
      {/* ── Header ── */}
      <header className="site-header">
        <div className="site-logo">
          <div className="site-logo-mark">
            deploy<span>.</span>
          </div>
        </div>
        <span className="site-tagline">Brimble take-home pipeline</span>
      </header>

      {/* ── Deploy Form ── */}
      <DeployForm
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['deployments'] })}
      />

      {/* ── Deployments List ── */}
      <div>
        <div className="deployments-header">
          <h2>Deployments</h2>
          <span className="deployments-count">
            {isLoading ? '…' : deployments.length}
          </span>
        </div>

        <div className="deployments-grid">
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card dep-card">
                <div className="skeleton" style={{ height: 18, width: '60%' }} />
                <div className="skeleton" style={{ height: 14, width: '40%', marginTop: 8 }} />
                <div className="skeleton" style={{ height: 14, width: '80%', marginTop: 8 }} />
              </div>
            ))
          ) : deployments.length === 0 ? (
            <div className="deployments-empty">
              <div style={{ fontSize: 32 }}>🚀</div>
              <p>No deployments yet. Submit a Git URL or ZIP above to get started.</p>
            </div>
          ) : (
            deployments.map((dep) => (
              <DeploymentCard
                key={dep.id}
                deployment={dep}
                onViewLogs={() => openLogs(dep.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Log Viewer (modal overlay) ── */}
      {selectedId && (
        <LogViewer
          deploymentId={selectedId}
          deploymentName={selectedDeployment?.name}
          onClose={closeLogs}
        />
      )}
    </div>
  )
}
