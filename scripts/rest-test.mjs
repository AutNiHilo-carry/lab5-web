/* 前后端联调：真 HTTP + app/21-api-rest.js
 * 先把后端起来，再 node scripts/rest-test.mjs http://127.0.0.1:3000
 */

import fs from 'node:fs'
import vm from 'node:vm'

const base = process.argv[2] || 'http://127.0.0.1:3001'
const realFetch = globalThis.fetch

let step = 0
let bad = 0
const ok = (label, cond, extra = '') => {
  step++
  if (!cond) bad++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${extra ? '  → ' + extra : ''}`)
}

// 最小浏览器环境
const ctx = vm.createContext({
  console, Date, Math, String, Number, Object, Array, JSON, Boolean, Error, Promise,
  setTimeout, clearTimeout, fetch: realFetch,
  URLSearchParams,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] === undefined ? null : this._d[k] },
    setItem(k, v) { this._d[k] = String(v) },
    removeItem(k) { delete this._d[k] }
  }
})
ctx.window = ctx
ctx.location = { search: '?api=' + base }
vm.runInContext('window.MES={}; var Vue={ reactive: function(o){return o} };', ctx, { filename: 'stub.js' })

for (const f of ['app/00-core.js', 'app/10-db.js', 'app/20-api.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f })
}

/* 25-session 依赖较少的简化：直接给 session 对象 */
vm.runInContext('MES.session = { user: null }; MES.msg = function(){}; MES.err = function(e){ throw e };', ctx, {})

/* 载入 REST 适配层（会自动检测 ?api= 并接管 MES.api） */
vm.runInContext(fs.readFileSync('app/21-api-rest.js', 'utf8'), ctx, { filename: 'app/21-api-rest.js' })

const MES = ctx.MES
const api = MES.api
const db = MES.db
const state = db.state

// 写接口需要后端登录凭证。
await api.login('admin', '123456')

/* 等待自动同步完成 */
await MES.rest.reload()
ok('REST 适配层已启用', MES.rest.enabled && MES.rest.active, MES.rest.base)

// 数据同步
ok('基础资料已从后端同步', state.department.length === 5 && state.partner.length === 5,
  `${state.department.length} 部门 / ${state.partner.length} 供应商客户`)
ok('工艺路线同步且不绑产品', state.routing.length === 3 && state.routing.every((r) => r.itemId === undefined),
  state.routing.map((r) => r.no).join(','))
ok('BOM 携带工艺路线', state.bom.every((b) => !!b.routingId))
ok('工单带名称与负责工厂', state.workOrder.length > 0 && state.workOrder.every((o) => o.name && o.factoryId),
  state.workOrder.map((o) => o.name).join(' / '))

// 库存 +/− 汇总
const rows = api.stockRows()
ok('库存按 +/− 汇总', rows.length > 0 && rows.every((r) => Math.abs(r.qty - (r.inQty - r.outQty)) < 1e-6),
  `${rows.length} 行`)
const rm1 = rows.find((r) => r.itemCode === 'RM-001')
ok('单行示例正确', rm1.inQty >= rm1.outQty, `RM-001: +${rm1.inQty} − ${rm1.outQty} = ${rm1.qty}`)

// 新建工单（带名称 + 工厂）
const order = await api.createOrder({
  name: 'REST 联调 X4 工单', itemId: 1, planQty: 6, factoryId: 1, workshopId: 2,
  priority: '高', creatorId: 2
})
ok('建单成功（名称+编号+工厂）', !!order.no && order.name === 'REST 联调 X4 工单' && order.factoryId === 1,
  order.no)

let auditErr = ''
try { await api.auditOrder(order.id) } catch (e) { auditErr = e.message }

if (auditErr) {
  /* 若后端是内存模式的干净库，第一次下达应成功 */
  ok('审核下达', false, auditErr)
} else {
  const tasks = state.orderTask.filter((t) => t.orderId === order.id)
  ok('审核下达生成工序任务', tasks.length === 6, tasks.length + ' 道')
  ok('下达用的是 BOM 指定路线', tasks.map((t) => t.processName).join(',') ===
    '备料下料,机架装配,电气安装,整机调试,整机检测,包装入库',
    tasks[0].processName + '…')
}

// 报工前置：先补齐物料并领齐（物料齐套校验）
{
  const mats = state.orderMaterial.filter((m) => m.orderId === order.id)
  const shortLines = mats
    .map((m) => ({ itemId: m.itemId, qty: Number(m.reqQty) - Number(m.pickedQty) + Number(m.returnedQty) }))
    .filter((l) => l.qty > 0)
  if (shortLines.length) {
    const buy = await api.createDoc({ docType: '采购入库', warehouseId: 1, partnerId: 1, lines: shortLines, creatorId: 6, remark: 'REST 补料' })
    await api.confirmDoc(buy.id)
    const pick = await api.createDoc({ docType: '生产领料', warehouseId: 1, orderId: order.id, lines: shortLines, creatorId: 6, remark: 'REST 齐套领料' })
    await api.confirmDoc(pick.id)
  }
}

// 派工 + 报工
const myTasks = state.orderTask
  .filter((t) => t.orderId === order.id)
  .sort((a, b) => a.seq - b.seq)

if (myTasks.length) {
  await api.assignTask(myTasks[0].id, { ownerId: 3, equipmentId: 1, workstationId: 1 })
  const fresh = state.orderTask.find((t) => t.id === myTasks[0].id)
  ok('派工成功', fresh.ownerId === 3, '负责人 ' + fresh.ownerId)

  const avail = await api.taskAvailable(myTasks[0].id)
  ok('可报工数量 = 计划数量', avail === 6, String(avail))

  await api.addReport({ taskId: myTasks[0].id, qualQty: 6, scrapQty: 0, reporterId: 3 })
  const after = state.orderTask.find((t) => t.id === myTasks[0].id)
  ok('报工后累计合格 6', after.equipDoneQty === 6, String(after.equipDoneQty))

  let overErr = ''
  try {
    await api.addReport({ taskId: myTasks[1].id, qualQty: 7, scrapQty: 0, reporterId: 3 })
  } catch (e) { overErr = e.message }
  ok('超上道合格数被拒绝', !!overErr, overErr)
}

// 单据：草稿不动库存 → 确认后 −
const before = api.stockRows().find((r) => r.itemCode === 'RM-001')
const doc = await api.createDoc({
  docType: '生产领料', warehouseId: 1, orderId: order.id,
  lines: [{ itemId: 4, qty: 24 }], creatorId: 6, remark: 'REST 联调领料'
})
ok('建领料单（草稿）', doc.status === '草稿', doc.no)
const mid = api.stockRows().find((r) => r.itemCode === 'RM-001')
ok('草稿不动库存', mid.qty === before.qty, `${before.qty} → ${mid.qty}`)

await api.confirmDoc(doc.id)
const after2 = api.stockRows().find((r) => r.itemCode === 'RM-001')
ok('确认后库存减少 24', Math.abs(after2.qty - (before.qty - 24)) < 1e-6, `${before.qty} → ${after2.qty}`)
ok('出库合计 +24', Math.abs(after2.outQty - (before.outQty + 24)) < 1e-6, `−${after2.outQty}`)

// 手工改库存被拒绝
let manualErr = ''
try { await api.updateRow('stockBalance', 1, { qty: 9999 }) } catch (e) { manualErr = e.message }
ok('禁止手工改库存', !!manualErr, manualErr)

// 模拟重新加载适配层，验证刷新后恢复凭证并能继续写入。
vm.runInContext(fs.readFileSync('app/21-api-rest.js', 'utf8'), ctx, { filename: 'app/21-api-rest.js' })
await MES.rest.reload()
const afterRefresh = await MES.api.createRow('department', {
  code: 'REST-SESSION', name: '会话测试部门', factoryId: 1
})
ok('刷新后恢复登录凭证，可继续写入', !!afterRefresh.id)
await MES.api.removeRow('department', afterRefresh.id)

const tokenKey = Object.keys(ctx.localStorage._d).find((k) => k.includes(':token:'))
const savedToken = ctx.localStorage.getItem(tokenKey)
await MES.rest.logout()
ok('退出后清除本地凭证', savedToken && ctx.localStorage.getItem(tokenKey) === null)
const revoked = await realFetch(base + '/api/table/department', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + savedToken },
  body: JSON.stringify({ code: 'REVOKED', name: '已注销', factoryId: 1 })
})
ok('退出后后端撤销原凭证', revoked.status === 401)

await MES.api.login('admin', '123456')
const staleToken = ctx.localStorage.getItem(tokenKey)
await realFetch(base + '/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + staleToken } })
let expiredStatus
try {
  await MES.api.createRow('department', { code: 'EXPIRED', name: '失效凭证', factoryId: 1 })
} catch (e) { expiredStatus = e.status }
ok('凭证失效后清除缓存并转到登录页', expiredStatus === 401 &&
  ctx.localStorage.getItem(tokenKey) === null && ctx.location.hash === '#/login')

console.log(bad ? `\n失败 ${bad} 项，共 ${step} 项` : `\n全部通过，共 ${step} 项联调检查`)
if (bad) process.exitCode = 1
