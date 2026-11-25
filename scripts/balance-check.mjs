/* 用已确认单据反推库存余额，跟数据库里的余额对一遍
 * 没有期初值，余额全靠单据累加，这个脚本就是在验这件事
 */

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

/* 没有任何期初库存：一切从 0 开始，只累加已确认单据 */
const calc = {}

s.stockDoc.filter((d) => d.status === '已确认').forEach((doc) => {
  const inbound = ['采购入库', '生产退料', '成品入库'].indexOf(doc.docType) >= 0
  s.stockDocDetail.filter((l) => l.docId === doc.id).forEach((l) => {
    const k = doc.warehouseId + ':' + l.itemId
    calc[k] = (calc[k] || 0) + (inbound ? l.qty : -l.qty)
  })
})

const rows = Object.entries(calc)
  .filter(([, v]) => Math.abs(v) > 1e-6)
  .map(([k, v]) => {
    const [w, i] = k.split(':').map(Number)
    return { w, i, qty: v }
  })
  .sort((a, b) => a.w - b.w || a.i - b.i)

console.log('-- 应由已确认单据得到的库存余额（无期初值）--')
rows.forEach((r) => {
  console.log(`(${r.w}, ${r.i}, ${r.qty}),   -- ${MES.db.nameOf('warehouse', r.w)} / ${MES.db.itemLabel(r.i)}`)
})

console.log('\n-- 前端余额表核对 --')
const bad = []
s.stockBalance.forEach((b) => {
  const expect = calc[b.warehouseId + ':' + b.itemId] || 0
  if (Math.abs(expect - b.qty) > 1e-6) bad.push({ b, expect })
})
console.log(bad.length
  ? bad.map((x) => `不一致 ${MES.db.itemLabel(x.b.itemId)} 前端=${x.b.qty} 计算=${x.expect}`).join('\n')
  : '全部一致')

/* 反向核对：有流水却没有余额行的组合 */
const missing = rows.filter((r) => !s.stockBalance.some((b) => b.warehouseId === r.w && b.itemId === r.i))
console.log(missing.length
  ? '缺少余额行：' + missing.map((r) => MES.db.itemLabel(r.i)).join(', ')
  : '有流水的组合都已生成余额行')

if (bad.length || missing.length) process.exitCode = 1
