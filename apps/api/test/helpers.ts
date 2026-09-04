import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'

/**
 * A fully wired app against an in-memory database. Every test gets its own, so
 * they neither share state nor need cleanup — and none of them can leave a
 * stray `.sqlite` behind in the workspace.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: 'http://localhost:5174',
  })
  return buildApp(config)
}
