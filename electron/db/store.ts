import { app } from 'electron'
import fs from 'fs'
import path from 'path'

let dataDir: string | null = null

function getDataDir(): string {
  if (!dataDir) {
    dataDir = path.join(app.getPath('userData'), 'data')
  }
  return dataDir
}

async function ensureDir(dir: string) {
  try {
    await fs.promises.access(dir)
  } catch {
    await fs.promises.mkdir(dir, { recursive: true })
  }
}

function getFilePath(collection: string): string {
  const dir = getDataDir()
  return path.join(dir, `${collection}.json`)
}

export async function readCollection<T>(collection: string): Promise<T[]> {
  const filePath = getFilePath(collection)
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T[]
  } catch {
    return []
  }
}

export async function writeCollection<T>(collection: string, data: T[]): Promise<void> {
  const filePath = getFilePath(collection)
  await ensureDir(getDataDir())
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function appendItem<T extends { id: string }>(collection: string, item: T): Promise<T> {
  const items = await readCollection<T>(collection)
  items.unshift(item)
  await writeCollection(collection, items)
  return item
}

export async function updateItem<T extends { id: string }>(
  collection: string,
  id: string,
  updates: Partial<T>
): Promise<T | null> {
  const items = await readCollection<T>(collection)
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return null
  items[index] = { ...items[index], ...updates }
  await writeCollection(collection, items)
  return items[index]
}

export async function deleteItem<T extends { id: string }>(collection: string, id: string): Promise<boolean> {
  const items = await readCollection<T>(collection)
  const filtered = items.filter((item) => item.id !== id)
  if (filtered.length === items.length) return false
  await writeCollection(collection, filtered)
  return true
}

export async function getItem<T extends { id: string }>(collection: string, id: string): Promise<T | null> {
  const items = await readCollection<T>(collection)
  return items.find((item) => item.id === id) || null
}

export async function migrateIfNeeded() {
  const dir = getDataDir()
  const subjectsPath = path.join(dir, 'subjects.json')
  const categoriesPath = path.join(dir, 'categories.json')

  try {
    await fs.promises.access(subjectsPath)
    return
  } catch {
    // subjects.json doesn't exist
  }

  try {
    await fs.promises.rename(categoriesPath, subjectsPath)
  } catch {
    // categories.json doesn't exist either
  }
}
