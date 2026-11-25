/* 内存仓库：接口跟 mysql 仓库一样，给测试和没装数据库的环境用
 * 这里只管存，业务规则都在 services/
 */

import { columnsOf } from '../lib/schema.js'

const clone = (v) => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)))

export function createMemoryRepo(seed = {}) {
  const data = {}
  const seq = {}
  Object.keys(columnsOf('factory') ? {} : {}).length // no-op
  const ALL = [
    'factory', 'workshop', 'department', 'warehouse', 'role', 'sys_user', 'unit', 'item', 'partner',
    'equipment', 'workstation', 'tooling', 'routing', 'routing_detail', 'bom', 'bom_detail',
    'work_order', 'order_material', 'order_task', 'work_report',
    'stock_doc', 'stock_doc_detail', 'stock_balance', 'stock_flow'
  ]
  ALL.forEach((t) => {
    data[t] = clone(seed[t] || [])
    seq[t] = data[t].reduce((m, r) => Math.max(m, r.id || 0), 0) + 1
  })

  let snapshot = null

  const repo = {
    kind: 'memory',

    all(table) {
      return data[table] || []
    },

    find(table, where) {
      const rows = data[table] || []
      return rows.filter((r) => Object.keys(where || {}).every((k) => r[k] === where[k]))
    },

    one(table, where) {
      return repo.find(table, where)[0] || null
    },

    get(table, id) {
      return (data[table] || []).find((r) => r.id === Number(id)) || null
    },

    insert(table, row) {
      const rec = { id: seq[table]++, ...clone(row) }
      data[table].push(rec)
      return rec
    },

    update(table, id, patch) {
      const rec = repo.get(table, id)
      if (!rec) return null
      Object.assign(rec, clone(patch))
      return rec
    },

    remove(table, id) {
      const list = data[table] || []
      const i = list.findIndex((r) => r.id === Number(id))
      if (i < 0) return false
      list.splice(i, 1)
      return true
    },

    nextId(table) {
      return seq[table]
    },

    // 事务：内存里用快照回滚
    async tx(fn) {
      if (snapshot) return fn(repo) // 已在事务中，直接复用
      snapshot = clone({ data, seq })
      try {
        const out = await fn(repo)
        snapshot = null
        return out
      } catch (e) {
        Object.keys(snapshot.data).forEach((t) => { data[t] = snapshot.data[t] })
        Object.keys(snapshot.seq).forEach((t) => { seq[t] = snapshot.seq[t] })
        snapshot = null
        throw e
      }
    },

    // 专用查询（与 mysql 仓库同名同结构）

    /** 工单列表：编号、名称、产品、负责工厂、车间、创建人、末道合格、已入库、进度 */
    async orderList() {
      return data.work_order.map((o) => {
        const item = repo.get('item', o.item_id)
        const fac = repo.get('factory', o.factory_id)
        const ws = repo.get('workshop', o.workshop_id)
        const user = repo.get('sys_user', o.creator_id)
        const tasks = data.order_task.filter((t) => t.order_id === o.id)
        const last = tasks.slice().sort((a, b) => a.seq - b.seq)[tasks.length - 1]
        const done = last ? last.equip_done_qty : 0
        const inbound = last ? last.inbound_qty : 0
        return {
          id: o.id, no: o.no, name: o.name,
          itemId: o.item_id,
          itemCode: item ? item.code : null, itemName: item ? item.name : null,
          planQty: o.plan_qty,
          factoryId: o.factory_id,
          factoryName: fac ? fac.name : null,
          workshopId: o.workshop_id,
          workshopName: ws ? ws.name : null,
          status: o.status, priority: o.priority,
          planStart: o.plan_start, planEnd: o.plan_end,
          creatorId: o.creator_id,
          creatorName: user ? user.name : null,
          createTime: o.create_time, auditTime: o.audit_time,
          remark: o.remark,
          lastDoneQty: done, inboundQty: inbound,
          progressPct: o.plan_qty ? Math.round((done / o.plan_qty) * 1000) / 10 : 0
        }
      })
    },

    /** 某工单的工序进度 */
    async taskProgress(orderId) {
      const tasks = data.order_task.filter((t) => t.order_id === Number(orderId)).sort((a, b) => a.seq - b.seq)
      const order = repo.get('work_order', orderId)
      return tasks.map((t) => {
        const prev = tasks.filter((x) => x.seq < t.seq).sort((a, b) => b.seq - a.seq)[0]
        const prevQual = prev ? prev.equip_done_qty : (order ? order.plan_qty : 0)
        return {
          taskId: t.id, seq: t.seq, processName: t.process_name,
          equipDoneQty: t.equip_done_qty, scrapQty: t.scrap_qty,
          prevQualified: prevQual,
          availableQty: prevQual - t.equip_done_qty - t.scrap_qty,
          wipQty: prevQual - t.equip_done_qty - t.scrap_qty,
          status: t.status
        }
      })
    },

    /** 库存 +/− 汇总 */
    async stockRows() {
      const keys = new Map()
      data.stock_flow.forEach((f) => {
        keys.set(f.warehouse_id + ':' + f.item_id, { w: f.warehouse_id, i: f.item_id })
      })
      return [...keys.values()].map(({ w, i }) => {
        const flows = data.stock_flow.filter((f) => f.warehouse_id === w && f.item_id === i)
        const inQty = flows.filter((f) => f.change_qty > 0).reduce((s, f) => s + Number(f.change_qty), 0)
        const outQty = flows.filter((f) => f.change_qty < 0).reduce((s, f) => s - Number(f.change_qty), 0)
        const item = repo.get('item', i)
        const wh = repo.get('warehouse', w)
        const unit = item ? repo.get('unit', item.unit_id) : null
        const qty = +(inQty - outQty).toFixed(3)
        return {
          warehouseId: w, itemId: i,
          warehouseName: wh ? wh.name : null,
          itemCode: item ? item.code : null, itemName: item ? item.name : null,
          category: item ? item.category : null, spec: item ? item.spec : null,
          unitName: unit ? unit.name : null,
          inQty: +inQty.toFixed(3), outQty: +outQty.toFixed(3), qty,
          safetyStock: item ? item.safety_stock : 0,
          warnFlag: item && qty < item.safety_stock ? '预警' : '正常'
        }
      }).sort((a, b) => a.warehouseId - b.warehouseId || a.itemId - b.itemId)
    },

    /** 出入库流水 */
    async flowList(limit = 200) {
      return data.stock_flow
        .slice()
        .sort((a, b) => (a.flow_time < b.flow_time ? 1 : a.flow_time > b.flow_time ? -1 : b.id - a.id))
        .slice(0, limit)
        .map((f) => {
          const item = repo.get('item', f.item_id)
          const wh = repo.get('warehouse', f.warehouse_id)
          return {
            id: f.id, warehouseId: f.warehouse_id, warehouseName: wh ? wh.name : null,
            itemId: f.item_id, itemCode: item ? item.code : null, itemName: item ? item.name : null,
            changeQty: f.change_qty, balanceAfter: f.balance_after,
            docId: f.doc_id, docType: f.doc_type, flowTime: f.flow_time
          }
        })
    },

    /** 工单物料齐套情况 */
    async materialStatus(orderId) {
      return data.order_material
        .filter((m) => m.order_id === Number(orderId))
        .map((m) => {
          const item = repo.get('item', m.item_id)
          const lack = m.req_qty - m.picked_qty + m.returned_qty
          return {
            id: m.id, orderId: m.order_id, itemId: m.item_id,
            itemCode: item ? item.code : null, itemName: item ? item.name : null,
            reqQty: m.req_qty, pickedQty: m.picked_qty, returnedQty: m.returned_qty,
            lackQty: +lack.toFixed(3),
            status: lack <= 0 ? '已齐套' : '欠料'
          }
        })
    },

    data,
    seq
  }

  return repo
}
