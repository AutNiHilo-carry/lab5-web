/* 7 项改造的验收，直接读文件找证据
 * node scripts/acceptance-check.mjs
 */

import fs from 'node:fs'
import path from 'node:path'

const read = (p) => fs.readFileSync(p, 'utf8')
const has = (p, s) => read(p).includes(s)

let step = 0
let bad = 0
const ok = (label, cond, extra = '') => {
  step++
  if (!cond) bad++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${extra ? '  → ' + extra : ''}`)
}

const schema = read('db/01-schema.sql')
const data = read('db/02-data.sql')
const proc = read('db/03-proc.sql')
const queries = read('db/04-queries.sql')
const dbJs = read('app/10-db.js')
const apiJs = read('app/20-api.js')
const baseViews = read('app/51-views-base.js')
const techViews = read('app/52-views-tech.js')
const prodViews = read('app/53-views-prod.js')
const wmsViews = read('app/54-views-wms.js')
const layout = read('app/40-layout.js')
const routes = read('app/60-app.js')
const indexHtml = read('index.html')
const restJs = read('app/21-api-rest.js')

// 1. 部门：与车间平级、有编号、有页面
console.log('\n【1】部门（与车间平级 + 编号 + 页面）')
ok('数据库有 department 表', /CREATE TABLE department/.test(schema))
const deptDdl = (schema.match(/CREATE TABLE department[\s\S]*?ENGINE=InnoDB/) || [''])[0]
ok('部门挂在工厂下（与车间同级）', /factory_id\s+INT\s+NOT NULL/.test(deptDdl))
ok('部门有唯一编号约束', /uk_department_code/.test(deptDdl))
ok('部门初始数据 5 条', (data.match(/INSERT INTO department[\s\S]*?;/) || [''])[0].split('\n').filter((l) => /^\s*\(\d/.test(l)).length === 5)
ok('前端数据层有 department 表', dbJs.includes("'department'"))
ok('界面有部门页签', baseViews.includes('label="部门"') && baseViews.includes('departmentCfg'))
ok('用户可归属部门', schema.includes('department_id') && dbJs.includes('departmentId: 1'))

// 2. 仓库页去掉"在库物料"
console.log('\n【2】仓库页面不再显示在库物料')
ok('仓库列定义已无"在库物料"列', !/prop: 'kinds', label: '在库物料'/.test(baseViews))
ok('仓库页不再统计在库物料条数', !/kinds[\s\S]{0,60}stockBalance/.test(baseViews))
ok('仓库页保留类型/编号/工厂等列', baseViews.includes("{ prop: 'type', label: '仓库类型'") && baseViews.includes("{ prop: 'code', label: '仓库编号'"))

// 3. 供应商客户：单表 + 类型 + 页面
console.log('\n【3】供应商客户（单表 + 类型区分 + 页面）')
ok('数据库有 partner 表', /CREATE TABLE partner/.test(schema))
ok('用 partner_type 区分类型', /partner_type/.test(schema) && /'供应商'/.test(data) && /'客户'/.test(data))
ok('partner_type 有索引', schema.includes('idx_partner_type'))
ok('前端有 partner 表与数据', dbJs.includes("'partner'") && dbJs.includes('partnerType'))
ok('界面有供应商客户页', baseViews.includes('PartnerPage') && baseViews.includes('供应商与客户'))
ok('页面按类型筛选', /prop: 'partnerType', label: '类型'/.test(baseViews))
ok('路由已注册', routes.includes("'/base/partner'") && layout.includes("'/base/partner'"))

// 4. 工艺路线不绑产品，BOM 指定路线
console.log('\n【4】工艺路线不绑产品，改由 BOM 指定')
const routingDdl = (schema.match(/CREATE TABLE routing[\s\S]*?ENGINE=InnoDB/) || [''])[0]
ok('routing 表无 item_id', routingDdl.length > 0 && !routingDdl.includes('item_id'))
ok('routing 有 name 字段', /\bname\s+VARCHAR/.test(routingDdl))
ok('bom 通过 routing_id 外键指定路线', /fk_bom_routing/.test(schema))
ok('初始化数据的 BOM 带 routing_id', /INSERT INTO bom \(id, no, item_id, routing_id/.test(data))
ok('下达时从 BOM 取路线', proc.includes('v_routing_id') && proc.includes('FROM bom WHERE item_id'))
ok('前端按 bom.routingId 找路线', /state\.routing\.find\(\(r\) => r\.id === bom\.routingId/.test(dbJs))
ok('前端不再按 itemId 找路线', !/state\.routing\.find\(\(r\) => r\.itemId === order\.itemId/.test(dbJs))
ok('路线页可建路线并填名称', techViews.includes('newRouting.name') && techViews.includes('路线名称'))
ok('BOM 页可选工艺路线', techViews.includes('newBom.routingId') && techViews.includes('routingOptions'))
ok('后端下达也走 BOM→路线', read('server/src/services/order.js').includes('bom.routing_id'))

// 5. 工单：名称 + 编号 + 负责工厂
console.log('\n【5】工单：名称 + 编号 + 负责工厂')
const woDdl = (schema.match(/CREATE TABLE work_order[\s\S]*?ENGINE=InnoDB/) || [''])[0]
ok('工单表有 name', /\bname\s+VARCHAR/.test(woDdl))
ok('工单表有 no', /\bno\s+VARCHAR/.test(woDdl))
ok('工单表有 factory_id 外键', /fk_order_factory/.test(woDdl))
ok('初始化数据带名称与工厂', /INSERT INTO work_order \(id, no, name/.test(data))
ok('前端建单表单有工单名称', prodViews.includes('form.name') && prodViews.includes('工单名称'))
ok('前端建单表单有负责工厂', prodViews.includes('form.factoryId') && prodViews.includes('负责工厂'))
ok('工单列表展示名称与工厂', prodViews.includes('prop="name" label="工单名称"') && prodViews.includes("nameOf('factory', row.factoryId)"))
ok('工单详情展示工厂', prodViews.includes("nameOf('factory', order.factoryId)"))
ok('后端建单强制名称与工厂', read('server/src/services/order.js').includes('请填写工单名称') && read('server/src/services/order.js').includes('请选择负责生产的工厂'))
ok('后端校验车间属于该工厂', read('server/src/services/order.js').includes('不属于工厂'))

// 6. 库存只能由单据产生，+/− 汇总，无期初
console.log('\n【6】库存：只能由单据累积 + 显示 +/− + 无期初值')
ok('建表脚本删除期初库存语句', !/INSERT INTO stock_balance \(warehouse_id, item_id, qty\) VALUES/.test(data))
ok('余额本身由已确认单据推出', /INSERT INTO stock_balance \(warehouse_id, item_id, qty\)\s*\nSELECT/.test(data))
ok('标注不可手设初值', data.includes('不设任何期初值') && schema.includes('不可手设初值'))
ok('视图含 入库合计/出库合计/结存', queries.includes('AS in_qty') && queries.includes('AS out_qty') && queries.includes('AS qty'))
ok('出库按 − 统计', queries.includes('change_qty < 0'))
ok('不再有"排除半成品仓"的期初补丁', !/warehouse_id <> 3/.test(queries))
ok('前端种子数据不再写期初', !/upsertBalance\(WH\['WH03'\]/.test(dbJs))
ok('前端有 +/− 汇总函数', apiJs.includes('function stockSummary') && apiJs.includes('stockRows'))
ok('库存页展示 累计入库(+)/累计出库(−)/结存', wmsViews.includes('累计入库 (+)') && wmsViews.includes('累计出库 (−)') && wmsViews.includes('当前结存'))
/* 只看 StockPage 组件体：单据页有数量输入是正常的（单据就是出入库数量），库存余额页不能有。
 * 用"下一个组件定义"做结束边界，不依赖注释长什么样 */
const stockPageSrc = (wmsViews.match(/const StockPage = \{[\s\S]*?(?=const FlowPage = \{)/) || [''])[0]
ok('库存余额页无任何手工数量输入框',
  stockPageSrc.length > 0 && !/el-input-number/.test(stockPageSrc) && !/prop: 'qty', label: '当前库存'/.test(stockPageSrc),
  '单据页保留明细数量输入是正确的')
ok('后端禁止直接写 stock_balance', read('server/src/services/meta.js').includes("READ_ONLY = ['stock_balance', 'stock_flow']"))
/* 校验在前、动库在后：确认函数里"整单报错"的校验循环必须出现在 moveStock 调用之前 */
const stockSvcSrc = read('server/src/services/stock.js')
ok('后端确认单据先校验后执行',
  stockSvcSrc.indexOf('整单报错') > 0 &&
  stockSvcSrc.indexOf('整单报错') < stockSvcSrc.indexOf('await moveStock('))

// 7. 后端 Node+Express+MySQL，前端可切 REST
console.log('\n【7】后端（Express + MySQL）与前端 REST 切换')
ok('后端 package.json 存在且依赖 express/mysql2',
  has('server/package.json', '"express"') && has('server/package.json', '"mysql2"'))
ok('MySQL 仓库实现存在', fs.existsSync('server/src/repositories/mysql.js'))
ok('内存仓库实现存在（同接口，供测试）', fs.existsSync('server/src/repositories/memory.js'))
ok('路由覆盖工单/派工/报工/单据/库存',
  ['/orders', '/tasks/:id/assign', '/reports', '/docs', '/stock'].every((p) => read('server/src/routes.js').includes(p)))
ok('服务层实现审核下达/报工/确认单据',
  fs.existsSync('server/src/services/order.js') && fs.existsSync('server/src/services/report.js') && fs.existsSync('server/src/services/stock.js'))
ok('前端有 REST 适配层', restJs.includes('MES.rest') && restJs.includes("const GET = (p) => request('GET', p)"))
ok('适配层可开启/关闭', restJs.includes('async enable(apiBase)') && restJs.includes('disable()'))
ok('index.html 已引入适配层', indexHtml.includes('app/21-api-rest.js'))
ok('适配层保持页面零改动（同名接口）', restJs.includes('async createOrder(payload)') && restJs.includes('async confirmDoc(docId)'))

// 文档
console.log('\n【附】文档已同步')
ok('db/README 已是 24 张表', has('db/README.md', '24 张表'))
ok('db/README 说明 +/− 与无初值', has('db/README.md', '累计入库(+)') && has('db/README.md', '没有"初值"概念'))
ok('server/README 有接口一览', has('server/README.md', '接口一览'))
ok('根 README 提到前后端切换', has('README.md', 'MES.rest.enable'))

console.log(bad ? `\n失败 ${bad} 项，共 ${step} 项` : `\n7 项改造全部有据可查，共 ${step} 项验收通过`)
if (bad) process.exitCode = 1
