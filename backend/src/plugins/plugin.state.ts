import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ensureDir,
  pluginsRootDir,
  readJson,
  stateFilePath,
  writeJson,
} from './plugin.paths'
import type { PluginStateEntry, PluginStateFile } from './plugin.types'

const EMPTY_STATE: PluginStateFile = { version: 1, plugins: {} }

export function readState(): PluginStateFile {
  const state = readJson<PluginStateFile>(stateFilePath())
  if (!state || state.version !== 1 || typeof state.plugins !== 'object') {
    return { ...EMPTY_STATE, plugins: {} }
  }
  return state
}

export function writeState(state: PluginStateFile): void {
  writeJson(stateFilePath(), state)
}

export function getEntry(id: string): PluginStateEntry | null {
  return readState().plugins[id] ?? null
}

export function setEntry(id: string, entry: PluginStateEntry): void {
  const state = readState()
  state.plugins[id] = entry
  writeState(state)
}

export function removeEntry(id: string): void {
  const state = readState()
  delete state.plugins[id]
  writeState(state)
}

export function markSyncRequired(): void {
  ensureDir(pluginsRootDir())
  fs.writeFileSync(path.join(pluginsRootDir(), '.sync-required'), new Date().toISOString(), 'utf8')
}

export function clearSyncRequired(): void {
  const marker = path.join(pluginsRootDir(), '.sync-required')
  if (fs.existsSync(marker)) {
    try {
      fs.unlinkSync(marker)
    } catch {
      // ignore
    }
  }
}
