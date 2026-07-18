export type StreamEvent =
  | { type: 'topic_start'; topicId: string; topicTitle: string; index: number; total: number }
  | { type: 'content_delta'; topicId: string; delta: string; accumulated: string }
  | { type: 'topic_complete'; topicId: string; topicTitle: string; content: string; qualityPassed: boolean; qualityIssues: string[] }
  | { type: 'error'; topicId: string; message: string }

type EventHandler = (event: StreamEvent) => void

class StreamBroker {
  private listeners = new Map<string, Set<EventHandler>>()

  subscribe(sessionId: string, handler: EventHandler): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set())
    }
    this.listeners.get(sessionId)!.add(handler)
    return () => {
      this.listeners.get(sessionId)?.delete(handler)
    }
  }

  publish(sessionId: string, event: StreamEvent): void {
    const handlers = this.listeners.get(sessionId)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event)
        } catch (err) {
          console.error('[StreamBroker] handler error:', err)
        }
      }
    }
  }

  clear(sessionId: string): void {
    this.listeners.delete(sessionId)
  }
}

export const streamBroker = new StreamBroker()
