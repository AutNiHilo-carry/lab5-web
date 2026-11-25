/* 后端接口自检：内存仓库 + 真 Express，走 HTTP
 * cd server && node test/api-test.mjs
 */

import { createApp } from '../src/app.js'
import { createMemoryRepo } from '../src/repositories/memory.js'
import { buildSeed } from '../src/seed.js'

const repo = createMemoryRepo(buildSeed())
const app = createApp({ repo, logger: null })

let step = 0
let bad = 0
const ok = (label, cond, extra = '') => {
  step++
  if (!cond) bad++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${extra ? '  → ' + extra : ''}`)
}

/* 启动临时端口 */
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s))
})
const base = `http://127.0.0.1:${server.address().port}/api`
let token = ''

async function call(method, path, body, credential = token) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(credential ? { Authorization: 'Bearer ' + credential } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
const get = (p) => call('GET', p)
const post = (p, b) => call('POST', p, b)
const del = (p) => call('DELETE', p)

try {
  // 健康检查与登录
  const health = await get('/health')
  ok('健康检查', health.status === 200 && health.json.data.repo === 'memory', health.json.data.repo)

  const badLogin = await post('/login', { account: 'admin', password: 'wrong' })
  ok('错误口令被拒绝', badLogin.status === 401, badLogin.json.message)

  const login = await post('/login', { account: 'admin', password: '123456' })
  ok('登录成功', login.status === 200 && !!login.json.data.token, login.json.data.user.name)
  token = login.json.data.token

  for (const [method, path, body] of [
    ['POST', '/table/department', { code: 'ANON', name: 'anonymous', factoryId: 1 }],
    ['PUT', '/table/department/1', { name: 'anonymous' }],
    ['DELETE', '/table/department/1'],
    ['POST', '/orders/1/audit'],
    ['POST', '/tasks/1/assign', { ownerId: 3 }],
    ['POST', '/reports', { taskId: 1, qualQty: 1 }],
    ['POST', '/docs/1/confirm']
  ]) {
    const denied = await call(method, path, body, '')
    ok(`未登录拒绝 ${method} ${path}`, denied.status === 401)
  }
  const invalid = await call('POST', '/orders', {}, 'invalid-token')
  ok('无效 token 拒绝写入', invalid.status === 401)

  const users = await get('/table/sys_user')
  const user = await get('/table/sys_user/1')
  ok('用户列表和详情均不下发密码', users.json.data.every((u) => !Object.hasOwn(u, 'password')) &&
    !Object.hasOwn(user.json.data, 'password'))
  const newUser = await post('/table/sys_user', {
    account: 'security_test', name: '测试用户', roleId: 1, password: 'secret', status: '启用'
  })
  ok('新增用户响应不下发密码', newUser.status === 201 && !Object.hasOwn(newUser.json.data, 'password'))
  const updatedUser = await call('PUT', `/table/sys_user/${newUser.json.data.id}`, { password: 'changed' })
  ok('修改用户响应不下发密码', updatedUser.status === 200 && !Object.hasOwn(updatedUser.json.data, 'password'))
  const userLogin = await post('/login', { account: 'security_test', password: 'changed' })
  ok('过滤响应不影响密码保存及登录', userLogin.status === 200)
  await call('POST', '/logout', undefined, userLogin.json.data.token)
  await del(`/table/sys_user/${newUser.json.data.id}`)

  const businessTables = ['work_order', 'order_material', 'order_task', 'work_report', 'stock_doc', 'stock_doc_detail']
  for (const table of businessTables) {
    const before = JSON.stringify(await repo.all(table))
    const row = (await repo.all(table))[0]
    const denied = await Promise.all([
      post(`/table/${table}`, row || {}),
      call('PUT', `/table/${table}/${row?.id || 1}`, { status: '草稿', qty: 9999 }),
      del(`/table/${table}/${row?.id || 1}`)
    ])
    ok(`通用接口禁止增删改 ${table} 且数据未变`, denied.every((r) => r.status === 400) &&
      JSON.stringify(await repo.all(table)) === before)
    ok(`通用接口仍可读取 ${table}`, (await get(`/table/${table}`)).status === 200)
  }

  // 基础资料：部门 / 供应商客户
  const meta = await get('/meta')
  const M = meta.json.data
  ok('元数据一次下发', meta.status === 200 && !!M.factory, Object.keys(M).length + ' 张表')
  ok('部门数据存在且有编号', M.department.length === 5 && M.department.every((d) => d.code),
    M.department.map((d) => d.code).join(','))
  ok('部门与车间平级（都挂工厂）',
    M.department.every((d) => d.factoryId === 1) && M.workshop.every((w) => w.factoryId === 1))
  ok('供应商客户单表两类齐全',
    M.partner.length === 5 && M.partner.some((p) => p.partnerType === '供应商') && M.partner.some((p) => p.partnerType === '客户'))
  ok('用户可归属部门', M.sys_user.some((u) => u.departmentId === 1))
  ok('接口不下发密码', M.sys_user.every((u) => u.password === undefined))

  const newDept = await post('/table/department', { code: 'DP06', name: '设备管理部', factoryId: 1, leader: '周涛' })
  ok('新增部门（带编号）', newDept.status === 201 && newDept.json.data.code === 'DP06', newDept.json.data.code)

  const dupDept = await post('/table/department', { code: 'DP06', name: '重复部门', factoryId: 1 })
  ok('部门编号重复被拒绝', dupDept.status === 409, dupDept.json.message)

  const noCodeDept = await post('/table/department', { name: '没有编号的部门', factoryId: 1 })
  ok('部门缺编号被拒绝', noCodeDept.status === 400, noCodeDept.json.message)

  const newPartner = await post('/table/partner', {
    code: 'SUP-004', name: '苏州蓝天动力有限公司', partnerType: '供应商', contact: '钱进'
  })
  ok('新增供应商', newPartner.status === 201 && newPartner.json.data.partnerType === '供应商')

  const badType = await post('/table/partner', { code: 'SUP-005', name: 'X 公司', partnerType: '代理商' })
  ok('供应商/客户类型非法被拒绝', badType.status === 400, badType.json.message)

  const partners = await get('/table/partner?field=partner_type&value=客户')
  ok('按类型筛选客户', partners.json.data.length === 2, partners.json.data.map((p) => p.code).join(','))

  // 工艺路线不绑产品 / BOM 指定路线
  const rts = await get('/table/routing')
  ok('工艺路线不绑定产品', rts.json.data.every((r) => r.itemId === undefined),
    rts.json.data.map((r) => r.no).join(','))
  ok('工艺路线有名称', rts.json.data.every((r) => !!r.name))

  const boms = await get('/table/bom')
  ok('BOM 指定工艺路线', boms.json.data.every((b) => !!b.routingId),
    boms.json.data.map((b) => `${b.no}→#${b.routingId}`).join(' '))

  const guardDel = await del(`/table/routing/${rts.json.data[0].id}`)
  ok('被 BOM 引用的路线不能删除', guardDel.status === 409, guardDel.json.message)

  // 工单：名称 + 编号 + 负责工厂
  const noName = await post('/orders', { itemId: 1, planQty: 5, factoryId: 1, workshopId: 2 })
  ok('工单缺名称被拒绝', noName.status === 400, noName.json.message)

  const noFactory = await post('/orders', { name: '测试', itemId: 1, planQty: 5, workshopId: 2 })
  ok('工单缺负责工厂被拒绝', noFactory.status === 400, noFactory.json.message)

  const wrongWs = await post('/orders', { name: '测试', itemId: 1, planQty: 5, factoryId: 2, workshopId: 2 })
  ok('工厂与车间不匹配被拒绝', wrongWs.status === 400, wrongWs.json.message)

  const created = await post('/orders', {
    name: 'X4 巡检机增补生产', itemId: 1, planQty: 10, factoryId: 1, workshopId: 2,
    planStart: '2025-10-01', planEnd: '2025-10-08', priority: '高', creatorId: 2
  })
  const order = created.json.data
  ok('创建工单（草稿）', created.status === 201 && order.status === '草稿', order.no)
  ok('工单同时有名称与编号', !!order.name && !!order.no, `${order.no} / ${order.name}`)
  ok('工单记录负责工厂', order.factoryId === 1, '工厂 ' + order.factoryId)

  // 审核下达：BOM → 路线
  const audit = await post(`/orders/${order.id}/audit`)
  ok('审核下达成功', audit.status === 200, `${audit.json.data.materialCount} 行物料 / ${audit.json.data.taskCount} 道工序`)
  ok('下达时经 BOM 取到工艺路线', !!audit.json.data.routing && audit.json.data.routing.no === 'RT-X4-01',
    audit.json.data.routing && audit.json.data.routing.no)
  ok('物料需求按计划数量放大',
    (await get(`/orders/${order.id}/materials`)).json.data.find((m) => m.itemCode === 'RM-001').reqQty === 40,
    '电机 4 × 10 = 40')
  ok('工序任务已生成',
    (await get(`/orders/${order.id}/tasks`)).json.data.length === 6)

  const reAudit = await post(`/orders/${order.id}/audit`)
  ok('重复下达被拒绝', reAudit.status === 409, reAudit.json.message)

  // 库存：+/− 汇总，无初值
  const stock0 = await get('/stock')
  ok('库存接口返回 +/− 汇总', stock0.status === 200 && Array.isArray(stock0.json.data.rows),
    `${stock0.json.data.rows.length} 行`)
  const row0 = stock0.json.data.rows.find((r) => r.itemCode === 'RM-001')
  ok('每行都有入库(+)/出库(−)/结存',
    row0.inQty > 0 && row0.outQty >= 0 && Math.abs(row0.qty - (row0.inQty - row0.outQty)) < 1e-6,
    `${row0.itemCode}: +${row0.inQty} − ${row0.outQty} = ${row0.qty}`)
  ok('结存恒等于入库减出库（全部行）',
    stock0.json.data.rows.every((r) => Math.abs(r.qty - (r.inQty - r.outQty)) < 1e-6))
  ok('总量合计一致',
    Math.abs(stock0.json.data.totals.qty - (stock0.json.data.totals.inQty - stock0.json.data.totals.outQty)) < 1e-6)

  const manual = await call('PUT', `/table/stock_balance/1`, { qty: 9999 })
  ok('禁止手工改库存余额', manual.status === 400, manual.json.message)
  const manualAdd = await post('/table/stock_balance', { warehouseId: 1, itemId: 4, qty: 9999 })
  ok('禁止直接新增库存余额', manualAdd.status === 400, manualAdd.json.message)

  // 领料单：草稿不动库存 → 确认后 −
  const before = (await get('/stock')).json.data.rows.find((r) => r.itemCode === 'RM-001').qty

  const docCreated = await post('/docs', {
    docType: '生产领料', warehouseId: 1, orderId: order.id,
    lines: [{ itemId: 4, qty: 40 }, { itemId: 5, qty: 80 }], creatorId: 6, remark: '测试领料'
  })
  const doc = docCreated.json.data.doc
  ok('生成领料单（草稿）', docCreated.status === 201 && doc.status === '草稿', doc.no)
  ok('草稿不动库存',
    (await get('/stock')).json.data.rows.find((r) => r.itemCode === 'RM-001').qty === before)

  /* 库存不足：整单拒绝（RM-004 飞控只有 10，需要 20） */
  const over = await post('/docs', {
    docType: '生产领料', warehouseId: 1, orderId: order.id,
    lines: [{ itemId: 4, qty: 10 }, { itemId: 7, qty: 20 }], creatorId: 6
  })
  const overId = over.json.data.doc.id
  const overConfirm = await post(`/docs/${overId}/confirm`)
  ok('库存不足整单拒绝（不部分生效）', overConfirm.status === 400, overConfirm.json.message)
  ok('拒绝后库存完全未变',
    (await get('/stock')).json.data.rows.find((r) => r.itemCode === 'RM-001').qty === before,
    `RM-001 = ${before}`)
  const overDoc = await get(`/docs/${overId}`)
  ok('被拒绝的单据仍是草稿', overDoc.json.data.doc.status === '草稿')

  const confirmed = await post(`/docs/${doc.id}/confirm`)
  ok('确认领料单', confirmed.status === 200 && confirmed.json.data.doc.status === '已确认')
  const after = (await get('/stock')).json.data.rows.find((r) => r.itemCode === 'RM-001')
  ok('确认后库存减少（出库 −）', after.qty === before - 40, `${before} → ${after.qty}`)
  ok('出库合计增加', after.outQty >= 40, `出库合计 −${after.outQty}`)

  const reConfirm = await post(`/docs/${doc.id}/confirm`)
  ok('重复确认被拒绝', reConfirm.status === 409, reConfirm.json.message)

  const delConfirmed = await del(`/docs/${doc.id}`)
  ok('已确认单据不能删除', delConfirmed.status === 409, delConfirmed.json.message)

  const docEdit = await call('PUT', `/docs/${doc.id}`, { lines: [{ itemId: 4, qty: 50 }] })
  ok('已确认单据不能修改', docEdit.status === 409, docEdit.json.message)

  /* 流水核对：结存 = 流水累加 */
  const flow = await get('/stock/flow?limit=500')
  const sums = {}
  flow.json.data.forEach((f) => {
    const k = f.warehouseId + ':' + f.itemId
    sums[k] = (sums[k] || 0) + f.changeQty
  })
  const stockRows = (await get('/stock')).json.data.rows
  const mismatch = stockRows.filter((r) => Math.abs((sums[r.warehouseId + ':' + r.itemId] || 0) - r.qty) > 1e-6)
  ok('每行结存 = 该组合流水累加', mismatch.length === 0,
    mismatch.length ? mismatch.map((m) => m.itemCode).join(',') : `${flow.json.data.length} 条流水`)

  /* 报工前必须齐套：把剩余欠料采购进来，再领齐 */
  const matsNow = (await get(`/orders/${order.id}/materials`)).json.data
  const shortLines = matsNow.filter((m) => Number(m.lackQty) > 0)
    .map((m) => ({ itemId: m.itemId, qty: Number(m.lackQty) }))
  if (shortLines.length) {
    const buy = await post('/docs', {
      docType: '采购入库', warehouseId: 1, partnerId: 1, lines: shortLines, creatorId: 6, remark: '测试补料'
    })
    await post(`/docs/${buy.json.data.doc.id}/confirm`)
    const pick = await post('/docs', {
      docType: '生产领料', warehouseId: 1, orderId: order.id, lines: shortLines, creatorId: 6, remark: '测试补齐领料'
    })
    const pickOk = await post(`/docs/${pick.json.data.doc.id}/confirm`)
    ok('补齐领料后满足齐套', pickOk.status === 200, pickOk.json.message)
  }

  // 派工与报工
  const tasks = (await get(`/orders/${order.id}/tasks`)).json.data
  const assign = await post(`/tasks/${tasks[0].taskId}/assign`, { ownerId: 3, equipmentId: 1, workstationId: 1 })
  ok('派工成功', assign.status === 200 && assign.json.data.ownerId === 3, '负责人 ' + assign.json.data.ownerId)
  ok('派工后工单转生产中',
    (await get(`/orders/${order.id}`)).json.data.order.status === '生产中')

  const overReport = await post('/reports', { taskId: tasks[0].taskId, qualQty: 11, scrapQty: 0, reporterId: 3 })
  ok('报工超过上道合格数被拒绝', overReport.status === 400, overReport.json.message)

  const rep1 = await post('/reports', { taskId: tasks[0].taskId, qualQty: 10, scrapQty: 0, reporterId: 3 })
  ok('首道报工 10 台', rep1.status === 201 && rep1.json.data.task.equipDoneQty === 10)

  const noMore = await post('/reports', { taskId: tasks[1].taskId, qualQty: 12, scrapQty: 0, reporterId: 3 })
  ok('下道不能超上道合格数', noMore.status === 400, noMore.json.message)

  const rep2 = await post('/reports', { taskId: tasks[1].taskId, qualQty: 9, scrapQty: 1, reporterId: 3 })
  ok('下道报工 9 合格 1 报废', rep2.status === 201, '累计合格 ' + rep2.json.data.task.equipDoneQty)

  const reports = await get('/reports?limit=50')
  ok('报工记录带工单与工序信息',
    reports.json.data.every((r) => r.orderNo && r.processName && r.reporterName),
    reports.json.data.length + ' 条')

  const undo = await del(`/reports/${rep2.json.data.report.id}`)
  ok('删除报工会回滚累计', undo.status === 200 &&
    (await get(`/orders/${order.id}/tasks`)).json.data[1].equipDoneQty === 0)

  // 成品入库上限
  const inboundEarly = await post(`/orders/${order.id}/inbound-doc`, {})
  ok('末道未产出时不能生成入库单', inboundEarly.status === 400, inboundEarly.json.message)

  // 删除守卫
  const delFactory = await del('/table/factory/1')
  ok('工厂下有车间/部门/仓库时不能删除', delFactory.status === 409, delFactory.json.message)

  const delDraft = await post('/orders', { name: '临时草稿', itemId: 1, planQty: 1, factoryId: 1, workshopId: 2 })
  const delOk = await del(`/orders/${delDraft.json.data.id}`)
  ok('草稿工单可删除', delOk.status === 200)

  const delAudited = await del(`/orders/${order.id}`)
  ok('已下达工单不能删除', delAudited.status === 409, delAudited.json.message)

  /* 已关闭工单不能再领料：单据能建，但确认必须被拒 */
  const closeOrder = await post('/orders', { name: '关闭后领料', itemId: 1, planQty: 2, factoryId: 1, workshopId: 2 })
  await post(`/orders/${closeOrder.json.data.id}/audit`)
  await post(`/orders/${closeOrder.json.data.id}/close`)
  const closedPick = await post('/docs', {
    docType: '生产领料', warehouseId: 1, orderId: closeOrder.json.data.id,
    lines: [{ itemId: 4, qty: 1 }], creatorId: 6
  })
  const closedConfirm = await post(`/docs/${closedPick.json.data.doc.id}/confirm`)
  ok('已关闭工单不能领料（确认被拒）', closedConfirm.status === 400, closedConfirm.json.message)

  /* 角色页面权限：仓管员只能访问库存相关模块，且不能改角色权限 */
  const whLogin = await post('/login', { account: 'warehouse', password: '123456' })
  ok('仓管员登录且返回页面权限', whLogin.status === 200 && Array.isArray(whLogin.json.data.user.perms),
    (whLogin.json.data.user.perms || []).join(','))
  const whToken = whLogin.json.data.token
  const whDocs = await call('GET', '/docs', undefined, whToken)
  ok('仓管员可看库存单据', whDocs.status === 200, whDocs.json.message)
  const whOrders = await call('GET', '/orders', undefined, whToken)
  ok('仓管员不能看生产工单', whOrders.status === 403, whOrders.json.message)
  const whEditRole = await call('PUT', '/table/role/4', { perms: '[]' }, whToken)
  ok('非管理员不能配置角色权限', whEditRole.status === 403, whEditRole.json.message)

  const adm = await post('/login', { account: 'admin', password: '123456' })
  const admToken = adm.json.data.token
  const admRole = await post('/login', { account: 'admin', password: '123456' })
  const originalRole = (await call('GET', '/table/role', undefined, admRole.json.data.token)).json.data.find((x) => x.code === 'R04')
  const saveRole = await call('PUT', `/table/role/${originalRole.id}`, { perms: '["dashboard"]' }, admToken)
  ok('管理员可以配置角色权限', saveRole.status === 200, saveRole.json.message)
  const afterSave = await call('GET', '/table/role', undefined, admToken)
  ok('权限保存后立即可读', JSON.parse(afterSave.json.data.find((x) => x.code === 'R04').perms)[0] === 'dashboard')

  const logout = await post('/logout')
  ok('退出登录成功', logout.status === 200)
  const afterLogout = await post('/table/department', { code: 'LOGOUT', name: 'logout', factoryId: 1 })
  ok('退出后原 token 无法写入', afterLogout.status === 401)
} finally {
  server.close()
}

console.log(bad ? `\n失败 ${bad} 项，共 ${step} 项` : `\n全部通过，共 ${step} 项接口检查`)
if (bad) process.exitCode = 1
