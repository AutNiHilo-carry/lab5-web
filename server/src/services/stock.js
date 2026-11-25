/* 库存：单据、余额、流水
 * 余额不存初值，只能由已确认的单据按 +入库 / −出库 累加，同时写一条 stock_flow
 * 确认时先把每行都验一遍，有一行不过就整单拒绝
 */

import { badRequest, notFound, conflict } from '../lib/errors.js'
import { rowToApi } from '../lib/convert.js'

const EPS = 1e-6
const IN_TYPES = ['采购入库', '生产退料', '成品入库']
const OUT_TYPES = ['生产领料', '销售出库']
const DOC_TYPES = IN_TYPES.concat(OUT_TYPES)

const isInbound = (docType) => IN_TYPES.indexOf(docType) >= 0

const now = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 单据编号前缀（与前端本地版、db 种子数据保持一致） */
const PREFIX = {
  采购入库: 'RK',
  生产领料: 'LL',
  生产退料: 'RL',
  成品入库: 'CP',
  销售出库: 'XS'
}

async function nextDocNo(repo, docType) {
  const all = await repo.all('stock_doc')
  const day = now().slice(0, 10).replace(/-/g, '')
  const prefix = `${PREFIX[docType] || 'DJ'}-${day}`
  const n = all.filter((d) => String(d.no || '').indexOf(prefix) === 0).length + 1
  return `${prefix}-${String(n).padStart(3, '0')}`
}

// 单据：新建

export async function createDoc(repo, payload) {
  return repo.tx(async (tx) => {
    const docType = payload.docType
    if (DOC_TYPES.indexOf(docType) < 0) throw badRequest('单据类型只能是：' + DOC_TYPES.join(' / '))
    if (!payload.warehouseId) throw badRequest('请选择仓库')
    const wh = await tx.get('warehouse', payload.warehouseId)
    if (!wh) throw badRequest('仓库不存在')

    const lines = (payload.lines || []).filter((l) => l && l.itemId && Number(l.qty) > 0)
    if (!lines.length) throw badRequest('请至少添加一条明细，且数量必须大于 0')

    /* 明细去重合并：同一物料多行时合并成一行 */
    const merged = new Map()
    lines.forEach((l) => {
      const k = Number(l.itemId)
      merged.set(k, (merged.get(k) || 0) + Number(l.qty))
    })

    for (const itemId of merged.keys()) {
      const item = await tx.get('item', itemId)
      if (!item) throw badRequest(`物料 #${itemId} 不存在`)
    }

    /* 成品入库必须来自工单，且不超过待入库数量 */
    if (docType === '成品入库') {
      if (!payload.orderId) throw badRequest('成品入库单必须关联生产工单')
      await assertInboundLimit(tx, payload.orderId, docType, merged)
    }

    const doc = await tx.insert('stock_doc', {
      no: payload.no || (await nextDocNo(tx, docType)),
      doc_type: docType,
      warehouse_id: Number(payload.warehouseId),
      order_id: payload.orderId ? Number(payload.orderId) : null,
      partner_id: payload.partnerId ? Number(payload.partnerId) : null,
      /* 总金额只对采购入库/销售出库有意义，其它类型存 0 */
      amount: ['采购入库', '销售出库'].indexOf(docType) >= 0 ? (Number(payload.amount) || 0) : 0,
      status: '草稿',
      creator_id: payload.creatorId ? Number(payload.creatorId) : null,
      create_time: now(),
      confirm_time: null,
      remark: payload.remark || ''
    })

    for (const [itemId, qty] of merged) {
      await tx.insert('stock_doc_detail', {
        doc_id: doc.id,
        item_id: itemId,
        qty: +Number(qty).toFixed(3)
      })
    }

    return getDocDetail(tx, doc.id)
  })
}

// 单据：修改

export async function updateDoc(repo, docId, payload) {
  return repo.tx(async (tx) => {
    const doc = await tx.get('stock_doc', docId)
    if (!doc) throw notFound('单据不存在')
    if (doc.status === '已确认') throw conflict('已确认的单据不能修改')

    const lines = (payload.lines || []).filter((l) => l && l.itemId && Number(l.qty) > 0)
    if (!lines.length) throw badRequest('请至少添加一条明细，且数量必须大于 0')

    const merged = new Map()
    lines.forEach((l) => {
      const k = Number(l.itemId)
      merged.set(k, (merged.get(k) || 0) + Number(l.qty))
    })

    if (doc.doc_type === '成品入库' && doc.order_id) {
      await assertInboundLimit(tx, doc.order_id, doc.doc_type, merged)
    }

    for (const d of await tx.find('stock_doc_detail', { doc_id: doc.id })) {
      await tx.remove('stock_doc_detail', d.id)
    }
    for (const [itemId, qty] of merged) {
      await tx.insert('stock_doc_detail', {
        doc_id: doc.id,
        item_id: itemId,
        qty: +Number(qty).toFixed(3)
      })
    }
    await tx.update('stock_doc', doc.id, {
      remark: payload.remark !== undefined ? payload.remark : doc.remark,
      partner_id: payload.partnerId !== undefined ? (payload.partnerId ? Number(payload.partnerId) : null) : doc.partner_id,
      amount: payload.amount !== undefined
        ? (['采购入库', '销售出库'].indexOf(doc.doc_type) >= 0 ? (Number(payload.amount) || 0) : 0)
        : doc.amount
    })
    return getDocDetail(tx, doc.id)
  })
}

// 单据：删除

export async function deleteDoc(repo, docId) {
  return repo.tx(async (tx) => {
    const doc = await tx.get('stock_doc', docId)
    if (!doc) throw notFound('单据不存在')
    if (doc.status === '已确认') throw conflict('已确认的单据不能删除，否则库存无法追溯')
    for (const d of await tx.find('stock_doc_detail', { doc_id: doc.id })) {
      await tx.remove('stock_doc_detail', d.id)
    }
    await tx.remove('stock_doc', doc.id)
    return { ok: true }
  })
}

// 单据：确认

export async function confirmDoc(repo, docId) {
  return repo.tx(async (tx) => {
    const doc = await tx.get('stock_doc', docId)
    if (!doc) throw notFound('单据不存在')
    if (doc.status === '已确认') throw conflict('该单据已确认，不能重复确认')

    const details = await tx.find('stock_doc_detail', { doc_id: doc.id })
    if (!details.length) throw badRequest('单据没有明细，不能确认')

    /* 已关闭的工单不能再领料/退料/入库 */
    if (doc.order_id) {
      const order = await tx.get('work_order', doc.order_id)
      if (order && order.status === '已关闭') {
        throw badRequest(`工单 ${order.no} 已关闭，不能再处理它的单据`)
      }
    }

    const inbound = isInbound(doc.doc_type)

    // 先把每一行验一遍，任何一行不过就整单报错；
    // 不然会出现前面几行已经扣了库存、后面一行失败的半截状态
    for (const d of details) {
      const item = await tx.get('item', d.item_id)
      if (!item) throw badRequest(`物料 #${d.item_id} 不存在`)
      const qty = Number(d.qty)
      if (qty <= 0) throw badRequest(`物料「${item.name}」的数量必须大于 0`)

      if (!inbound) {
        const balance = await balanceQty(tx, doc.warehouse_id, d.item_id)
        if (balance + EPS < qty) {
          throw badRequest(
            `「${item.code} ${item.name}」库存不足：当前 ${balance}，需要 ${qty}`
          )
        }
        /* 退料：不能超过已领未退 */
        if (doc.doc_type === '生产退料' && doc.order_id) {
          const mat = await tx.one('order_material', { order_id: doc.order_id, item_id: d.item_id })
          if (!mat) throw badRequest(`物料「${item.name}」不在该工单的领料范围内`)
          const canReturn = Number(mat.picked_qty) - Number(mat.returned_qty)
          if (qty > canReturn + EPS) {
            throw badRequest(
              `「${item.name}」退料数量 ${qty} 超过已领未退数量 ${canReturn}`
            )
          }
        }
      }
    }

    /* 成品入库：待入库 = 末道合格 − 已入库 */
    if (doc.doc_type === '成品入库' && doc.order_id) {
      const merged = new Map()
      details.forEach((d) => {
        merged.set(Number(d.item_id), (merged.get(Number(d.item_id)) || 0) + Number(d.qty))
      })
      await assertInboundLimit(tx, doc.order_id, doc.doc_type, merged)
    }

    // 全部通过才真正动库存
    const flowTime = now()
    for (const d of details) {
      const qty = Number(d.qty)
      const change = inbound ? qty : -qty
      const after = await moveStock(tx, doc.warehouse_id, d.item_id, change, {
        docId: doc.id,
        docType: doc.doc_type,
        flowTime
      })
      if (doc.doc_type === '生产领料' && doc.order_id) {
        const mat = await tx.one('order_material', { order_id: doc.order_id, item_id: d.item_id })
        if (mat) {
          await tx.update('order_material', mat.id, {
            picked_qty: +(Number(mat.picked_qty) + qty).toFixed(3)
          })
        }
      }
      if (doc.doc_type === '生产退料' && doc.order_id) {
        const mat = await tx.one('order_material', { order_id: doc.order_id, item_id: d.item_id })
        if (mat) {
          await tx.update('order_material', mat.id, {
            returned_qty: +(Number(mat.returned_qty) + qty).toFixed(3)
          })
        }
      }
      if (doc.doc_type === '成品入库' && doc.order_id) {
        await addInboundQty(tx, doc.order_id, qty)
      }
      d._balanceAfter = after
    }

    const updated = await tx.update('stock_doc', doc.id, {
      status: '已确认',
      confirm_time: flowTime
    })

    /* 末道全部入库则工单完工 */
    if (doc.doc_type === '成品入库' && doc.order_id) {
      await finishIfDone(tx, doc.order_id)
    }

    return {
      doc: rowToApi(updated),
      lines: details.map((d) => ({ itemId: d.item_id, qty: Number(d.qty), balanceAfter: d._balanceAfter }))
    }
  })
}

// 内部工具

/** 当前结存（只读余额表，不设初值） */
async function balanceQty(repo, warehouseId, itemId) {
  const row = await repo.one('stock_balance', { warehouse_id: Number(warehouseId), item_id: Number(itemId) })
  return row ? Number(row.qty) : 0
}

/** 变动库存 + 写流水，返回变动后结存 */
async function moveStock(repo, warehouseId, itemId, change, { docId, docType, flowTime }) {
  const w = Number(warehouseId)
  const i = Number(itemId)
  const row = await repo.one('stock_balance', { warehouse_id: w, item_id: i })
  const before = row ? Number(row.qty) : 0
  const after = +(before + Number(change)).toFixed(3)

  if (row) await repo.update('stock_balance', row.id, { qty: after })
  else await repo.insert('stock_balance', { warehouse_id: w, item_id: i, qty: after })

  await repo.insert('stock_flow', {
    warehouse_id: w,
    item_id: i,
    change_qty: +Number(change).toFixed(3),
    balance_after: after,
    doc_id: docId || null,
    doc_type: docType,
    flow_time: flowTime || now()
  })
  return after
}

/** 末道工序已入库数量与待入库数量 */
async function inboundState(repo, orderId) {
  const tasks = await repo.find('order_task', { order_id: Number(orderId) })
  if (!tasks.length) return { last: null, done: 0, inbound: 0, wait: 0 }
  const last = tasks.slice().sort((a, b) => Number(b.seq) - Number(a.seq))[0]
  const done = Number(last.equip_done_qty)
  const inbound = Number(last.inbound_qty)
  return { last, done, inbound, wait: +(done - inbound).toFixed(3) }
}

/** 成品入库不得超过待入库数量 */
async function assertInboundLimit(repo, orderId, docType, merged) {
  if (docType !== '成品入库') return
  const order = await repo.get('work_order', orderId)
  if (!order) throw badRequest('成品入库必须关联有效的生产工单')
  const { wait } = await inboundState(repo, orderId)
  const total = [...merged.values()].reduce((s, v) => s + Number(v), 0)
  if (total > wait + EPS) {
    throw badRequest(`成品入库数量 ${total} 超过待入库数量 ${wait}（末道合格 − 已入库）`)
  }
}

/** 成品入库累加到末道工序的已入库数量 */
async function addInboundQty(repo, orderId, qty) {
  const { last, inbound } = await inboundState(repo, orderId)
  if (!last) return
  await repo.update('order_task', last.id, {
    inbound_qty: +(Number(inbound) + Number(qty)).toFixed(3)
  })
}

/** 末道工序入库完毕 → 工单完工 */
async function finishIfDone(repo, orderId) {
  const order = await repo.get('work_order', orderId)
  if (!order || ['已完工', '已关闭'].indexOf(order.status) >= 0) return
  const { done, inbound } = await inboundState(repo, orderId)
  if (done > 0 && inbound + EPS >= done) {
    await repo.update('work_order', orderId, { status: '已完工' })
  }
}

// 查询

export async function getDocDetail(repo, docId) {
  const doc = await repo.get('stock_doc', docId)
  if (!doc) throw notFound('单据不存在')
  const wh = await repo.get('warehouse', doc.warehouse_id)
  const creator = doc.creator_id ? await repo.get('sys_user', doc.creator_id) : null
  const order = doc.order_id ? await repo.get('work_order', doc.order_id) : null
  const partner = doc.partner_id ? await repo.get('partner', doc.partner_id) : null

  const details = await repo.find('stock_doc_detail', { doc_id: doc.id })
  const lines = []
  for (const d of details) {
    const item = await repo.get('item', d.item_id)
    const unit = item ? await repo.get('unit', item.unit_id) : null
    lines.push({
      id: d.id,
      itemId: d.item_id,
      itemCode: item ? item.code : null,
      itemName: item ? item.name : null,
      spec: item ? item.spec : null,
      unitName: unit ? unit.name : null,
      qty: Number(d.qty),
      balance: await balanceQty(repo, doc.warehouse_id, d.item_id)
    })
  }

  return {
    doc: {
      ...rowToApi(doc),
      warehouseName: wh ? wh.name : null,
      creatorName: creator ? creator.name : null,
      orderNo: order ? order.no : null,
      orderName: order ? order.name : null,
      partnerName: partner ? partner.name : null,
      direction: isInbound(doc.doc_type) ? '+' : '−'
    },
    lines
  }
}

export async function listDocs(repo, { docType, status, warehouseId } = {}) {
  const all = await repo.all('stock_doc')
  const rows = all
    .filter((d) => (docType ? d.doc_type === docType : true))
    .filter((d) => (status ? d.status === status : true))
    .filter((d) => (warehouseId ? Number(d.warehouse_id) === Number(warehouseId) : true))
    .sort((a, b) => b.id - a.id)

  const out = []
  for (const d of rows) {
    const wh = await repo.get('warehouse', d.warehouse_id)
    const creator = d.creator_id ? await repo.get('sys_user', d.creator_id) : null
    const order = d.order_id ? await repo.get('work_order', d.order_id) : null
    const partner = d.partner_id ? await repo.get('partner', d.partner_id) : null
    const details = await repo.find('stock_doc_detail', { doc_id: d.id })
    out.push({
      ...rowToApi(d),
      warehouseName: wh ? wh.name : null,
      creatorName: creator ? creator.name : null,
      orderNo: order ? order.no : null,
      orderName: order ? order.name : null,
      partnerName: partner ? partner.name : null,
      direction: isInbound(d.doc_type) ? '+' : '−',
      lineCount: details.length,
      totalQty: +details.reduce((s, x) => s + Number(x.qty), 0).toFixed(3)
    })
  }
  return out
}

/** 库存余额：+/− 汇总（页面直接用这个） */
export async function listStock(repo, { warehouseId, keyword } = {}) {
  let rows = await repo.stockRows()
  if (warehouseId) rows = rows.filter((r) => Number(r.warehouseId) === Number(warehouseId))
  if (keyword) {
    const k = String(keyword).toLowerCase()
    rows = rows.filter((r) => `${r.itemCode || ''}${r.itemName || ''}`.toLowerCase().indexOf(k) >= 0)
  }
  return rows.map((r) => ({
    ...r,
    inQty: Number(r.inQty),
    outQty: Number(r.outQty),
    qty: Number(r.qty)
  }))
}

/** 为工单生成成品入库单（待入库数量） */
export async function createInboundDocForOrder(repo, orderId, payload = {}) {
  return repo.tx(async (tx) => {
    const order = await tx.get('work_order', orderId)
    if (!order) throw notFound('工单不存在')
    if (['已下达', '生产中'].indexOf(order.status) < 0) {
      throw conflict('只有已下达或生产中的工单可以生成成品入库单')
    }
    const { wait } = await inboundState(tx, orderId)
    if (wait <= EPS) throw badRequest('该工单没有待入库数量（末道合格 − 已入库 = 0）')

    /* 成品入库进成品库 */
    const warehouses = await tx.all('warehouse')
    const wh = warehouses.filter((w) => w.type === '成品库')[0] || warehouses[0]
    if (!wh) throw badRequest('请先维护仓库')

    return createDoc(tx, {
      docType: '成品入库',
      warehouseId: payload.warehouseId || wh.id,
      orderId: order.id,
      lines: [{ itemId: order.item_id, qty: wait }],
      remark: payload.remark || `工单 ${order.no} 成品入库`,
      creatorId: payload.creatorId
    })
  })
}

export { IN_TYPES, OUT_TYPES, DOC_TYPES, isInbound }


