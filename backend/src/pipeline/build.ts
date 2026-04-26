import { spawn } from 'node:child_process'

type LogFn = (line: string, stream: 'stdout' | 'stderr') => void

/**
 * Builds a container image from a source directory using Railpack + BuildKit.
 *
 * Requires:
 *   - BUILDKIT_HOST env var pointing at the BuildKit daemon
 *     (e.g. docker-container://buildkit)
 *   - `railpack` binary in PATH
 */
export async function buildImage(
  srcDir: string,
  imageName: string,
  cacheKey: string,
  onLog: LogFn
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      'build',
      srcDir,
      '--name', imageName,
      '--cache-key', cacheKey,
      '--progress', 'plain',
    ]

    const proc = spawn('railpack', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Ensure BuildKit host is propagated
        BUILDKIT_HOST: process.env.BUILDKIT_HOST ?? 'docker-container://buildkit',
      },
    })

    proc.stdout.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => onLog(line, 'stdout'))
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .forEach((line) => onLog(line, 'stderr'))
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`railpack exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn railpack: ${err.message}`))
    })
  })
}
