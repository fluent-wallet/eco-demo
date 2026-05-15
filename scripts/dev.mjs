import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const processes = [
  {
    name: 'eip-4337',
    command: 'pnpm',
    args: [
      '--filter',
      '@eco-demo/eip-4337-demo',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
      '--strictPort',
    ],
  },
  {
    name: 'eip-7702',
    command: 'pnpm',
    args: [
      '--filter',
      '@eco-demo/eip-7702-demo',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      '3008',
      '--strictPort',
    ],
  },
  {
    name: 'eco-demo',
    command: 'pnpm',
    args: [
      '--filter',
      '@eco-demo/eip-4337-demo',
      'exec',
      'vite',
      root,
      '--config',
      resolve(root, 'vite.config.mjs'),
      '--host',
      '127.0.0.1',
      '--port',
      '4173',
      '--strictPort',
    ],
  },
]

const children = processes.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })

  child.stdout.on('data', (data) => process.stdout.write(prefix(name, data)))
  child.stderr.on('data', (data) => process.stderr.write(prefix(name, data)))
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[${name}] exited with ${signal ?? code}`)
    shutdown(code ?? 1)
  })

  return child
})

let shuttingDown = false

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

function shutdown(code) {
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(code), 200)
}

function prefix(name, data) {
  return String(data)
    .split('\n')
    .filter(Boolean)
    .map((line) => `[${name}] ${line}\n`)
    .join('')
}
