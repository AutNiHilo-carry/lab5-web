/* 走一遍完整流程：建单 → 下达 → 派工 → 报工 → 领料 → 入库 → 完工
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve('.')
const appDir = path.join(root, 'app')

const Vue = {
  reactive: (o) => o,
  ref: (v) => ({ value: v }),
  computed: (fn) => ({ get value() { return fn() } }),
  watch: () => {},
  onMounted: () => {},
  createApp: () => ({ component() {}, use() {}, mount() {}, config: { globalProperties: {}, warnHandler: null } }),
  h: () => ({})
}
const VueRouter = {
  createRouter: () => ({ beforeEach() {}, push() {} }),
  createWebHashHistory: () => ({}),
  useRoute: () => ({ params: {}, path: '/', meta: {} }),
  useRouter: () => ({ push() {} })
}
const ElementPlus = { ElMessage: () => {}, ElMessageBox: { confirm: () => Promise.reject('cancel') }, install() {} }

const sandbox = {
  console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, String, Object, Array,
  Error, isNaN, parseInt, parseFloat,
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null }, setItem(k, v) { this._d[k] = String(v) }, removeItem(k) { delete this._d[k] } },
  Vue, VueRouter, ElementPlus, ElementPlusIconsVue: {}, ElementPlusLocaleZhCn: {}
}
sandbox.window = sandbox
sandbox.globalThis = sandbox
const ctx = vm.createContext(sandbox)

for (const f of fs.readdirSync(appDir).filter((x) => x.endsWith('.js')).sort()) {
  vm.runInContext(fs.readFileSync(path.join(appDir, f), 'utf8'), ctx, { filename: f })
}

const MES = sandbox.MES
const db = MES.db
const api = MES.api
const s = db.state
MES.session.user = s.user.find((u) => u.roleId === 2)

let step = 0
const ok = (label, cond, extra = '') => {
  step++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${extra ? '  → ' + extra : ''}`)
  if (!cond) process.exitCode = 1
}

/* 1. 建单 */
const fg1 = s.item.find((i) => i.code === 'FG-001')
const order = await api.createOrder({
  name: '流程测试 X4 工单', itemId: fg1.id, planQty: 12, factoryId: 1, workshopId: 2,
  planStart: MES.dateAgo(-1), planEnd: MES.dateAgo(-6), priority: '高',
  remark: '端到端流程测试', creatorId: MES.session.user.id
})
ok('创建工单（草稿）', order.status === '草稿', order.no)
ok('工单带名称与负责工厂', order.name === '流程测试 X4 工单' && order.factoryId === 1,
  `${order.name} @ 工厂${order.factoryId}`)

/* 2. 审核下达 */
await api.auditOrder(order.id)
const mats = s.orderMaterial.filter((m) => m.orderId === order.id)
const tasks = s.orderTask.filter((t) => t.orderId === order.id).sort((a, b) => a.seq - b.seq)
ok('审核下达', order.status === '已下达' && tasks.length === 6, `${mats.length} 行物料 / ${tasks.length} 道工序`)
ok('BOM 需求按计划数量放大', mats.find((m) => db.byId('item', m.itemId).code === 'RM-001').reqQty === 48,
  '电机 4 × 12 = 48')

/* 3. 领料单 */
const wh1 = s.warehouse.find((w) => w.type === '原料库')
const pickLines = mats.map((m) => ({ itemId: m.itemId, qty: m.reqQty }))
const pickDoc = await api.createDoc({
  docType: '生产领料', warehouseId: wh1.id, orderId: order.id,
  lines: pickLines, remark: '领料', creatorId: 6
})
ok('生成领料单（草稿，库存未变）', pickDoc.status === '草稿' &&
  db.balanceOf(wh1.id, fg1.id) === 0, pickDoc.no)

const before = db.balanceOf(wh1.id, mats[0].itemId)
let pickErr = ''
try { await api.confirmDoc(pickDoc.id) } catch (e) { pickErr = e.message }
ok('飞控库存不足时整单拒绝确认（不允许部分生效）', !!pickErr, pickErr)

/* 先补货：所有欠料物料一次性采购入库，再确认领料 */
const rkLines = mats
  .map((m) => ({
    itemId: m.itemId,
    qty: Math.max(0, m.reqQty - db.balanceOf(wh1.id, m.itemId))
  }))
  .filter((l) => l.qty > 0)
const rk = await api.createDoc({
  docType: '采购入库', warehouseId: wh1.id, lines: rkLines,
  remark: '欠料补货', creatorId: 6
})
await api.confirmDoc(rk.id)
ok('采购入库补齐欠料', true, rk.no + '，' + rkLines.length + ' 种物料')

await api.confirmDoc(pickDoc.id)
const after = db.balanceOf(wh1.id, mats[0].itemId)
ok('确认领料单后库存减少', after === before - mats[0].reqQty, `${before} → ${after}`)
ok('已领用数量回写到工单物料', s.orderMaterial.find((m) => m.id === mats[0].id).pickedQty === mats[0].reqQty)

/* 4. 派工 */
await api.assignTask(tasks[0].id, { equipmentId: 1, workstationId: 1, ownerId: 3, planStart: MES.dateAgo(0), planEnd: MES.dateAgo(-1) })
ok('派工', tasks[0].equipmentId === 1 && tasks[0].status === '进行中')
ok('工单自动转为生产中', order.status === '生产中', order.status)

/* 5. 逐道工序报工：每道按"上道合格数"填报，第二道报废 1 台以便后续核对待入库 */
for (let i = 0; i < tasks.length; i++) {
  const t = tasks[i]
  const input = i === 0 ? order.planQty : tasks[i - 1].equipDoneQty
  const scrap = i === 1 ? 1 : 0
  await api.addReport({ taskId: t.id, qualQty: input - scrap, scrapQty: scrap, reporterId: 3 })
}
ok('全部工序完成报工', tasks.every((t) => t.status === '已完成'),
  tasks.map((t) => `${t.processName}:${t.equipDoneQty}/${t.scrapQty}`).join(' '))

const last = tasks[tasks.length - 1]
ok('报废发生在第二道，末道合格 11', last.equipDoneQty === 11, `合格 ${last.equipDoneQty} / 报废 ${last.scrapQty}`)

/* 6. 成品入库 */
const inDoc = await api.createInboundDocForOrder(order.id, 6)
ok('生成成品入库单（待入库 = 末道合格 - 已入库）',
  s.stockDocDetail.find((l) => l.docId === inDoc.id).qty === 11,
  '数量 ' + s.stockDocDetail.find((l) => l.docId === inDoc.id).qty)

const wh2 = s.warehouse.find((w) => w.type === '成品库')
const fgBefore = db.balanceOf(wh2.id, fg1.id)
await api.confirmDoc(inDoc.id)
ok('确认成品入库，成品仓余额增加', db.balanceOf(wh2.id, fg1.id) === fgBefore + 11,
  `${fgBefore} → ${db.balanceOf(wh2.id, fg1.id)}`)
ok('末道工序待入库清零', +(last.equipDoneQty - last.inboundQty).toFixed(3) === 0)
ok('工单自动完工', order.status === '已完工', order.status)

/* 7. 流水和余额对得上 */
const flowSum = {}
s.stockFlow.forEach((f) => {
  const k = f.warehouseId + ':' + f.itemId
  flowSum[k] = (flowSum[k] || 0) + f.changeQty
})
const OPENING = new Set(['3:3']) // 半成品仓的机架总成（期初库存）
const mismatch = s.stockBalance.filter((b) => {
  const k = b.warehouseId + ':' + b.itemId
  if (OPENING.has(k)) return false
  return Math.abs((flowSum[k] || 0) - b.qty) > 1e-6
})
ok('库存余额 = 流水累加之和', mismatch.length === 0,
  mismatch.length ? mismatch.map((m) => db.nameOf('item', m.itemId) + '=' + m.qty).join(',') : '全部一致')

/* 8. 删除报工回滚 */
const beforeCnt = s.workReport.length
const victim = s.workReport.filter((r) => r.orderId === order.id).pop()
await api.removeReport(victim.id)
ok('删除报工记录会回滚累计', s.workReport.length === beforeCnt - 1)

/* 9. 重置后仍应完整 */
await api.resetDemoData()
ok('重置演示数据', s.workOrder.length === 4 && s.orderTask.length === 15,
  `工单 ${s.workOrder.length} / 工序 ${s.orderTask.length}`)

console.log('\n完成，共 ' + step + ' 项检查')
