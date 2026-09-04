import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { z } from 'zod'

/**
 * Environment parsing.
 *
 * Validated once, at import, and thrown on failure. A server that boots with a
 * missing or malformed variable and only discovers it on the first request is a
 * server that fails in production at the worst possible moment.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
/** `src/` in dev, `dist/` after a build — the workspace root is one level up from either. */
export const APP_ROOT = path.resolve(here, '..')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5175),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_PATH: z.string().min(1).default('./data/sonara.sqlite'),
  CORS_ORIGINS: z.string().default('http://localhost:5174,http://127.0.0.1:5174'),
  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type Config = {
  env: 'development' | 'test' | 'production'
  isProduction: boolean
  port: number
  host: string
  databasePath: string
  corsOrigins: string[]
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL']
  version: string
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  const env = parsed.data

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    host: env.HOST,
    databasePath:
      env.DATABASE_PATH === ':memory:' ? ':memory:' : path.resolve(APP_ROOT, env.DATABASE_PATH),
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    logLevel: env.LOG_LEVEL,
    version: process.env.npm_package_version ?? '0.1.0',
  }
}
