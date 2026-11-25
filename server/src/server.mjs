/* 入口：默认连 MySQL，连不上或 USE_MEMORY=true 就走内存仓库
 */

import { createApp } from './app.js'
import { config } from './config.js'
import { createMemoryRepo } from './repositories/memory.js'
import { buildSeed } from './seed.js'

async function buildRepo() {
  if (config.useMemory) {
    console.log('· USE_MEMORY=true，使用内存仓库（数据不落库）')
    return createMemoryRepo(buildSeed())
  }
  try {
    const { createMysqlRepo, createPool } = await import('./repositories/mysql.js')
    const pool = createPool(config.db)
    await pool.query('SELECT 1')
    console.log(`· 已连接 MySQL ${config.db.host}:${config.db.port}/${config.db.database}`)
    return createMysqlRepo(pool)
  } catch (e) {
    console.warn('· 连接 MySQL 失败：' + (e && e.message))
    console.warn('· 退回内存仓库（如需持久化，请先执行 db/01~04 脚本并配置 server/.env）')
    return createMemoryRepo(buildSeed())
  }
}

async function main() {
  const repo = await buildRepo()
  const app = createApp({ repo })

  app.listen(config.port, config.host, () => {
    console.log('')
    console.log('  Lab5 MES 后端已启动')
    console.log(`  接口地址：http://${config.host}:${config.port}/api`)
    console.log(`  健康检查：http://${config.host}:${config.port}/api/health`)
    console.log(`  数据来源：${repo.kind === 'mysql' ? 'MySQL' : '内存（演示）'}`)
    console.log('  按 Ctrl+C 停止')
    console.log('')
  })
}

main().catch((e) => {
  console.error('启动失败：', e)
  process.exit(1)
})
