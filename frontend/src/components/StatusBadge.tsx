import type { DeploymentStatus } from '../lib/api'

interface Props {
  status: DeploymentStatus
}

const LABELS: Record<DeploymentStatus, string> = {
  pending:   'Pending',
  building:  'Building',
  deploying: 'Deploying',
  running:   'Live',
  failed:    'Failed',
}

export function StatusBadge({ status }: Props) {
  return (
    <span className={`status-badge ${status}`}>
      <span className="status-dot" />
      {LABELS[status]}
    </span>
  )
}
