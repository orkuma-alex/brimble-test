import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const DOCKER_NETWORK = process.env.DOCKER_NETWORK ?? 'brimble_app_net'

/**
 * Starts a new detached container on the shared Docker network.
 * Removes any existing container with the same name first (idempotent).
 */
export async function runContainer(imageTag: string, containerName: string): Promise<string> {
  // Remove existing container with same name (handles redeploys)
  await exec('docker', ['rm', '-f', containerName]).catch(() => {})

  const { stdout } = await exec('docker', [
    'run', '-d',
    '--name', containerName,
    '--network', DOCKER_NETWORK,
    '--env', 'PORT=3000',
    '--restart', 'unless-stopped',
    imageTag,
  ])

  return stdout.trim()
}

/**
 * Gracefully stops a container (SIGTERM, 10s timeout).
 */
export async function stopContainer(containerIdOrName: string): Promise<void> {
  await exec('docker', ['stop', '-t', '10', containerIdOrName])
}

/**
 * Force-removes a container.
 */
export async function removeContainer(containerIdOrName: string): Promise<void> {
  await exec('docker', ['rm', '-f', containerIdOrName])
}

/**
 * Polls until the container reports State.Running == true, or throws on timeout.
 */
export async function waitForContainer(
  containerName: string,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const running = await isContainerRunning(containerName)
    if (running) return
    await sleep(500)
  }

  throw new Error(`Container "${containerName}" did not start within ${timeoutMs / 1000}s`)
}

async function isContainerRunning(containerIdOrName: string): Promise<boolean> {
  try {
    const { stdout } = await exec('docker', [
      'inspect',
      '--format', '{{.State.Running}}',
      containerIdOrName,
    ])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
