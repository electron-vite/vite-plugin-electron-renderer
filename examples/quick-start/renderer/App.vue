<script setup lang="ts">
const samples = [
  'Electron renderer APIs',
  'Node.js built-in modules',
  'Native Node.js packages',
  'Bundled Node.js ESM packages',
]
</script>

<template>
  <main class="app">
    <section class="intro" aria-labelledby="app-title">
      <p class="eyebrow">vite-plugin-electron-renderer</p>
      <h1 id="app-title">Vue quick start</h1>
      <p class="summary">
        Use Electron and Node.js APIs from a Vue renderer process while Vite keeps buildable ESM
        dependencies bundled.
      </p>

      <pre><code>import { ipcRenderer } from 'electron'
import fs from 'node:fs'</code></pre>
    </section>

    <section class="sample-list" aria-label="Enabled samples">
      <article v-for="sample in samples" :key="sample">
        {{ sample }}
      </article>
    </section>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  color: oklch(24% 0.025 255);
  background: oklch(97% 0.012 95);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
  gap: 40px;
  align-items: center;
  padding: clamp(32px, 8vw, 96px);
}

.intro {
  max-width: 680px;
}

.eyebrow {
  margin: 0 0 14px;
  color: oklch(44% 0.115 172);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(2.75rem, 7vw, 5.75rem);
  line-height: 0.95;
  letter-spacing: 0;
}

.summary {
  max-width: 62ch;
  margin: 24px 0 0;
  color: oklch(38% 0.025 255);
  font-size: 1.08rem;
  line-height: 1.7;
}

pre {
  max-width: 560px;
  overflow: auto;
  margin: 34px 0 0;
  padding: 18px 20px;
  border: 1px solid oklch(84% 0.028 255);
  border-radius: 8px;
  color: oklch(93% 0.018 150);
  background: oklch(22% 0.04 255);
  line-height: 1.6;
}

.sample-list {
  display: grid;
  gap: 12px;
}

.sample-list article {
  min-height: 54px;
  display: flex;
  align-items: center;
  padding: 16px 18px;
  border: 1px solid oklch(86% 0.022 255);
  border-radius: 8px;
  background: oklch(99% 0.006 95);
  color: oklch(31% 0.03 255);
  font-weight: 650;
}

@media (max-width: 760px) {
  .app {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 28px;
    padding: 32px 20px;
  }

  h1 {
    font-size: 3rem;
  }
}
</style>
