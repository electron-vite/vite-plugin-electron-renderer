document.getElementById('app')!.innerHTML = `
<h1>examples/web-worker</h1>
<button id="worker">Click to load Web Worker</button>
`
let worker: Worker | undefined

document.getElementById('worker')!.addEventListener('click', () => {
  if (worker) {
    worker.terminate()
    worker = undefined
  }

  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
})
