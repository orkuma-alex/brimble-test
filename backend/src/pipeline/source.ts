import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createReadStream } from 'node:fs'
import * as unzipper from 'unzipper'

const WORK_DIR = '/tmp/brimble'

/**
 * Resolves the source (git clone or zip extract) into a local directory
 * and returns its absolute path.
 */
export async function prepareSource(
  deploymentId: string,
  sourceType: 'git' | 'upload',
  sourceUrl: string | null
): Promise<string> {
  if (!sourceUrl) {
    throw new Error(`sourceUrl is required for sourceType=${sourceType}`)
  }

  const destDir = join(WORK_DIR, deploymentId)
  await rm(destDir, { recursive: true, force: true })
  await mkdir(destDir, { recursive: true })

  if (sourceType === 'git') {
    await gitClone(sourceUrl, destDir)
  } else {
    await extractZip(sourceUrl, destDir)
  }

  return destDir
}

async function gitClone(url: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', '--depth', '1', '--', url, destDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stderr: string[] = []
    proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`git clone failed (exit ${code}): ${stderr.join('')}`))
      }
    })

    proc.on('error', (err) => reject(new Error(`Failed to spawn git: ${err.message}`)))
  })
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destDir }))
      .on('close', resolve)
      .on('error', reject)
  })
}
