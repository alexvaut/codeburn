import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'

import { registerRoutes } from './routes.js'

export type ServerOptions = {
  port: number
  host: string
  open: boolean
}

function resolveStaticRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  // Candidates: repo dev path (src/server → web/dist), published package (dist → web/dist next to dist)
  const candidates = [
    resolve(here, '..', '..', 'web', 'dist'),
    resolve(here, '..', 'web', 'dist'),
    resolve(here, '..', '..', '..', 'web', 'dist'),
  ]
  for (const c of candidates) {
    if (existsSync(join(c, 'index.html'))) return c
  }
  return null
}

function openBrowser(url: string): void {
  const platform = process.platform
  try {
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref()
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch {
    // If auto-open fails, the URL is already printed to stdout — user can click it.
  }
}

export async function startServer(opts: ServerOptions): Promise<void> {
  const app = Fastify({ logger: false })

  registerRoutes(app)

  const staticRoot = resolveStaticRoot()
  if (staticRoot) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: '/',
      wildcard: false,
    })
    // SPA fallback: unknown non-API routes serve index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.code(404).send({ error: 'Not found' })
        return
      }
      reply.type('text/html').sendFile('index.html')
    })
  } else {
    app.get('/', async (_req, reply) => {
      reply.type('text/plain').send(
        'CodeBurn server is running, but the web UI has not been built yet.\n' +
        'Run `cd web && npm install && npm run build`, or use `npm run dev:web` during development.\n',
      )
    })
  }

  const address = await app.listen({ port: opts.port, host: opts.host })
  const url = address.replace('0.0.0.0', '127.0.0.1')
  process.stdout.write(`\n  CodeBurn web dashboard → ${url}\n\n`)
  if (opts.open) openBrowser(url)

  const shutdown = async (): Promise<void> => {
    try { await app.close() } catch { /* best-effort */ }
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
