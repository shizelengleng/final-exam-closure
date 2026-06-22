import { create } from 'zustand'

interface OrchestrationState {
  snapshot: OrchestrationSnapshot | null
  isActive: boolean
  isCollapsed: boolean
  returnNotes: string
  setSnapshot: (snapshot: OrchestrationSnapshot) => void
  setCollapsed: (collapsed: boolean) => void
  setReturnNotes: (notes: string) => void
  clear: () => void
}

export const useOrchestrationStore = create<OrchestrationState>((set) => ({
  snapshot: null,
  isActive: false,
  isCollapsed: false,
  returnNotes: '',
  setSnapshot: (snapshot) => set({ snapshot, isActive: true }),
  setCollapsed: (isCollapsed) => set({ isCollapsed }),
  setReturnNotes: (returnNotes) => set({ returnNotes }),
  clear: () => set({ snapshot: null, isActive: false, isCollapsed: false, returnNotes: '' }),
}))
