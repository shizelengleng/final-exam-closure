import { create } from 'zustand'

interface CompletedTopic {
  id: string
  title: string
  preview: string
  qualityPassed: boolean
  qualityIssues: string[]
}

interface OrchestrationState {
  snapshot: OrchestrationSnapshot | null
  isActive: boolean
  isCollapsed: boolean
  returnNotes: string

  // Stream state
  liveContent: string
  currentTopicId: string | null
  currentTopicTitle: string | null
  completedTopics: CompletedTopic[]

  setSnapshot: (snapshot: OrchestrationSnapshot) => void
  setCollapsed: (collapsed: boolean) => void
  setReturnNotes: (notes: string) => void
  handleStreamEvent: (event: StreamEvent) => void
  clear: () => void
}

export const useOrchestrationStore = create<OrchestrationState>((set) => ({
  snapshot: null,
  isActive: false,
  isCollapsed: false,
  returnNotes: '',

  // Stream state
  liveContent: '',
  currentTopicId: null,
  currentTopicTitle: null,
  completedTopics: [],

  setSnapshot: (snapshot) => set({ snapshot, isActive: true }),
  setCollapsed: (isCollapsed) => set({ isCollapsed }),
  setReturnNotes: (returnNotes) => set({ returnNotes }),

  handleStreamEvent: (e: StreamEvent) => {

    switch (e.type) {
      case 'topic_start':
        set({
          currentTopicId: e.topicId || null,
          currentTopicTitle: e.topicTitle || null,
          liveContent: '',
        })
        break

      case 'content_delta':
        set((state) => ({
          liveContent: state.liveContent + (e.delta || ''),
        }))
        break

      case 'topic_complete':
        set((state) => ({
          completedTopics: [
            ...state.completedTopics,
            {
              id: e.topicId || '',
              title: e.topicTitle || '',
              preview: (e.content || '').substring(0, 200),
              qualityPassed: e.qualityPassed ?? true,
              qualityIssues: (e.qualityIssues as string[]) || [],
            },
          ],
          liveContent: '',
          currentTopicId: null,
          currentTopicTitle: null,
        }))
        break

      case 'error':
        // Don't clear liveContent on error — keep what we have
        set({
          currentTopicId: null,
          currentTopicTitle: null,
        })
        break
    }
  },

  clear: () =>
    set({
      snapshot: null,
      isActive: false,
      isCollapsed: false,
      returnNotes: '',
      liveContent: '',
      currentTopicId: null,
      currentTopicTitle: null,
      completedTopics: [],
    }),
}))
