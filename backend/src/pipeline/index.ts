import { db, sqlite } from '../db/client.js'
import { deployments } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getEmitter, removeEmitter, type LogEvent } from '../events.js'
import { prepareSource } from './source.js'
import { buildImage } from './build.js'
import { runContainer, waitForContainer, stopContainer, removeContainer } from './container.js'
import { addRoute, removeRoute } from './caddy.js'

const HOST_BASE_URL = (process.env.HOST_BASE_URL ?? 'http://localhost').replace(/\/$/, '')

// Lazily prepared statement — avoids running before migrate() creates the table
let _insertLog: ReturnType<typeof sqlite.prepare> | null = null
function insertLog() {
  if (!_insertLog) {
    _insertLog = sqlite.prepare(
      'INSERT INTO logs (deployment_id, line, stream, created_at) VALUES (?, ?, ?, ?)'
    )
  }
  return _insertLog
}

export async function runPipeline(
  id: string,
  sourceType: 'git' | 'upload',
  sourceUrl: string | null
): Promise<void> {
  const emit = (line: string, stream: LogEvent['stream'] = 'system') => {
    const createdAt = Date.now()
    insertLog().run(id, line, stream, createdAt)
    getEmitter(id).emit('log', { line, stream, createdAt } satisfies LogEvent)
  }

  const setStatus = async (
    status: 'pending' | 'building' | 'deploying' | 'running' | 'failed',
    extra: Partial<{
      imageTag: string
      containerId: string
      containerName: string
      url: string
      errorMessage: string
    }> = {}
  ) => {
    await db
      .update(deployments)
      .set({ status, updatedAt: Date.now(), ...extra })
      .where(eq(deployments.id, id))
  }

  try {
    emit(`[brimble] Starting pipeline for deployment ${id}`)

    // -- Tear down any existing container for this deployment (redeploy path) --
    const [existing] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id))
      .limit(1)

    if (existing?.containerName) {
      emit(`[brimble] Stopping previous container (${existing.containerName})...`)
      await stopContainer(existing.containerName).catch(() => {})
      await removeContainer(existing.containerName).catch(() => {})
      await removeRoute(id).catch(() => {})
    }

    // -- Step 1: Prepare source --
    emit('[brimble] Preparing source...')
    await setStatus('building')
    const srcDir = await prepareSource(id, sourceType, sourceUrl)
    emit(`[brimble] Source ready at ${srcDir}`)

    // -- Step 2: Build image with Railpack --
    const shortId = id.split('-')[0]!
    const imageTag = `brimble/deploy:${shortId}`
    const containerName = `brimble-${shortId}`

    emit(`[brimble] Building image: ${imageTag}`)
    await buildImage(srcDir, imageTag, shortId, (line, stream) => emit(line, stream))
    emit(`[brimble] Image built: ${imageTag}`)
    await setStatus('building', { imageTag })

    // -- Step 3: Run container --
    emit(`[brimble] Starting container: ${containerName}`)
    await setStatus('deploying')
    const containerId = await runContainer(imageTag, containerName)
    await setStatus('deploying', { containerId, containerName })

    emit('[brimble] Waiting for container to be ready...')
    await waitForContainer(containerName, 30_000)
    // Give the process inside the container a moment to bind its port
    await sleep(1500)

    // -- Step 4: Configure Caddy ingress --
    emit('[brimble] Configuring ingress...')
    await addRoute(id, containerName)
    const url = `${HOST_BASE_URL}/deploy/${id}/`
    await setStatus('running', { url })
    emit(`[brimble] ✓ Deployment live at ${url}`)
    emit('[brimble] Pipeline complete.')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit(`[brimble] Pipeline failed: ${message}`, 'stderr')
    console.error(`[pipeline:${id}] error:`, err)
    await db
      .update(deployments)
      .set({ status: 'failed', updatedAt: Date.now(), errorMessage: message })
      .where(eq(deployments.id, id))
  } finally {
    // Signal SSE listeners that the pipeline is done (success or failure)
    getEmitter(id).emit('done')
    // Keep the emitter alive for a short while so late SSE subscribers can receive 'done',
    // then clean up to avoid a memory leak.
    setTimeout(() => removeEmitter(id), 60_000)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
