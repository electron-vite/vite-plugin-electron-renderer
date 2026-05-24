const _ = new Worker(new URL('./worker-entry.ts', import.meta.url), { type: 'module' })
