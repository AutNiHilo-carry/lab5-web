/* 没浏览器时试跑：拿桩顶上 Vue，把 app/*.js 全加载一遍看会不会报错
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve('.')
const appDir = path.join(root, 'app')

// 最小 Vue 桩
function reactive(obj) {
  return new Proxy(obj, {
    get(t, k) { return t[k] },
    set(t, k, v) { t[k] = v; return true }
  })
}

const Vue = {
  reactive,
  ref: (v) => ({ value: v }),
  computed: (fn) => ({ get value() { return fn() } }),
  watch: () => {},
  onMounted: () => {},
  createApp: () => ({
    component() {}, use() {}, mount() {},
    config: { globalProperties: {}, warnHandler: null }
  }),
  h: () => ({})
}

const VueRouter = {
  createRouter: () => ({ beforeEach() {}, push() {} }),
  createWebHashHistory: () => ({}),
  useRoute: () => ({ params: {}, path: '/', meta: {} }),
  useRouter: () => ({ push() {} })
}

const store = {}
const ElementPlus = {
  ElMessage: (o) => store.lastMessage = o,
  ElMessageBox: { confirm: () => Promise.reject('cancel') },
  install() {}
}
const ElementPlusIconsVue = { DataBoard: {}, Plus: {}, Search: {} }

// 构造沙箱
const sandbox = {
  console,
  setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, String, Object, Array, Error, isNaN, parseInt, parseFloat,
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null },
    setItem(k, v) { this._d[k] = String(v) },
    removeItem(k) { delete this._d[k] }
  },
  window: {},
  Vue, VueRouter, ElementPlus, ElementPlusIconsVue,
  ElementPlusLocaleZhCn: {}
}
sandbox.window = sandbox
sandbox.globalThis = sandbox

const ctx = vm.createContext(sandbox)

const files = fs.readdirSync(appDir).filter((f) => f.endsWith('.js')).sort()
for (const f of files) {
  const code = fs.readFileSync(path.join(appDir, f), 'utf8')
  try {
    vm.runInContext(code, ctx, { filename: f })
    console.log(`执行 OK   ${f}`)
  } catch (e) {
    console.log(`执行 FAIL ${f}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`)
    process.exitCode = 1
  }
}

// 业务校验
const MES = sandbox.MES
const db = MES.db
const api = MES.api
const s = db.state

const log = (label, ok, extra = '') =>
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)

console.log('\n===== 演示数据 =====')
log('工厂', s.factory.length === 2, s.factory.length)
log('车间', s.workshop.length === 3)
log('仓库', s.warehouse.length === 3)
log('用户', s.user.length === 6)
log('物料', s.item.length === 13)
log('BOM 明细', s.bomDetail.length === 23)
log('工序任务', s.orderTask.length > 0, s.orderTask.length)
log('库存余额', s.stockBalance.length > 0, s.stockBalance.length)
log('库存流水', s.stockFlow.length > 0, s.stockFlow.length)

console.log('\n===== 工单下达：BOM 需求 =====')
const draft = s.workOrder.find((o) => o.status === '草稿')
console.log('草稿工单', draft.no, '产品', db.itemLabel(draft.itemId), '数量', draft.planQty)

await api.auditOrder(draft.id)
const mats = s.orderMaterial.filter((m) => m.orderId === draft.id)
const motor = mats.find((m) => db.byId('item', m.itemId).code === 'RM-001')
log('审核后状态', draft.status === '已下达', draft.status)
log('生成物料需求', mats.length === 10, mats.length + ' 行')
log('电机需求 = 6 × 10 = 60', motor && motor.reqQty === 60, motor && motor.reqQty)
const tasks = s.orderTask.filter((t) => t.orderId === draft.id)
log('生成工序任务', tasks.length === 6, tasks.length + ' 道')

console.log('\n===== 报工规则 =====')
const t1 = tasks[0]
let err1 = ''
try { await api.addReport({ taskId: t1.id, qualQty: 99, scrapQty: 0, reporterId: 3 }) } catch (e) { err1 = e.message }
log('报工超量被拦截', !!err1, err1)
await api.addReport({ taskId: t1.id, qualQty: 8, scrapQty: 1, reporterId: 3 })
log('首道报工 8 合格 1 报废', t1.equipDoneQty === 8 && t1.scrapQty === 1, `${t1.equipDoneQty}/${t1.scrapQty}`)
const t2 = tasks[1]
let err2 = ''
try { await api.addReport({ taskId: t2.id, qualQty: 9, scrapQty: 0, reporterId: 3 }) } catch (e) { err2 = e.message }
log('第二道不能超过前道合格 8', !!err2, err2)

console.log('\n===== 仓储规则 =====')
const wh1 = s.warehouse.find((w) => w.code === 'WH01').id
const docDraft = s.stockDoc.find((d) => d.status === '草稿' && d.docType === '采购入库')
const before = db.balanceOf(wh1, s.stockDocDetail.find((l) => l.docId === docDraft.id).itemId)
await api.confirmDoc(docDraft.id)
const after = db.balanceOf(wh1, s.stockDocDetail.find((l) => l.docId === docDraft.id).itemId)
log('确认采购入库后余额增加', after > before, `${before} -> ${after}`)
let err3 = ''
try { await api.confirmDoc(docDraft.id) } catch (e) { err3 = e.message }
log('重复确认被拦截', !!err3, err3)

const item = s.item.find((i) => i.code === 'RM-009')
const docBig = await api.createDoc({ docType: '销售出库', warehouseId: wh1, lines: [{ itemId: item.id, qty: 99999 }], creatorId: 6 })
let err4 = ''
try { await api.confirmDoc(docBig.id) } catch (e) { err4 = e.message }
log('库存不足不能出库', !!err4, err4)

const order = s.workOrder.find((o) => o.no === 'WO-20250918-001')
const docReturn = await api.createDoc({ docType: '生产退料', warehouseId: wh1, orderId: order.id, lines: [{ itemId: s.item.find((i) => i.code === 'RM-001').id, qty: 200 }], creatorId: 6 })
let err5 = ''
try { await api.confirmDoc(docReturn.id) } catch (e) { err5 = e.message }
log('退料不能超过已领未退', !!err5, err5)

const docIn = await api.createDoc({ docType: '成品入库', warehouseId: s.warehouse.find((w) => w.type === '成品库').id, orderId: order.id, lines: [{ itemId: order.itemId, qty: 999 }], creatorId: 6 })
let err6 = ''
try { await api.confirmDoc(docIn.id) } catch (e) { err6 = e.message }
log('成品入库不能超过合格数', !!err6, err6)

console.log('\n===== 成品入库 -> 自动完工 =====')
const doneOrder = s.workOrder.find((o) => o.no === 'WO-20250910-001')
log('完工工单状态', doneOrder.status === '已完工', doneOrder.status)

console.log('\n===== 页面组件注册 =====')
const expected = ['Login', 'Dashboard', 'FactoryPage', 'WarehousePage', 'UserPage', 'EquipmentPage',
  'WorkstationPage', 'ToolingPage', 'UnitPage', 'ItemPage', 'BomPage', 'RoutingPage',
  'OrderListPage', 'OrderDetailPage', 'TaskListPage', 'ReportListPage', 'ProgressPage',
  'DocListPage', 'StockPage', 'FlowPage', 'AboutPage']
const missing = expected.filter((k) => !MES.views[k])
log('全部页面组件已注册', missing.length === 0, missing.join(',') || expected.length + ' 个')

console.log('\n===== 页面配置项自检 =====')
for (const [name, comp] of Object.entries(MES.views)) {
  const tpl = comp.template || ''
  const hasTemplate = tpl.length > 20
  const badRef = /state\.[a-zA-Z]+/.test(tpl) && !(comp.setup && String(comp.setup).includes('state'))
  if (!hasTemplate) { console.log(`FAIL  组件 ${name} 缺少模板`); process.exitCode = 1 }
}
console.log('PASS  组件模板检查完成')
