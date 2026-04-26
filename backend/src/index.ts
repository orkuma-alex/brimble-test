import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { migrate } from './db/migrate.js'
import { deploymentsRouter } from './routes/deployments.js'

const app = new Hono()

app.use('*', cors())
app.use('*', logger())

app.get('/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

app.route('/api/deployments', deploymentsRouter)

// Run DB migrations synchronously before starting
migrate()

const port = parseInt(process.env.PORT ?? '3000', 10)
console.log(`[brimble] Backend starting on port ${port}`)

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
