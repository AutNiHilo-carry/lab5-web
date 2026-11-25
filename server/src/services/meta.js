/* 基础资料的通用增删改查：白名单、必填、枚举、唯一键，删之前先看有没有被引用
 */

import { badRequest, notFound, conflict } from '../lib/errors.js'
import { apiToRow, rowToApi } from '../lib/convert.js'
import {
  isTable, columnsOf, cnOf, requiredOf, validateRow, guardsOf, uniqueOf
} from '../lib/schema.js'

/** 只读表：库存余额与流水只能由单据产生，禁止任何直接写入 */
const READ_ONLY = ['stock_balance', 'stock_flow']
const BUSINESS_TABLES = [
  'work_order', 'order_material', 'order_task', 'work_report',
  'stock_doc', 'stock_doc_detail'
]

function publicRow(table, row) {
  const out = rowToApi(row)
  if (table === 'sys_user' && out) delete out.password
  return out
}

export function assertTable(t) {
  if (!isTable(t)) throw notFound(`未知的数据表：${t}`)
  if (READ_ONLY.indexOf(t) >= 0) {
    throw badRequest(`${cnOf(t)}不允许直接写入：库存只能由已确认的出入库单据产生`)
  }
  if (BUSINESS_TABLES.includes(t)) {
    throw badRequest(`${cnOf(t)}不允许通过通用接口写入，请使用对应的业务接口`)
  }
  return t
}

/** 唯一键查重（新增/修改都查，修改时排除自身） */
async function assertUnique(repo, table, row, selfId) {
  const cols = uniqueOf(table)
  for (const col of cols) {
    if (row[col] === undefined || row[col] === null || row[col] === '') continue
    const dup = await repo.find(table, { [col]: row[col] })
    const other = dup.filter((r) => Number(r.id) !== Number(selfId))[0]
    if (other) throw conflict(`${cnOf(table)}「${row[col]}」已存在，请换一个${col === 'code' || col === 'no' || col === 'account' ? '编号' : '名称'}`)
  }
}

/** 删除守卫：被引用时不允许删除 */
async function assertDeletable(repo, table, id) {
  for (const g of guardsOf(table)) {
    if (g.table === table) {
      const kids = await repo.find(g.child, { [g.fk]: Number(id) })
      if (kids.length) throw conflict(g.msg)
    }
    /* g.child === table 的情况表示"父表删除时检查子表"，无需在此处理 */
  }
}

export async function listRows(repo, table, { keyword, field, value, limit } = {}) {
  assertTableForRead(table)
  let rows = await repo.all(table)

  if (field && value !== undefined && value !== '') {
    rows = rows.filter((r) => String(r[field]) === String(value))
  }
  if (keyword) {
    const k = String(keyword).toLowerCase()
    const cols = columnsOf(table)
    rows = rows.filter((r) => cols.some((c) => String(r[c] || '').toLowerCase().indexOf(k) >= 0))
  }
  rows = rows.slice().sort((a, b) => Number(a.id) - Number(b.id))
  if (limit) rows = rows.slice(0, Number(limit))
  return rows.map((row) => publicRow(table, row))
}

export async function getRow(repo, table, id) {
  assertTableForRead(table)
  const row = await repo.get(table, id)
  if (!row) throw notFound(`${cnOf(table)}不存在`)
  return publicRow(table, row)
}

export async function createRow(repo, table, payload) {
  assertTable(table)
  const cols = columnsOf(table)
  const row = apiToRow(payload, cols)

  const errs = validateRow(table, row, { isNew: true })
  if (errs.length) throw badRequest(errs.join('；'))
  await assertUnique(repo, table, row, null)

  const rec = await repo.insert(table, row)
  return publicRow(table, rec)
}

export async function updateRow(repo, table, id, payload) {
  assertTable(table)
  const cols = columnsOf(table)
  const row = apiToRow(payload, cols)

  const exist = await repo.get(table, id)
  if (!exist) throw notFound(`${cnOf(table)}不存在`)

  const errs = validateRow(table, { ...exist, ...row }, { isNew: false })
  if (errs.length) throw badRequest(errs.join('；'))
  await assertUnique(repo, table, row, id)

  const rec = await repo.update(table, id, row)
  return publicRow(table, rec)
}

export async function removeRow(repo, table, id) {
  assertTable(table)
  const exist = await repo.get(table, id)
  if (!exist) throw notFound(`${cnOf(table)}不存在`)
  await assertDeletable(repo, table, id)
  await repo.remove(table, id)
  return { ok: true }
}

/** 读操作允许 stock_balance / stock_flow */
function assertTableForRead(table) {
  if (!isTable(table)) throw notFound(`未知的数据表：${table}`)
}

/** 一次拉取前端需要的全部基础资料 */
export async function loadMeta(repo) {
  const tables = [
    'factory', 'workshop', 'department', 'warehouse', 'role', 'sys_user',
    'unit', 'item', 'partner', 'equipment', 'workstation', 'tooling',
    'routing', 'routing_detail', 'bom', 'bom_detail',
    /* 前端整库同步还要用这两张业务明细：工单物料需求、单据明细 */
    'order_material', 'stock_doc_detail'
  ]
  const out = {}
  for (const t of tables) {
    const rows = await repo.all(t)
    out[t] = rows.map((row) => publicRow(t, row))
  }
  return out
}

export { requiredOf }
