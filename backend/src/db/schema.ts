import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const deployments = sqliteTable('deployments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceType: text('source_type', { enum: ['git', 'upload'] }).notNull(),
  sourceUrl: text('source_url'),
  status: text('status', {
    enum: ['pending', 'building', 'deploying', 'running', 'failed'],
  })
    .notNull()
    .default('pending'),
  imageTag: text('image_tag'),
  containerId: text('container_id'),
  containerName: text('container_name'),
  url: text('url'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const logs = sqliteTable('logs', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  deploymentId: text('deployment_id')
    .notNull()
    .references(() => deployments.id, { onDelete: 'cascade' }),
  line: text('line').notNull(),
  stream: text('stream', { enum: ['stdout', 'stderr', 'system'] })
    .notNull()
    .default('system'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export type Deployment = typeof deployments.$inferSelect
export type NewDeployment = typeof deployments.$inferInsert
export type Log = typeof logs.$inferSelect
