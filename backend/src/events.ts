import { EventEmitter } from 'node:events'

export interface LogEvent {
  line: string
  stream: 'stdout' | 'stderr' | 'system'
  createdAt: number
}

// One emitter per active deployment
const emitters = new Map<string, EventEmitter>()

export function getEmitter(deploymentId: string): EventEmitter {
  let emitter = emitters.get(deploymentId)
  if (!emitter) {
    emitter = new EventEmitter()
    emitter.setMaxListeners(100)
    emitters.set(deploymentId, emitter)
  }
  return emitter
}

export function removeEmitter(deploymentId: string): void {
  const emitter = emitters.get(deploymentId)
  if (emitter) {
    emitter.removeAllListeners()
    emitters.delete(deploymentId)
  }
}
