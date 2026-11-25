/* 配置：环境变量优先，其次读 server/.env
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(here, '..', '.env')

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  text.split('\n').forEach((line) => {
    const s = line.trim()
    if (!s || s.startsWith('#')) return
    const i = s.indexOf('=')
    if (i < 0) return
    const k = s.slice(0, i).trim()
    const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  })
}

loadEnvFile()

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  /* 没配数据库就用内存仓库，没装 MySQL 也能跑 */
  useMemory: String(process.env.USE_MEMORY || '').toLowerCase() === 'true',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lab5_mes',
    connectionLimit: Number(process.env.DB_POOL || 10)
  }
}

export default config
