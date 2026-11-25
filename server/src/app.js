/* Express 装配：注入仓库、开跨域、统一错误处理
 */

import express from 'express'
import { createRoutes } from './routes.js'
import { AppError } from './lib/errors.js'

export function createApp({ repo, logger = console } = {}) {
  if (!repo) throw new Error('createApp 需要传入 repo')

  const app = express()
  app.use(express.json({ limit: '2mb' }))

  /* 跨域：前端可能以 file:// 或另一端口打开 */
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  /* 简易访问日志 */
  app.use((req, res, next) => {
    const t0 = Date.now()
    res.on('finish', () => {
      if (logger && logger.debug) {
        logger.debug(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - t0}ms)`)
      }
    })
    next()
  })

  app.use('/api', createRoutes(repo))

  /* 静态托管前端（可选：把 lab5-web 目录整体当站点） */
  app.get('/', (req, res) => {
    res.json({ ok: true, name: 'Lab5 MES API', docs: '/api/health', frontend: 'http://127.0.0.1:5173' })
  })

  /* 404 */
  app.use((req, res) => {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: `接口不存在：${req.method} ${req.originalUrl}` })
  })

  /* 统一错误处理 */
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)
    if (err instanceof AppError) {
      return res.status(err.status).json({ ok: false, code: err.code, message: err.message })
    }
    /* MySQL 常见错误转成可读提示 */
    const code = err && err.code
    if (code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, code: 'CONFLICT', message: '数据重复：编号已存在' })
    }
    if (code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ ok: false, code: 'CONFLICT', message: '关联数据不存在或仍被引用' })
    }
    if (logger && logger.error) logger.error(err)
    res.status(500).json({
      ok: false,
      code: 'SERVER_ERROR',
      message: (err && err.message) || '服务器内部错误'
    })
  })

  return app
}
