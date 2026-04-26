const API = '/api/deployments'

export type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'running' | 'failed'

export interface Deployment {
  id: string
  name: string
  sourceType: 'git' | 'upload'
  sourceUrl: string | null
  status: DeploymentStatus
  imageTag: string | null
  containerId: string | null
  containerName: string | null
  url: string | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

export async function listDeployments(): Promise<Deployment[]> {
  const res = await fetch(API)
  if (!res.ok) throw new Error(`Failed to list deployments: ${res.status}`)
  return res.json()
}

export async function getDeployment(id: string): Promise<Deployment> {
  const res = await fetch(`${API}/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch deployment: ${res.status}`)
  return res.json()
}

export async function createDeployment(formData: FormData): Promise<Deployment> {
  const res = await fetch(API, { method: 'POST', body: formData })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function redeployDeployment(id: string): Promise<void> {
  const res = await fetch(`${API}/${id}/redeploy`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Redeploy failed: ${res.status}`)
  }
}

export async function deleteDeployment(id: string): Promise<void> {
  const res = await fetch(`${API}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
}
