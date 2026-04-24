import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const webRoot = resolve(root, 'web')

const backendPort = Number(process.argv[2] ?? process.env.PORT ?? 4501)
if (!Number.isInteger(backendPort) || backendPort <= 0 || backendPort > 65534) {
  console.error(`Invalid backend port: ${process.argv[2]}`)
  process.exit(1)
}
const frontendPort = backendPort + 1

console.log(`Backend  → http://127.0.0.1:${backendPort}`)
console.log(`Frontend → http://127.0.0.1:${frontendPort}`)

const tsxCli = resolve(root, 'node_modules/tsx/dist/cli.mjs')
const viteCli = resolve(webRoot, 'node_modules/vite/bin/vite.js')

const backend = spawn(
  process.execPath,
  [tsxCli, 'watch', 'src/cli.ts', 'serve', '--no-open', '--port', String(backendPort)],
  { cwd: root, stdio: 'inherit', env: process.env },
)

const frontend = spawn(
  process.execPath,
  [viteCli, '--port', String(frontendPort), '--strictPort'],
  {
    cwd: webRoot,
    stdio: 'inherit',
    env: { ...process.env, BACKEND_PORT: String(backendPort) },
  },
)

const children = [backend, frontend]
let shuttingDown = false

function killChild(child) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) killChild(c)
  setTimeout(() => process.exit(code), 500).unref()
}

backend.on('exit', (code) => shutdown(code ?? 0))
frontend.on('exit', (code) => shutdown(code ?? 0))
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
