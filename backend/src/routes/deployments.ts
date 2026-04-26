import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { desc, eq, asc } from 'drizzle-orm'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { db } from '../db/client.js'
import { deployments, logs } from '../db/schema.js'
import { getEmitter, type LogEvent } from '../events.js'
import { runPipeline } from '../pipeline/index.js'
import { stopContainer, removeContainer } from '../pipeline/container.js'
import { removeRoute } from '../pipeline/caddy.js'

export const deploymentsRouter = new Hono()

// GET /api/deployments
deploymentsRouter.get('/', async (c) => {
  const result = await db
    .select()
    .from(deployments)
    .orderBy(desc(deployments.createdAt))
  return c.json(result)
})

// GET /api/deployments/:id
deploymentsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [dep] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .limit(1)
  if (!dep) return c.json({ error: 'Not found' }, 404)
  return c.json(dep)
})

// POST /api/deployments  (multipart: source_type, git_url?, file?)
deploymentsRouter.post('/', async (c) => {
  const body = await c.req.parseBody()
  const sourceType = body['source_type'] as string

  if (!sourceType || !['git', 'upload'].includes(sourceType)) {
    return c.json({ error: 'source_type must be "git" or "upload"' }, 400)
  }

  const id = randomUUID()
  const now = Date.now()
  let name: string
  let sourceUrl: string | null = null

  if (sourceType === 'git') {
    const gitUrl = body['git_url'] as string
    if (!gitUrl?.trim()) return c.json({ error: 'git_url is required' }, 400)

    // Basic URL validation to prevent command injection
    try {
      const parsed = new URL(gitUrl.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return c.json({ error: 'Only http/https git URLs are supported' }, 400)
      }
    } catch {
      return c.json({ error: 'Invalid git_url' }, 400)
    }

    sourceUrl = gitUrl.trim()
    name = sourceUrl.split('/').pop()?.replace(/\.git$/, '') ?? 'deployment'
  } else {
    const file = body['file'] as File | undefined
    if (!file) return c.json({ error: 'file is required for upload' }, 400)

    const uploadsDir = '/data/uploads'
    await mkdir(uploadsDir, { recursive: true })
    const uploadPath = join(uploadsDir, `${id}.zip`)
    const buffer = await file.arrayBuffer()
    await writeFile(uploadPath, Buffer.from(buffer))

    sourceUrl = uploadPath
    name = file.name.replace(/\.(zip|tar\.gz|tgz)$/, '') || 'upload'
  }

  await db.insert(deployments).values({
    id,
    name,
    sourceType: sourceType as 'git' | 'upload',
    sourceUrl,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  })

  const [dep] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .limit(1)

  // Fire pipeline in background — intentionally not awaited
  runPipeline(id, sourceType as 'git' | 'upload', sourceUrl).catch((err) => {
    console.error(`[pipeline:${id}] Unhandled error:`, err)
  })

  return c.json(dep, 201)
})

// POST /api/deployments/:id/redeploy
deploymentsRouter.post('/:id/redeploy', async (c) => {
  const id = c.req.param('id')
  const [dep] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .limit(1)
  if (!dep) return c.json({ error: 'Not found' }, 404)

  if (['building', 'deploying'].includes(dep.status)) {
    return c.json({ error: 'Deployment already in progress' }, 409)
  }

  const now = Date.now()
  await db
    .update(deployments)
    .set({ status: 'pending', updatedAt: now, errorMessage: null })
    .where(eq(deployments.id, id))

  runPipeline(id, dep.sourceType, dep.sourceUrl).catch((err) => {
    console.error(`[pipeline:${id}] Unhandled redeploy error:`, err)
  })

  return c.json({ success: true })
})

// DELETE /api/deployments/:id
deploymentsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [dep] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .limit(1)
  if (!dep) return c.json({ error: 'Not found' }, 404)

  // Tear down: stop container, remove Caddy route
  if (dep.containerName) {
    await stopContainer(dep.containerName).catch(() => {})
    await removeContainer(dep.containerName).catch(() => {})
  }
  await removeRoute(id).catch(() => {})

  // Delete deployment (logs cascade)
  await db.delete(deployments).where(eq(deployments.id, id))

  return c.json({ success: true })
})

// GET /api/deployments/:id/logs  (SSE stream)
deploymentsRouter.get('/:id/logs', async (c) => {
  const id = c.req.param('id')

  const [dep] = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, id))
    .limit(1)
  if (!dep) return c.json({ error: 'Not found' }, 404)

  c.header('Cache-Control', 'no-cache')
  c.header('X-Accel-Buffering', 'no')

  return streamSSE(c, async (stream) => {
    // 1. Subscribe to live events FIRST to avoid missing events
    const emitter = getEmitter(id)
    const pending: LogEvent[] = []
    let pipelineDone = false

    const onPendingLog = (event: LogEvent) => pending.push(event)
    const onPendingDone = () => { pipelineDone = true }
    emitter.on('log', onPendingLog)
    emitter.once('done', onPendingDone)

    try {
      // 2. Send historical logs
      const historical = await db
        .select()
        .from(logs)
        .where(eq(logs.deploymentId, id))
        .orderBy(asc(logs.id))

      for (const log of historical) {
        await stream.writeSSE({
          event: 'log',
          data: JSON.stringify({
            line: log.line,
            stream: log.stream,
            createdAt: log.createdAt,
          }),
        })
      }

      // 3. Flush any live logs that arrived while we sent history
      emitter.off('log', onPendingLog)
      for (const event of pending) {
        await stream.writeSSE({ event: 'log', data: JSON.stringify(event) })
      }

      // 4. Check if we're already done (handles race condition)
      const [current] = await db
        .select()
        .from(deployments)
        .where(eq(deployments.id, id))
        .limit(1)

      if (pipelineDone || !current || ['running', 'failed'].includes(current.status)) {
        await stream.writeSSE({ event: 'done', data: current?.status ?? '' })
        return
      }

      // 5. Stream live logs until pipeline finishes or client disconnects
      await new Promise<void>((resolve) => {
        const onLog = (event: LogEvent) => {
          stream
            .writeSSE({ event: 'log', data: JSON.stringify(event) })
            .catch(() => resolve())
        }
        const onDone = async () => {
          try {
            await stream.writeSSE({ event: 'done', data: '' })
          } finally {
            resolve()
          }
        }

        emitter.on('log', onLog)
        emitter.once('done', onDone)

        stream.onAbort(() => {
          emitter.off('log', onLog)
          emitter.off('done', onDone)
          resolve()
        })
      })
    } finally {
      emitter.off('log', onPendingLog)
      emitter.off('done', onPendingDone)
    }
  })
})
