import { ipcRenderer } from 'electron'
import Store from 'electron-store'

import { defaultStore, storeDirectory, storeName } from '../shared/store-config'
import type { ExampleStoreShape, ThemeMode, WorkspaceNote } from '../shared/store-config'

const store = new Store<ExampleStoreShape>({
  cwd: storeDirectory,
  defaults: defaultStore,
  name: storeName,
})

store.set('launchCount', store.get('launchCount') + 1)

const app = document.getElementById('app')
if (!app) {
  throw new TypeError('#app element is missing')
}

let draftNote = ''
let shellMeta = {
  cwd: process.cwd(),
  storeDirectory,
}

ipcRenderer.on('electron-store-example:meta', (_event, payload: typeof shellMeta) => {
  shellMeta = payload
  render()
})

store.onDidAnyChange(() => {
  render()
})

function getMoodTone(mood: WorkspaceNote['mood']) {
  switch (mood) {
    case 'focus':
      return 'Focus lane'
    case 'ship':
      return 'Ship lane'
    default:
      return 'Calm lane'
  }
}

function themeLabel(theme: ThemeMode) {
  switch (theme) {
    case 'harbor':
      return 'Harbor blue'
    case 'ink':
      return 'Ink room'
    default:
      return 'Sunrise clay'
  }
}

function addNote() {
  const title = draftNote.trim()
  if (!title) {
    return
  }

  const nextMood: WorkspaceNote['mood'][] = ['calm', 'focus', 'ship']
  const recentNotes = store.get('recentNotes')
  store.set('recentNotes', [
    {
      id: `${Date.now()}`,
      title,
      mood: nextMood[recentNotes.length % nextMood.length],
    },
    ...recentNotes,
  ])
  draftNote = ''
}

function removeNote(id: string) {
  store.set(
    'recentNotes',
    store.get('recentNotes').filter((note) => note.id !== id),
  )
}

async function openStoreFile() {
  try {
    await store.openInEditor()
  } catch (error) {
    console.error('Failed to open store file:', error)
    // oxlint-disable-next-line no-alert
    window.alert('Unable to open the store file in your editor.')
  }
}

function resetStore() {
  store.store = {
    ...defaultStore,
    launchCount: store.get('launchCount'),
  }
  draftNote = ''
}

function render() {
  const state = store.store
  const noteItems = state.recentNotes
    .map(
      (note) => `
        <li class="note-item" data-note-id="${note.id}">
          <div>
            <p class="note-title">${escapeHtml(note.title)}</p>
            <p class="note-meta">${getMoodTone(note.mood)}</p>
          </div>
          <button class="ghost-button" data-remove-note="${note.id}" type="button">Remove</button>
        </li>
      `,
    )
    .join('')

  app!.innerHTML = `
    <style>
      :root {
        color-scheme: light;
        --paper: oklch(0.95 0.018 52);
        --ink: oklch(0.23 0.03 38);
        --muted: oklch(0.52 0.02 42);
        --line: oklch(0.84 0.02 48);
        --accent: ${state.accent};
        --accent-soft: color-mix(in oklab, var(--accent) 18%, white);
        --panel: color-mix(in oklab, white 78%, var(--accent) 6%);
        --shadow: 0 28px 80px color-mix(in srgb, var(--accent) 12%, transparent);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, color-mix(in oklab, var(--accent) 22%, transparent), transparent 34%),
          radial-gradient(circle at bottom right, oklch(0.86 0.045 70 / 0.8), transparent 28%),
          linear-gradient(160deg, oklch(0.97 0.015 55), oklch(0.9 0.02 35));
        color: var(--ink);
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 24px auto;
        padding: 28px;
        border: 1px solid color-mix(in oklab, var(--line) 82%, var(--accent) 8%);
        border-radius: 28px;
        background: color-mix(in oklab, white 84%, var(--accent) 4%);
        box-shadow: var(--shadow);
      }

      .hero {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 20px;
        align-items: stretch;
      }

      .hero-card,
      .panel {
        border: 1px solid color-mix(in oklab, var(--line) 86%, var(--accent) 10%);
        border-radius: 24px;
        background: var(--panel);
      }

      .hero-card {
        padding: 28px;
        position: relative;
        overflow: hidden;
      }

      .hero-card::after {
        content: "";
        position: absolute;
        inset: auto -40px -70px auto;
        width: 220px;
        height: 220px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--accent) 24%, transparent);
        filter: blur(12px);
      }

      .eyebrow,
      .metric-label,
      .panel-label,
      .microcopy,
      .note-meta,
      .meta-block code {
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }

      .eyebrow {
        margin: 0 0 12px;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      h1 {
        font-size: clamp(2.4rem, 4vw, 4.2rem);
        line-height: 0.95;
        max-width: 10ch;
      }

      .hero-copy {
        margin-top: 16px;
        max-width: 42ch;
        font-size: 1.02rem;
        line-height: 1.6;
        color: color-mix(in oklab, var(--ink) 76%, var(--muted));
      }

      .hero-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 24px;
      }

      .stat {
        padding: 16px;
        border-radius: 18px;
        background: color-mix(in oklab, white 74%, var(--accent) 8%);
      }

      .metric-value {
        font-size: 1.65rem;
      }

      .metric-label {
        margin-top: 4px;
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .meta-card {
        padding: 22px;
        display: grid;
        gap: 12px;
      }

      .meta-block {
        padding: 14px 16px;
        border-radius: 18px;
        background: color-mix(in oklab, white 82%, var(--accent) 6%);
      }

      .meta-block code {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.5;
        word-break: break-all;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
        gap: 20px;
        margin-top: 20px;
      }

      .panel {
        padding: 22px;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 16px;
        margin-bottom: 20px;
      }

      .panel-title {
        font-size: 1.65rem;
      }

      .microcopy {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .controls {
        display: grid;
        gap: 16px;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field label {
        font-size: 0.95rem;
      }

      .field input[type="text"],
      .field textarea,
      .field select {
        width: 100%;
        padding: 14px 16px;
        border: 1px solid color-mix(in oklab, var(--line) 86%, var(--accent) 8%);
        border-radius: 16px;
        background: color-mix(in oklab, white 86%, var(--accent) 4%);
        color: var(--ink);
      }

      .field textarea {
        min-height: 138px;
        resize: vertical;
      }

      .inline-row {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 12px;
      }

      .switch-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        border: 1px solid color-mix(in oklab, var(--line) 86%, var(--accent) 8%);
        border-radius: 16px;
      }

      .swatch {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        border: 1px solid color-mix(in oklab, var(--line) 70%, var(--accent) 16%);
        background: var(--accent);
      }

      .note-list {
        display: grid;
        gap: 10px;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .note-item {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 14px 16px;
        border-radius: 16px;
        background: color-mix(in oklab, white 80%, var(--accent) 8%);
      }

      .note-title {
        font-size: 1rem;
      }

      .note-meta {
        margin-top: 4px;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .composer {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        margin-top: 16px;
      }

      .primary-button,
      .ghost-button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        cursor: pointer;
        transition: transform 180ms ease-out, background-color 180ms ease-out;
      }

      .primary-button {
        background: var(--accent);
        color: color-mix(in oklab, white 92%, var(--ink) 8%);
      }

      .ghost-button {
        background: color-mix(in oklab, white 84%, var(--accent) 6%);
        color: var(--ink);
      }

      .primary-button:hover,
      .ghost-button:hover {
        transform: translateY(-1px);
      }

      .footer-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }

      @media (max-width: 920px) {
        .hero,
        .grid {
          grid-template-columns: 1fr;
        }

        .hero-stats {
          grid-template-columns: 1fr;
        }

        .inline-row,
        .composer {
          grid-template-columns: 1fr;
        }
      }
    </style>
    <main class="shell">
      <section class="hero">
        <article class="hero-card">
          <p class="eyebrow">Standalone example</p>
          <h1>Electron Store Studio</h1>
          <p class="hero-copy">
            A renderer-first playground that persists preferences, notes, and launch history into a custom JSON file placed under <strong>node_modules</strong>.
          </p>
          <div class="hero-stats">
            <div class="stat">
              <div class="metric-value">${state.launchCount}</div>
              <div class="metric-label">Launch count</div>
            </div>
            <div class="stat">
              <div class="metric-value">${state.recentNotes.length}</div>
              <div class="metric-label">Saved notes</div>
            </div>
            <div class="stat">
              <div class="metric-value">${escapeHtml(themeLabel(state.theme))}</div>
              <div class="metric-label">Theme preset</div>
            </div>
          </div>
        </article>
        <aside class="hero-card meta-card">
          <div class="meta-block">
            <div class="microcopy">Renderer cwd</div>
            <code>${escapeHtml(shellMeta.cwd)}</code>
          </div>
          <div class="meta-block">
            <div class="microcopy">Store directory</div>
            <code>${escapeHtml(shellMeta.storeDirectory)}</code>
          </div>
          <div class="meta-block">
            <div class="microcopy">Store file</div>
            <code>${escapeHtml(store.path)}</code>
          </div>
        </aside>
      </section>

      <section class="grid">
        <article class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-label microcopy">Control room</p>
              <h2 class="panel-title">Persisted preferences</h2>
            </div>
            <div class="swatch" aria-hidden="true"></div>
          </div>
          <div class="controls">
            <div class="field">
              <label for="author">Operator name</label>
              <input id="author" type="text" value="${escapeHtml(state.author)}" />
            </div>
            <div class="inline-row">
              <div class="field">
                <label for="accent">Accent</label>
                <input id="accent" type="color" value="${escapeHtml(state.accent)}" />
              </div>
              <div class="field">
                <label for="theme">Theme</label>
                <select id="theme">
                  ${renderThemeOption(state.theme, 'sunrise', 'Sunrise clay')}
                  ${renderThemeOption(state.theme, 'harbor', 'Harbor blue')}
                  ${renderThemeOption(state.theme, 'ink', 'Ink room')}
                </select>
              </div>
            </div>
            <div class="switch-row">
              <div>
                <p>Autosave renderer edits</p>
                <p class="microcopy">Writes to the custom store path on every input event.</p>
              </div>
              <input id="autosave" type="checkbox" ${state.autosave ? 'checked' : ''} />
            </div>
            <div class="field">
              <label for="notes">Working notes</label>
              <textarea id="notes">${escapeHtml(state.notes)}</textarea>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <p class="panel-label microcopy">Store content</p>
              <h2 class="panel-title">Recent notes</h2>
            </div>
            <div class="microcopy">${state.recentNotes.length} entries</div>
          </div>
          <ul class="note-list">${noteItems}</ul>
          <div class="composer">
            <input id="draft-note" type="text" placeholder="Add a note to the JSON store" value="${escapeHtml(draftNote)}" />
            <button class="primary-button" id="add-note" type="button">Add note</button>
          </div>
          <div class="footer-actions">
            <button class="ghost-button" id="open-store" type="button">Open JSON file</button>
            <button class="ghost-button" id="reset-store" type="button">Reset defaults</button>
          </div>
        </article>
      </section>
    </main>
  `

  const authorInput = document.getElementById('author') as HTMLInputElement | null
  authorInput?.addEventListener('input', (event) => {
    store.set('author', (event.target as HTMLInputElement).value)
  })

  const accentInput = document.getElementById('accent') as HTMLInputElement | null
  accentInput?.addEventListener('input', (event) => {
    store.set('accent', (event.target as HTMLInputElement).value)
  })

  const themeSelect = document.getElementById('theme') as HTMLSelectElement | null
  themeSelect?.addEventListener('change', (event) => {
    store.set('theme', (event.target as HTMLSelectElement).value as ThemeMode)
  })

  const autosaveInput = document.getElementById('autosave') as HTMLInputElement | null
  autosaveInput?.addEventListener('change', (event) => {
    store.set('autosave', (event.target as HTMLInputElement).checked)
  })

  const notesInput = document.getElementById('notes') as HTMLTextAreaElement | null
  notesInput?.addEventListener('input', (event) => {
    store.set('notes', (event.target as HTMLTextAreaElement).value)
  })

  const draftInput = document.getElementById('draft-note') as HTMLInputElement | null
  draftInput?.addEventListener('input', (event) => {
    draftNote = (event.target as HTMLInputElement).value
  })
  draftInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      addNote()
    }
  })

  document.getElementById('add-note')?.addEventListener('click', () => {
    addNote()
  })

  document.getElementById('open-store')?.addEventListener('click', () => {
    void openStoreFile()
  })

  document.getElementById('reset-store')?.addEventListener('click', () => {
    resetStore()
  })

  for (const button of document.querySelectorAll('[data-remove-note]')) {
    button.addEventListener('click', () => {
      removeNote((button as HTMLButtonElement).dataset.removeNote ?? '')
    })
  }
}

function renderThemeOption(current: ThemeMode, value: ThemeMode, label: string) {
  return `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

render()
