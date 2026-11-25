// 数据层校验：新表、新字段、库存无初值、BOM→工艺路线
import fs from 'node:fs'
import vm from 'node:vm'

const ctx = vm.createContext({ console, Date, Math, String, Number, Object, Array, JSON,
  setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} } })
vm.runInContext('var window={MES:{}}; var Vue={ reactive: function(o){return o} };', ctx, { filename: 'stub.js' })
for (const f of ['app/00-core.js', 'app/10-db.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f })
}

const MES = ctx.window.MES
MES.db.reset()
const s = MES.db.state

let step = 0
let bad = 0
const ok = (label, cond, extra = '') => {
  step++
  if (!cond) bad++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${extra ? '  → ' + extra : ''}`)
}

ok('部门表存在且有数据', s.department.length === 5, s.department.map((d) => d.code).join(','))
ok('部门有编号且挂在工厂下', s.department.every((d) => d.code && d.factoryId === 1))
ok('供应商客户单表', s.partner.length === 5,
  s.partner.map((p) => p.partnerType).join(','))
ok('供应商与客户两类都有',
  s.partner.some((p) => p.partnerType === '供应商') && s.partner.some((p) => p.partnerType === '客户'))
ok('用户可归属部门', s.user.some((u) => u.departmentId === 1))

ok('工艺路线不绑定产品', s.routing.every((r) => r.itemId === undefined),
  s.routing.map((r) => r.no).join(','))
ok('工艺路线有名称', s.routing.every((r) => !!r.name))
ok('BOM 指定工艺路线', s.bom.every((b) => !!b.routingId),
  s.bom.map((b) => `${b.no}→routing#${b.routingId}`).join(' '))
ok('BOM 的 routingId 都指向存在的路线',
  s.bom.every((b) => s.routing.some((r) => r.id === b.routingId)))

ok('工单有名称', s.workOrder.every((o) => !!o.name), s.workOrder.map((o) => o.name).join(' / '))
ok('工单有编号', s.workOrder.every((o) => !!o.no))
ok('工单指定负责工厂', s.workOrder.every((o) => !!o.factoryId),
  s.workOrder.map((o) => `#${o.id}:工厂${o.factoryId}`).join(' '))

/* 库存无期初值：所有余额都能由流水累加解释 */
const flowSum = {}
s.stockFlow.forEach((f) => {
  const k = f.warehouseId + ':' + f.itemId
  flowSum[k] = (flowSum[k] || 0) + f.changeQty
})
const mismatch = s.stockBalance.filter((b) => {
  const k = b.warehouseId + ':' + b.itemId
  return Math.abs((flowSum[k] || 0) - b.qty) > 1e-6
})
ok('库存余额 = 流水累加（无期初）', mismatch.length === 0,
  mismatch.length ? mismatch.map((m) => MES.db.itemLabel(m.itemId)).join(',') : '全部一致')
ok('半成品仓不再有期初 8 套', !s.stockBalance.some((b) => b.warehouseId === 3 && b.itemId === 3))
ok('余额表行数 = 有流水的组合数', s.stockBalance.length === Object.keys(flowSum).length,
  `${s.stockBalance.length} 行 / ${Object.keys(flowSum).length} 组合`)

console.log(bad ? `\n失败 ${bad} 项` : `\n全部通过，共 ${step} 项`)
if (bad) process.exitCode = 1
