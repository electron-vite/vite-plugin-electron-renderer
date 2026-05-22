async function bootstrapEsmPackages() {
  const [{ execa }, { default: got }, { default: nodeFetch }] = await Promise.all([
    import('execa'),
    import('got'),
    import('node-fetch'),
  ])

  console.log('Node.js ESM package execa (dynamic import):\n', execa)
  console.log('Node.js ESM package node-fetch (dynamic import):\n', nodeFetch)
  console.log('Node.js ESM package got (dynamic import):\n', got)
}

void bootstrapEsmPackages().catch((error: unknown) => {
  console.error('ESM package sample failed:', error)
})
