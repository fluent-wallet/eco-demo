import { spawn } from 'node:child_process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const outputDir = resolve(root, 'dist')

const apps = [
  {
    name: 'EIP-4337 + EIP-7702 Demo',
    description: 'Observe EIP-4337 UserOperations with smart account and EIP-7702 flows on Conflux eSpace Testnet.',
    packageName: '@eco-demo/eip-4337-demo',
    sourceDir: resolve(root, 'apps/eip-4337-demo/dist'),
    targetDir: resolve(outputDir, 'eip-4337'),
    href: './eip-4337/',
  },
  {
    name: 'EIP-7702 Demo',
    description: 'Sign an EIP-7702 authorization and send a transaction with wallet or private-key flows.',
    packageName: '@eco-demo/eip-7702-demo',
    sourceDir: resolve(root, 'apps/eip-7702-demo/dist'),
    targetDir: resolve(outputDir, 'eip-7702'),
    href: './eip-7702/',
  },
]

for (const app of apps) {
  await run('pnpm', ['--filter', app.packageName, 'build'])
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

for (const app of apps) {
  await cp(app.sourceDir, app.targetDir, { recursive: true })
}

await writeFile(resolve(outputDir, 'index.html'), renderHomePage(apps))

function renderHomePage(items) {
  const cards = items
    .map(
      (item) => `
        <a class="card" href="${item.href}">
          <span class="eyebrow">Demo</span>
          <h2>${escapeHtml(item.name)}</h2>
          <p>${escapeHtml(item.description)}</p>
          <span class="open">Open demo</span>
        </a>`,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>eco-demo</title>
    <style>
      :root {
        color: #172033;
        background: #f6f7fb;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
      }

      main {
        width: min(960px, calc(100% - 32px));
        margin: 0 auto;
        padding: 64px 0;
      }

      header {
        margin-bottom: 32px;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 5vw, 4rem);
        line-height: 1;
        letter-spacing: 0;
      }

      header p {
        max-width: 680px;
        margin: 16px 0 0;
        color: #5c667a;
        font-size: 1rem;
        line-height: 1.6;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }

      .card {
        display: flex;
        min-height: 220px;
        flex-direction: column;
        gap: 12px;
        padding: 24px;
        color: inherit;
        text-decoration: none;
        background: #ffffff;
        border: 1px solid #e0e5ef;
        border-radius: 8px;
        box-shadow: 0 16px 40px rgba(23, 32, 51, 0.08);
      }

      .card:hover {
        border-color: #6d7cff;
      }

      .eyebrow {
        color: #5661c9;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h2 {
        margin: 0;
        font-size: 1.5rem;
        line-height: 1.2;
        letter-spacing: 0;
      }

      .card p {
        margin: 0;
        color: #657087;
        line-height: 1.55;
      }

      .open {
        margin-top: auto;
        color: #2530a6;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>eco-demo</h1>
        <p>Small, focused demos for EIP-4337 and EIP-7702 workflows.</p>
      </header>
      <section class="grid" aria-label="Demo projects">
        ${cards}
      </section>
    </main>
  </body>
</html>
`
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}
