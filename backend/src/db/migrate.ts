import { sqlite } from './client.js'

export function migrate(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('git', 'upload')),
      source_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'building', 'deploying', 'running', 'failed')),
      image_tag TEXT,
      container_id TEXT,
      container_name TEXT,
      url TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
      line TEXT NOT NULL,
      stream TEXT NOT NULL DEFAULT 'system'
        CHECK(stream IN ('stdout', 'stderr', 'system')),
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_deployment_id ON logs(deployment_id);
    CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at DESC);
  `)

  console.log('[brimble] Database migrations complete')
}
