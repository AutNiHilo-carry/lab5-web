/* 在真库上把三个存储过程跑一遍，跟 services/ 里的规则对一下
 * node scripts/proc-test.mjs [端口]
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const mysql = createRequire(path.join(here, '..', 'server', 'package.json'))('mysql2/promise')

const port = Number(process.argv[2] || 3307)
let step = 0
let bad = 0
const ok = (label, cond, extra = '') => {
  step++
  if (!cond) bad++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2, '0')}. ${label}${extra ? '  → ' + extra : ''}`)
}
const short = (s) => String(s || '').slice(0, 70)

const conn = await mysql.createConnection({
  host: '127.0.0.1', port, user: 'root', password: '',
  database: 'lab5_mes', charset: 'utf8mb4', dateStrings: true, decimalNumbers: true
})
const q = async (sql, args) => (await conn.query(sql, args))[0]
const throws = async (fn) => {
  try { await fn(); return '' } catch (e) { return e.sqlMessage || e.message }
}

try {
  // 1) sp_audit_order
  const draft = (await q(`SELECT id, no, plan_qty FROM work_order WHERE status='草稿' LIMIT 1`))[0]
  ok('找到待下达的草稿工单', !!draft, draft && draft.no)

  const auditErr = await throws(() => conn.query('CALL sp_audit_order(?)', [draft.id]))
  const st1 = (await q('SELECT status FROM work_order WHERE id=?', [draft.id]))[0].status
  const mats = await q('SELECT item_id, req_qty FROM order_material WHERE order_id=?', [draft.id])
  const tasks = await q('SELECT seq, process_name FROM order_task WHERE order_id=? ORDER BY seq', [draft.id])

  ok('过程执行无报错', !auditErr, auditErr)
  ok('工单状态推进', ['已下达', '生产中'].indexOf(st1) >= 0, st1)
  ok('按 BOM 生成物料需求', mats.length > 0, mats.length + ' 行')
  ok('按 BOM 指定路线生成工序', tasks.length === 6, tasks.map((t) => t.process_name).join(' '))

  /* 单件用量不能写死：草稿工单的产品可能是 X4（4 个电机）也可能是 X6（6 个），从 BOM 反查 */
  const perUnit = Number((await q(
    `SELECT bd.qty_per_unit
       FROM work_order o
       JOIN bom b        ON b.item_id = o.item_id AND b.status = '启用'
       JOIN bom_detail bd ON bd.bom_id = b.id
       JOIN item i        ON i.id = bd.item_id
      WHERE o.id = ? AND i.code = 'RM-001'`, [draft.id]
  ))[0].qty_per_unit)
  const motorReq = (await q(
    `SELECT req_qty FROM order_material
     WHERE order_id=? AND item_id=(SELECT id FROM item WHERE code='RM-001')`, [draft.id]
  )).map((r) => Number(r.req_qty))[0]
  ok('物料需求 = BOM 单件用量 × 计划数量',
    perUnit > 0 && motorReq === perUnit * Number(draft.plan_qty),
    `${perUnit} × ${draft.plan_qty} = ${motorReq}`)

  const dupErr = await throws(() => conn.query('CALL sp_audit_order(?)', [draft.id]))
  ok('重复下达被过程拒绝', !!dupErr, short(dupErr))

  // 2) sp_add_report
  const t1 = (await q('SELECT id FROM order_task WHERE order_id=? AND seq=1', [draft.id]))[0].id
  const t2 = (await q('SELECT id FROM order_task WHERE order_id=? AND seq=2', [draft.id]))[0].id

  const r1Err = await throws(() =>
    conn.query('CALL sp_add_report(?,?,?,?,?)', [t1, Number(draft.plan_qty), 0, 2, '首道足额报工']))
  const done1 = Number((await q('SELECT equip_done_qty FROM order_task WHERE id=?', [t1]))[0].equip_done_qty)
  ok('首道足额报工成功', !r1Err && done1 === Number(draft.plan_qty), r1Err || `累计合格 ${done1}`)

  const overErr = await throws(() =>
    conn.query('CALL sp_add_report(?,?,?,?,?)', [t2, Number(draft.plan_qty) + 5, 0, 2, '故意超量']))
  ok('下道超上道合格被拒绝', !!overErr, short(overErr))

  const done2 = Number((await q('SELECT equip_done_qty FROM order_task WHERE id=?', [t2]))[0].equip_done_qty)
  ok('被拒后下道累计未变', done2 === 0, String(done2))

  const negErr = await throws(() => conn.query('CALL sp_add_report(?,?,?,?,?)', [t2, -1, 0, 2, '负数']))
  ok('负数报工被拒绝', !!negErr, short(negErr))

  const woSt = (await q('SELECT status FROM work_order WHERE id=?', [draft.id]))[0].status
  ok('报工后工单进入生产中', woSt === '生产中', woSt)

  // 3) sp_confirm_stock_doc
  const wh = (await q(`SELECT id FROM warehouse WHERE code='WH01'`))[0].id
  const item = (await q(`SELECT id FROM item WHERE code='RM-001'`))[0].id
  const balOf = async () => Number((await q(
    `SELECT qty FROM stock_balance WHERE warehouse_id=? AND item_id=?`, [wh, item]))[0].qty)

  const mkDoc = async (no, qty, type = '生产领料') => {
    await conn.query(
      `INSERT INTO stock_doc (no, doc_type, warehouse_id, order_id, status, creator_id, create_time)
       VALUES (?,?,?,?,'草稿',1,NOW())`, [no, type, wh, draft.id])
    const id = (await q('SELECT id FROM stock_doc WHERE no=?', [no]))[0].id
    await conn.query('INSERT INTO stock_doc_detail (doc_id, item_id, qty) VALUES (?,?,?)', [id, item, qty])
    return id
  }

  const before = await balOf()
  const d1 = await mkDoc('LL-PROCTEST-001', 10)
  ok('草稿单据不动库存', (await balOf()) === before, `保持 ${before}`)

  const c1Err = await throws(() => conn.query('CALL sp_confirm_stock_doc(?)', [d1]))
  const after = await balOf()
  const d1Status = (await q('SELECT status FROM stock_doc WHERE id=?', [d1]))[0].status
  const flows = await q('SELECT change_qty, balance_after FROM stock_flow WHERE doc_id=?', [d1])

  ok('过程确认单据成功', !c1Err, c1Err)
  ok('库存按出库 − 减少', Math.abs(after - (before - 10)) < 1e-6, `${before} → ${after}`)
  ok('单据置为已确认', d1Status === '已确认', d1Status)
  ok('写入流水且余额一致',
    flows.length === 1 && Math.abs(Number(flows[0].balance_after) - after) < 1e-6,
    `change=${flows[0].change_qty}, after=${flows[0].balance_after}`)

  const d2 = await mkDoc('LL-PROCTEST-002', 999999)
  const before2 = await balOf()
  const lackErr = await throws(() => conn.query('CALL sp_confirm_stock_doc(?)', [d2]))
  const after2 = await balOf()
  const d2Status = (await q('SELECT status FROM stock_doc WHERE id=?', [d2]))[0].status

  ok('库存不足被过程拒绝', !!lackErr, short(lackErr))
  ok('拒绝后库存一点未变', Math.abs(after2 - before2) < 1e-6, `${before2} → ${after2}`)
  ok('被拒单据仍是草稿', d2Status === '草稿', d2Status)

  const reErr = await throws(() => conn.query('CALL sp_confirm_stock_doc(?)', [d1]))
  ok('重复确认被拒绝', !!reErr, short(reErr))

  /* 结存 = 流水累加（全库） */
  const bal = await q('SELECT warehouse_id, item_id, qty FROM stock_balance')
  const sums = new Map((await q(
    'SELECT warehouse_id, item_id, SUM(change_qty) s FROM stock_flow GROUP BY warehouse_id, item_id'
  )).map((r) => [r.warehouse_id + ':' + r.item_id, Number(r.s)]))
  const bad2 = bal.filter((b) => Math.abs(Number(b.qty) - (sums.get(b.warehouse_id + ':' + b.item_id) || 0)) > 1e-6)
  ok('全库结存 = 流水累加', bad2.length === 0, bad2.length + ' 行不一致')

  console.log(bad ? `\n失败 ${bad} 项，共 ${step} 项` : `\n存储过程实测全部通过，共 ${step} 项`)
} finally {
  await conn.end()
}
if (bad) process.exitCode = 1
