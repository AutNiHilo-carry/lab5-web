/* 路由表，统一挂在 /api 下
 * 返回 { ok:true, data } 或 { ok:false, code, message }
 */

import express from 'express'
import { wrap, AppError } from './lib/errors.js'
import { cnOf } from './lib/schema.js'
import * as metaSvc from './services/meta.js'
import * as orderSvc from './services/order.js'
import * as reportSvc from './services/report.js'
import * as stockSvc from './services/stock.js'
import * as authSvc from './services/auth.js'

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data })

export function createRoutes(repo) {
  const r = express.Router()

  // 登录

  r.post('/login', wrap(async (req, res) => {
    ok(res, await authSvc.login(repo, req.body || {}))
  }))

  // 除登录与健康检查外，一律要求有效登录凭证（读接口也不例外）
  const PUBLIC_PATHS = ['/login', '/health']
  r.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next()
    if (PUBLIC_PATHS.includes(req.path)) return next()
    return authSvc.requireAuth(req, res, next)
  })

  /* 页面权限：按模块拦截（系统管理员 R01 全部放行） */
  const PERM_EXEMPT = ['/switch-user', '/logout', '/me', '/meta', '/health', '/login']
  const TABLE_PERM = {
    factory: 'base/factory', workshop: 'base/factory', department: 'base/factory',
    partner: 'base/partner', warehouse: 'base/warehouse',
    role: 'base/user', sys_user: 'base/user',
    equipment: 'base/equipment', workstation: 'base/workstation', tooling: 'base/tooling',
    unit: 'base/unit', item: 'base/item',
    bom: 'tech/bom', bom_detail: 'tech/bom',
    routing: 'tech/routing', routing_detail: 'tech/routing'
  }
  const pagePermOf = (req) => {
    const p = req.path
    if (p.indexOf('/stock/flow') === 0) return 'wms/flow'
    if (p.indexOf('/stock') === 0) return 'wms/stock'
    if (p.indexOf('/docs') === 0) return 'wms/doc'
    if (p.indexOf('/orders') === 0) return 'prod/order'
    if (p.indexOf('/tasks') === 0) return 'prod/task'
    if (p.indexOf('/reports') === 0) return 'prod/report'
    if (p.indexOf('/table/') === 0) return TABLE_PERM[p.split('/')[2]] || null
    return null
  }
  const roleOf = async (req) => {
    const user = await repo.get('sys_user', req.auth.userId)
    return user ? repo.get('role', user.role_id) : null
  }
  const permsOfRole = (role) => {
    if (!role) return []
    if (role.code === 'R01') return ['*']
    if (Array.isArray(role.perms)) return role.perms
    try {
      const arr = JSON.parse(role.perms || '[]')
      return Array.isArray(arr) ? arr : []
    } catch (e) { return [] }
  }

  r.use(async (req, res, next) => {
    try {
      if (PERM_EXEMPT.includes(req.path)) return next()
      const perm = pagePermOf(req)
      if (!perm) return next()
      const role = await roleOf(req)
      const perms = permsOfRole(role)
      if (perms.indexOf('*') >= 0 || perms.indexOf(perm) >= 0) return next()
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '没有该模块的权限：' + perm })
    } catch (e) { next(e) }
  })

  /* 角色权限只有系统管理员能配置 */
  r.use(async (req, res, next) => {
    try {
      if (req.method === 'GET') return next()
      if (!/^\/table\/role(\/|$)/.test(req.path)) return next()
      const role = await roleOf(req)
      if (role && role.code === 'R01') return next()
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: '只有系统管理员可以配置角色权限' })
    } catch (e) { next(e) }
  })

  /* 演示用：已登录者切换操作人，换发该用户的凭证 */
  r.post('/switch-user', wrap(async (req, res) => {
    ok(res, await authSvc.switchUser(repo, (req.body || {}).userId))
  }))

  /** 建单/建单据类接口：请求体没带 creatorId 时用当前登录人兜底（creator_id 非空） */
  const withCreator = (req) => {
    const body = Object.assign({}, req.body || {})
    if (!body.creatorId && req.auth) body.creatorId = req.auth.userId
    return body
  }

  r.post('/logout', wrap(async (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    authSvc.logout(token)
    ok(res, { ok: true })
  }))

  r.get('/me', wrap(async (req, res) => {
    const u = authSvc.authUser(req)
    if (!u) throw new AppError('未登录', 401, 'UNAUTHORIZED')
    ok(res, u)
  }))

  // 基础资料

  r.get('/meta', wrap(async (req, res) => {
    ok(res, await metaSvc.loadMeta(repo))
  }))

  /* 通用 CRUD：/api/table/:table 与 /api/table/:table/:id */
  r.get('/table/:table', wrap(async (req, res) => {
    const { keyword, field, value, limit } = req.query
    ok(res, await metaSvc.listRows(repo, req.params.table, { keyword, field, value, limit }))
  }))

  r.get('/table/:table/:id', wrap(async (req, res) => {
    ok(res, await metaSvc.getRow(repo, req.params.table, req.params.id))
  }))

  r.post('/table/:table', wrap(async (req, res) => {
    ok(res, await metaSvc.createRow(repo, req.params.table, req.body || {}), 201)
  }))

  r.put('/table/:table/:id', wrap(async (req, res) => {
    ok(res, await metaSvc.updateRow(repo, req.params.table, req.params.id, req.body || {}))
  }))

  r.delete('/table/:table/:id', wrap(async (req, res) => {
    ok(res, await metaSvc.removeRow(repo, req.params.table, req.params.id))
  }))

  // 工单

  r.get('/orders', wrap(async (req, res) => {
    ok(res, await repo.orderList())
  }))

  r.post('/orders', wrap(async (req, res) => {
    ok(res, await orderSvc.createOrder(repo, withCreator(req)), 201)
  }))

  r.get('/orders/:id', wrap(async (req, res) => {
    ok(res, await orderSvc.getOrderDetail(repo, req.params.id))
  }))

  r.put('/orders/:id', wrap(async (req, res) => {
    ok(res, await orderSvc.saveOrder(repo, req.params.id, req.body || {}))
  }))

  r.post('/orders/:id/audit', wrap(async (req, res) => {
    ok(res, await orderSvc.auditOrder(repo, req.params.id))
  }))

  r.post('/orders/:id/close', wrap(async (req, res) => {
    ok(res, await orderSvc.closeOrder(repo, req.params.id, req.body || {}))
  }))

  r.delete('/orders/:id', wrap(async (req, res) => {
    ok(res, await orderSvc.deleteOrder(repo, req.params.id))
  }))

  r.get('/orders/:id/materials', wrap(async (req, res) => {
    ok(res, await repo.materialStatus(req.params.id))
  }))

  r.get('/orders/:id/tasks', wrap(async (req, res) => {
    const orderId = Number(req.params.id)
    const rows = await repo.taskProgress(req.params.id)
    /* taskProgress 是展示视图（主键叫 taskId），补上 id/orderId，派工与报工都按 id 调用 */
    ok(res, rows.map((t) => Object.assign({}, t, { id: t.id !== undefined ? t.id : t.taskId, orderId })))
  }))

  r.post('/orders/:id/inbound-doc', wrap(async (req, res) => {
    ok(res, await stockSvc.createInboundDocForOrder(repo, req.params.id, withCreator(req)), 201)
  }))

  // 工序

  r.get('/tasks', wrap(async (req, res) => {
    const { orderId, ownerId, status } = req.query
    ok(res, await reportSvc.listTasks(repo, { orderId, ownerId, status }))
  }))

  r.post('/tasks/:id/assign', wrap(async (req, res) => {
    ok(res, await orderSvc.assignTask(repo, req.params.id, req.body || {}))
  }))

  r.get('/tasks/:id/available', wrap(async (req, res) => {
    const task = await repo.get('order_task', req.params.id)
    if (!task) throw new AppError('工序任务不存在', 404, 'NOT_FOUND')
    ok(res, {
      taskId: task.id,
      available: await reportSvc.taskAvailable(repo, task),
      prevQualified: await reportSvc.prevQualified(repo, task)
    })
  }))

  // 报工

  r.get('/reports', wrap(async (req, res) => {
    const { orderId, taskId, limit } = req.query
    ok(res, await reportSvc.listReports(repo, { orderId, taskId, limit }))
  }))

  r.post('/reports', wrap(async (req, res) => {
    ok(res, await reportSvc.addReport(repo, req.body || {}), 201)
  }))

  r.delete('/reports/:id', wrap(async (req, res) => {
    ok(res, await reportSvc.removeReport(repo, req.params.id))
  }))

  // 单据

  r.get('/docs', wrap(async (req, res) => {
    const { docType, status, warehouseId } = req.query
    ok(res, await stockSvc.listDocs(repo, { docType, status, warehouseId }))
  }))

  r.post('/docs', wrap(async (req, res) => {
    ok(res, await stockSvc.createDoc(repo, withCreator(req)), 201)
  }))

  r.get('/docs/:id', wrap(async (req, res) => {
    ok(res, await stockSvc.getDocDetail(repo, req.params.id))
  }))

  r.put('/docs/:id', wrap(async (req, res) => {
    ok(res, await stockSvc.updateDoc(repo, req.params.id, req.body || {}))
  }))

  r.delete('/docs/:id', wrap(async (req, res) => {
    ok(res, await stockSvc.deleteDoc(repo, req.params.id))
  }))

  r.post('/docs/:id/confirm', wrap(async (req, res) => {
    ok(res, await stockSvc.confirmDoc(repo, req.params.id))
  }))

  // 库存

  r.get('/stock', wrap(async (req, res) => {
    const { warehouseId, keyword } = req.query
    const rows = await stockSvc.listStock(repo, { warehouseId, keyword })
    ok(res, {
      rows,
      totals: rows.reduce((s, x) => {
        s.inQty += x.inQty; s.outQty += x.outQty; s.qty += x.qty
        return s
      }, { inQty: 0, outQty: 0, qty: 0 }),
      warnCount: rows.filter((x) => x.warnFlag === '预警').length
    })
  }))

  r.get('/stock/flow', wrap(async (req, res) => {
    ok(res, await repo.flowList(Number(req.query.limit || 200)))
  }))

  // 字典/元数据

  r.get('/dict', wrap(async (req, res) => {
    ok(res, {
      tableNames: (await import('./lib/schema.js')).TABLE_NAMES,
      docTypes: stockSvc.DOC_TYPES,
      inTypes: stockSvc.IN_TYPES,
      outTypes: stockSvc.OUT_TYPES,
      labels: (await import('./lib/schema.js')).TABLE_NAMES
        .reduce((m, t) => { m[t] = cnOf(t); return m }, {})
    })
  }))

  r.get('/health', wrap(async (req, res) => {
    ok(res, { ok: true, repo: repo.kind, time: new Date().toISOString() })
  }))

  return r
}

