/* 连真库核对：表、视图、过程、外键、字符集，还有库存有没有期初值
 * node scripts/mysql-verify.mjs [端口]
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const requireFromServer = createRequire(path.join(here, '..', 'server', 'package.json'))
const mysql = requireFromServer('mysql2/promise')

const port = Number(process.argv[2] || 3307)

let step = 0
let bad = 0
const ok = (label, cond, extra = '') => {
  step++
  if (!cond) bad++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${extra ? '  → ' + extra : ''}`)
}

const conn = await mysql.createConnection({
  host: '127.0.0.1', port, user: 'root', password: '',
  database: 'lab5_mes', charset: 'utf8mb4', dateStrings: true, decimalNumbers: true
})

try {
  const q = async (sql, args) => (await conn.query(sql, args))[0]

  // 表
  const tables = (await q(
    `SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema='lab5_mes' AND table_type='BASE TABLE' ORDER BY table_name`
  )).map((r) => r.t)
  ok('建了 24 张表', tables.length === 24, tables.length + ' 张')

  const must = ['factory', 'workshop', 'department', 'warehouse', 'sys_user', 'role', 'unit', 'item',
    'partner', 'equipment', 'workstation', 'tooling', 'routing', 'routing_detail', 'bom', 'bom_detail',
    'work_order', 'order_material', 'order_task', 'work_report', 'stock_doc', 'stock_doc_detail',
    'stock_balance', 'stock_flow']
  ok('表名齐全', must.every((t) => tables.indexOf(t) >= 0),
    must.filter((t) => tables.indexOf(t) < 0).join(',') || '全部存在')

  const views = (await q(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema='lab5_mes' AND table_type='VIEW'`
  )).map((r) => r.t)
  ok('建了 4 个视图', views.length === 4, views.join(','))

  const procs = (await q(
    `SELECT routine_name AS n FROM information_schema.routines
     WHERE routine_schema='lab5_mes' AND routine_type='PROCEDURE'`
  )).map((r) => r.n)
  ok('建了 3 个存储过程', procs.length === 3, procs.join(','))

  // 外键与字符集
  const fks = await q(
    `SELECT COUNT(*) AS c FROM information_schema.table_constraints
     WHERE table_schema='lab5_mes' AND constraint_type='FOREIGN KEY'`
  )
  ok('外键 40 个', Number(fks[0].c) === 40, fks[0].c + ' 个')

  const cols = await q(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema='lab5_mes' AND character_set_name IS NOT NULL AND character_set_name<>'utf8mb4'`
  )
  ok('所有字符列都是 utf8mb4', Number(cols[0].c) === 0, cols[0].c + ' 列不是')

  // 部门与车间平级
  const depts = await q(`SELECT code, name, factory_id, leader FROM department ORDER BY code`)
  ok('部门 5 条且都有编号', depts.length === 5 && depts.every((d) => /^DP\d\d$/.test(d.code)),
    depts.map((d) => d.code + d.name).join(','))
  ok('部门与车间都直接挂工厂',
    (await q(`SELECT COUNT(*) c FROM workshop WHERE factory_id IS NULL`))[0].c === 0 &&
    depts.every((d) => d.factory_id === 1))
  const dept = depts[1]
  ok('部门中文未乱码', dept && dept.name === '采购部', dept && dept.name)

  // 供应商客户
  const partners = await q(`SELECT code, name, partner_type FROM partner ORDER BY code`)
  ok('供应商客户 5 条', partners.length === 5, partners.map((p) => p.partner_type).join(','))
  ok('单表两种类型',
    partners.filter((p) => p.partner_type === '供应商').length === 3 &&
    partners.filter((p) => p.partner_type === '客户').length === 2)

  // 工艺路线不绑产品 / BOM 指定路线
  const routingCols = (await q(
    `SELECT column_name AS c FROM information_schema.columns
     WHERE table_schema='lab5_mes' AND table_name='routing'`
  )).map((r) => r.c)
  ok('routing 表没有 item_id', routingCols.indexOf('item_id') < 0, routingCols.join(','))
  ok('routing 有 name', routingCols.indexOf('name') >= 0)

  const bomRouting = await q(
    `SELECT b.no, b.routing_id, r.no AS rno, r.name AS rname,
            (SELECT COUNT(*) FROM routing_detail rd WHERE rd.routing_id = r.id) AS steps
     FROM bom b JOIN routing r ON r.id = b.routing_id ORDER BY b.id`
  )
  ok('每个 BOM 都指定了工艺路线', bomRouting.length >= 3 && bomRouting.every((b) => b.routing_id),
    bomRouting.map((b) => `${b.no}→${b.rno}`).join(' '))
  ok('路线可被多个产品复用（不绑产品）',
    bomRouting.every((b) => b.steps > 0),
    bomRouting.map((b) => `${b.rno}:${b.steps}序`).join(' '))

  // 工单：名称 + 编号 + 负责工厂
  const orders = await q(
    `SELECT no, name, factory_id, status FROM work_order ORDER BY id`
  )
  ok('工单都有名称与编号', orders.length === 4 && orders.every((o) => o.no && o.name),
    orders.map((o) => o.no + '/' + o.name).join(' | '))
  ok('工单都有负责工厂', orders.every((o) => o.factory_id), '工厂 ' + orders[0].factory_id)
  ok('工单名称中文正常', orders[0].name === '四旋翼巡检机首批生产' || /巡检/.test(orders[0].name), orders[0].name)

  // 库存：无初值、+/− 汇总
  const bal = await q(`SELECT warehouse_id, item_id, qty FROM stock_balance ORDER BY warehouse_id, item_id`)
  const flowSum = await q(
    `SELECT warehouse_id, item_id, SUM(change_qty) AS s FROM stock_flow GROUP BY warehouse_id, item_id`
  )
  const map = new Map(flowSum.map((f) => [f.warehouse_id + ':' + f.item_id, Number(f.s)]))
  const mismatch = bal.filter((b) => Math.abs(Number(b.qty) - (map.get(b.warehouse_id + ':' + b.item_id) || 0)) > 1e-6)
  ok('每行结存 = 已确认单据流水累加', mismatch.length === 0,
    mismatch.length ? mismatch.map((m) => `${m.warehouse_id}/${m.item_id}`).join(',') : `${bal.length} 行`)

  const views2 = await q(`SELECT SUM(in_qty) i, SUM(out_qty) o, SUM(qty) q FROM v_stock_balance`)
  ok('视图 +/− 汇总自洽',
    Math.abs(Number(views2[0].q) - (Number(views2[0].i) - Number(views2[0].o))) < 1e-6,
    `+${views2[0].i} − ${views2[0].o} = ${views2[0].q}`)

  const negInFlow = await q(`SELECT COUNT(*) c FROM stock_flow WHERE doc_type='采购入库' AND change_qty < 0`)
  ok('入库流水都是正数', Number(negInFlow[0].c) === 0)

  /* 期初痕迹：库存必须全部能由单据解释 */
  const orphan = await q(
    `SELECT COUNT(*) c FROM stock_balance b
     WHERE NOT EXISTS (SELECT 1 FROM stock_flow f
                       WHERE f.warehouse_id=b.warehouse_id AND f.item_id=b.item_id)`
  )
  ok('没有无单据来源的库存行', Number(orphan[0].c) === 0, orphan[0].c + ' 行无流水')

  // 存储过程可用
  const draft = await q(`SELECT id FROM work_order WHERE status='草稿' LIMIT 1`)
  ok('存在草稿工单供下达测试', draft.length === 1)

  console.log(bad ? `\n失败 ${bad} 项，共 ${step} 项` : `\nMySQL 真实库检查全部通过，共 ${step} 项`)
} finally {
  await conn.end()
}
if (bad) process.exitCode = 1
