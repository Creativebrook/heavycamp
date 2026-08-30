import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

let cached: any = null

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured')
  if (!cached) cached = drizzle(neon(url), { schema })
  return cached
}
