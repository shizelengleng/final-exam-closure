import { ipcMain } from 'electron'
import { readCollection, writeCollection, appendItem, updateItem, deleteItem, getItem } from '../db/store'

export function registerDBHandlers() {
  ipcMain.handle('db:list', (_event, collection: string) => {
    return readCollection(collection)
  })

  ipcMain.handle('db:get', (_event, collection: string, id: string) => {
    return getItem(collection, id)
  })

  ipcMain.handle('db:add', (_event, collection: string, item: { id: string }) => {
    return appendItem(collection, item)
  })

  ipcMain.handle('db:update', (_event, collection: string, id: string, updates: Record<string, unknown>) => {
    return updateItem(collection, id, updates)
  })

  ipcMain.handle('db:delete', (_event, collection: string, id: string) => {
    return deleteItem(collection, id)
  })

  ipcMain.handle('db:write', async (_event, collection: string, data: unknown[]) => {
    await writeCollection(collection, data)
    return { success: true }
  })
}
