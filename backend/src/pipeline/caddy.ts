const CADDY_ADMIN = (process.env.CADDY_ADMIN_URL ?? 'http://caddy:2019').replace(/\/$/, '')

const adminHeaders = {
  'Content-Type': 'application/json',
  'Origin': 'http://localhost:2019',
}

export async function addRoute(deploymentId: string, containerName: string): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN}/config/apps/http/servers/main/routes`, {
    headers: adminHeaders,
  })
  if (!res.ok) {
    throw new Error(`Caddy admin GET failed: ${res.status} ${await res.text()}`)
  }

  const routes = (await res.json()) as unknown[]

  const deployRoute = {
    '@id': `deploy-${deploymentId}`,
    match: [{ path: [`/deploy/${deploymentId}/*`] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `${containerName}:3000` }],
        flush_interval: -1,
      },
    ],
  }

  // Insert before the last route (frontend catch-all)
  const updated = [
    ...routes.slice(0, -1),
    deployRoute,
    routes[routes.length - 1],
  ]

  const putRes = await fetch(`${CADDY_ADMIN}/config/apps/http/servers/main/routes`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify(updated),
  })

  if (!putRes.ok) {
    throw new Error(`Caddy admin PATCH failed: ${putRes.status} ${await putRes.text()}`)
  }
}

/**
 * Removes a deployment route from Caddy using the @id tag.
 * A 404 from Caddy is treated as a no-op (route already removed).
 */
export async function removeRoute(deploymentId: string): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN}/id/deploy-${deploymentId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  })

  if (!res.ok && res.status !== 404) {
    throw new Error(`Caddy admin DELETE failed: ${res.status} ${await res.text()}`)
  }
}
