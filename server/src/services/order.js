/* 工单：建单、审核下达、派工、关闭、删除
 * 下达时按 BOM 明细×计划数生成物料需求，再顺着 bom.routing_id 取路线复制工序
 */

import { badRequest, notFound, conflict } from '../lib/errors.js'
import { apiToRow, rowToApi } from '../lib/convert.js'
import { columnsOf, requiredOf, cnOf } from '../lib/schema.js'

const EPS = 1e-6
const pad3 = (n) => String(n).padStart(3, '0')
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')
const now = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// 建单

export async function createOrder(repo, payload) {
  const name = String(payload.name || '').trim()
  if (!name) throw badRequest('请填写工单名称')
  if (!payload.itemId) throw badRequest('请选择生产的产品')
  if (!payload.planQty || Number(payload.planQty) <= 0) throw badRequest('计划数量必须大于 0')
  if (!payload.factoryId) throw badRequest('请选择负责生产的工厂')
  if (!payload.workshopId) throw badRequest('请选择生产车间')

  const item = await repo.get('item', payload.itemId)
  if (!item) throw badRequest('产品不存在')
  const factory = await repo.get('factory', payload.factoryId)
  if (!factory) throw badRequest('工厂不存在')
  const workshop = await repo.get('workshop', payload.workshopId)
  if (!workshop) throw badRequest('车间不存在')
  if (Number(workshop.factory_id) !== Number(payload.factoryId)) {
    throw badRequest(`车间「${workshop.name}」不属于工厂「${factory.name}」`)
  }

  /* 编号：WO-日期-当日流水 */
  const all = await repo.all('work_order')
  const prefix = 'WO-' + today()
  const sameDay = all.filter((o) => String(o.no || '').indexOf(prefix) === 0).length
  const no = `${prefix}-${pad3(sameDay + 1)}`

  const row = {
    no,
    name,
    item_id: Number(payload.itemId),
    plan_qty: Number(payload.planQty),
    factory_id: Number(payload.factoryId),
    workshop_id: Number(payload.workshopId),
    status: '草稿',
    plan_start: payload.planStart || null,
    plan_end: payload.planEnd || null,
    creator_id: payload.creatorId ? Number(payload.creatorId) : null,
    create_time: now(),
    audit_time: null,
    priority: payload.priority || '中',
    remark: payload.remark || ''
  }
  const rec = await repo.insert('work_order', row)
  return rowToApi(rec)
}

// 审核下达

export async function auditOrder(repo, orderId) {
  return repo.tx(async (tx) => {
    const order = await tx.get('work_order', orderId)
    if (!order) throw notFound('工单不存在')
    if (order.status !== '草稿') throw conflict('只有草稿状态的工单可以审核下达')

    const exist = await tx.find('order_task', { order_id: order.id })
    if (exist.length) throw conflict('该工单已存在工序任务')

    // 先按产品找启用的 BOM
    const boms = await tx.find('bom', { item_id: order.item_id, status: '启用' })
    const bom = boms[0]
    if (!bom) throw badRequest('该产品未维护有效的物料清单（BOM），无法下达')

    // 路线挂在 BOM 上，不在产品上
    if (!bom.routing_id) throw badRequest('该产品的 BOM 未指定工艺路线，无法下达')
    const routing = await tx.get('routing', bom.routing_id)
    if (!routing) throw badRequest('BOM 指定的工艺路线不存在，无法下达')
    if (routing.status !== '启用') throw badRequest(`工艺路线「${routing.no}」已停用，无法下达`)

    const details = await tx.find('routing_detail', { routing_id: routing.id })
    if (!details.length) throw badRequest(`工艺路线「${routing.no}」没有工序明细，无法下达`)

    // 物料需求 = 单件用量 × 计划数量
    const bomDetails = await tx.find('bom_detail', { bom_id: bom.id })
    if (!bomDetails.length) throw badRequest('该 BOM 没有明细，无法下达')
    for (const d of bomDetails) {
      await tx.insert('order_material', {
        order_id: order.id,
        item_id: d.item_id,
        req_qty: +(Number(d.qty_per_unit) * Number(order.plan_qty)).toFixed(3),
        picked_qty: 0,
        returned_qty: 0
      })
    }

    // 把路线里的工序复制成这张工单自己的工序任务
    const sorted = details.slice().sort((a, b) => a.seq - b.seq)
    for (const d of sorted) {
      await tx.insert('order_task', {
        order_id: order.id,
        seq: d.seq,
        process_name: d.process_name,
        equipment_type: d.equipment_type || null,
        plan_qty: order.plan_qty,
        equip_done_qty: 0,
        scrap_qty: 0,
        equipment_id: null,
        workstation_id: d.workstation_id || null,
        tooling_id: null,
        owner_id: null,
        plan_start: null,
        plan_end: null,
        status: '待开始',
        inbound_qty: 0,
        remark: ''
      })
    }

    const updated = await tx.update('work_order', order.id, {
      status: '已下达',
      audit_time: now()
    })
    return {
      order: rowToApi(updated),
      materialCount: bomDetails.length,
      taskCount: sorted.length,
      routing: { id: routing.id, no: routing.no, name: routing.name }
    }
  })
}

// 派工

export async function assignTask(repo, taskId, payload) {
  return repo.tx(async (tx) => {
    const task = await tx.get('order_task', taskId)
    if (!task) throw notFound('工序任务不存在')
    const order = await tx.get('work_order', task.order_id)
    if (!order) throw notFound('工单不存在')
    if (['已完工', '已关闭'].indexOf(order.status) >= 0) throw conflict('工单已结束，不能派工')

    const patch = {}
    if (payload.ownerId !== undefined) patch.owner_id = payload.ownerId ? Number(payload.ownerId) : null
    if (payload.equipmentId !== undefined) patch.equipment_id = payload.equipmentId ? Number(payload.equipmentId) : null
    if (payload.workstationId !== undefined) patch.workstation_id = payload.workstationId ? Number(payload.workstationId) : null
    if (payload.toolingId !== undefined) patch.tooling_id = payload.toolingId ? Number(payload.toolingId) : null
    if (payload.planStart !== undefined) patch.plan_start = payload.planStart || null
    if (payload.planEnd !== undefined) patch.plan_end = payload.planEnd || null
    if (!patch.owner_id) throw badRequest('请选择负责人')

    if (task.status === '待开始') patch.status = '进行中'
    const updated = await tx.update('order_task', task.id, patch)

    if (order.status === '已下达') {
      await tx.update('work_order', order.id, { status: '生产中' })
    }
    return rowToApi(updated)
  })
}

// 关闭

export async function closeOrder(repo, orderId, payload = {}) {
  return repo.tx(async (tx) => {
    const order = await tx.get('work_order', orderId)
    if (!order) throw notFound('工单不存在')
    if (order.status === '已关闭') throw conflict('工单已经关闭')
    if (order.status === '草稿') throw conflict('草稿工单请直接删除，无需关闭')
    const updated = await tx.update('work_order', order.id, {
      status: '已关闭',
      remark: payload.remark || order.remark || ''
    })
    return rowToApi(updated)
  })
}

// 删除

export async function deleteOrder(repo, orderId) {
  return repo.tx(async (tx) => {
    const order = await tx.get('work_order', orderId)
    if (!order) throw notFound('工单不存在')
    if (order.status !== '草稿') throw conflict('只有草稿工单可以删除')
    const tasks = await tx.find('order_task', { order_id: order.id })
    if (tasks.length) throw conflict('该工单已有工序任务，不能删除')

    for (const m of await tx.find('order_material', { order_id: order.id })) {
      await tx.remove('order_material', m.id)
    }
    await tx.remove('work_order', order.id)
    return { ok: true }
  })
}

// 工单详情

export async function getOrderDetail(repo, orderId) {
  const order = await repo.get('work_order', orderId)
  if (!order) throw notFound('工单不存在')
  const item = await repo.get('item', order.item_id)
  const factory = await repo.get('factory', order.factory_id)
  const workshop = await repo.get('workshop', order.workshop_id)
  const creator = order.creator_id ? await repo.get('sys_user', order.creator_id) : null
  const materials = await repo.materialStatus(order.id)
  const tasks = await repo.taskProgress(order.id)
  const last = tasks.length ? tasks[tasks.length - 1] : null

  return {
    order: {
      ...rowToApi(order),
      itemCode: item ? item.code : null,
      itemName: item ? item.name : null,
      unitName: item ? (await repo.get('unit', item.unit_id) || {}).name : null,
      factoryName: factory ? factory.name : null,
      workshopName: workshop ? workshop.name : null,
      creatorName: creator ? creator.name : null
    },
    materials,
    tasks,
    summary: {
      lastDoneQty: last ? last.equipDoneQty : 0,
      inboundQty: last ? (await repo.get('order_task', last.taskId)).inbound_qty : 0,
      waitInbound: last
        ? Math.max(0, last.equipDoneQty - ((await repo.get('order_task', last.taskId)).inbound_qty || 0))
        : 0
    }
  }
}

// 通用 CRUD

export async function saveOrder(repo, id, payload) {
  const cols = columnsOf('work_order')
  const row = apiToRow(payload, cols)
  if (!row.name || !String(row.name).trim()) throw badRequest('请填写工单名称')
  if (row.plan_qty !== undefined && Number(row.plan_qty) <= 0) throw badRequest('计划数量必须大于 0')
  if (row.factory_id !== undefined) {
    const ws = await repo.get('workshop', row.workshop_id || 0)
    if (ws && Number(ws.factory_id) !== Number(row.factory_id)) {
      throw badRequest(`车间「${ws.name}」不属于所选工厂`)
    }
  }
  const updated = await repo.update('work_order', id, row)
  if (!updated) throw notFound('工单不存在')
  return rowToApi(updated)
}

export { EPS, requiredOf, cnOf }
