import path from 'node:path'

export type ThemeMode = 'sunrise' | 'harbor' | 'ink'

export interface WorkspaceNote {
  id: string
  title: string
  mood: 'calm' | 'focus' | 'ship'
}

export interface ExampleStoreShape {
  accent: string
  author: string
  autosave: boolean
  launchCount: number
  notes: string
  recentNotes: WorkspaceNote[]
  theme: ThemeMode
}

export const storeDirectory = path.join(process.cwd(), 'node_modules', '.electron-store-example')
export const storeName = 'studio-state'

export const defaultStore: ExampleStoreShape = {
  accent: '#b8572f',
  author: 'Renderer operator',
  autosave: true,
  launchCount: 0,
  notes: 'Use this panel to verify that renderer-side electron-store writes into node_modules.',
  recentNotes: [
    { id: 'palette-pass', title: 'Tune palette tokens', mood: 'calm' },
    { id: 'shipping-checklist', title: 'Review release checklist', mood: 'ship' },
  ],
  theme: 'sunrise',
}
