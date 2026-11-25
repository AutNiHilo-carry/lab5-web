/* 报工：累加合格和报废，卡住"不能超上道合格数"
 * 首道上限是计划数量，其余是上一道累计合格；本道已处理 = 合格 + 报废
 */

import { badRequest, notFound, conflict } from '../lib/errors.js'
import { rowToApi } from '../lib/convert.js'

const EPS = 1e-6
const now = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 上道工序合格数（首道取工单计划数量） */
export async function prevQualified(repo, task) {
  const tasks = await repo.find('order_task', { order_id: task.order_id })
  const prev = tasks
    .filter((t) => Number(t.seq) < Number(task.seq))
    .sort((a, b) => Number(b.seq) - Number(a.seq))[0]
  if (prev) return Number(prev.equip_done_qty)
  const order = await repo.get('work_order', task.order_id)
  return order ? Number(order.plan_qty) : 0
}

/** 本道还可报工的合格数量 */
export async function taskAvailable(repo, task) {
  const prev = await prevQualified(repo, task)
  // 合格 + 报废都算占到料了，剩下的才是还能报的
  return Math.max(0, prev - Number(task.equip_done_qty) - Number(task.scrap_qty))
}

export async function addReport(repo, payload) {
  return repo.tx(async (tx) => {
    const task = await tx.get('order_task', payload.taskId)
    if (!task) throw notFound('工序任务不存在')
    const order = await tx.get('work_order', task.order_id)
    if (!order) throw notFound('工单不存在')
    if (['已完工', '已关闭'].indexOf(order.status) >= 0) throw conflict('工单已结束，不能报工')

    /* 物料齐套校验：还有欠料就不允许开工报工 */
    const materials = await tx.materialStatus(task.order_id)
    /* 只按“已领 vs 需求”判断：退料不会让已领料的事实失效 */
    const lack = materials.filter((m) => Number(m.reqQty) - Number(m.pickedQty) > 0)
    if (lack.length) {
      throw badRequest(
        `工单还有 ${lack.length} 项物料未领齐（${lack.slice(0, 3).map((m) => m.itemName).join('、')}` +
        `${lack.length > 3 ? ' 等' : ''}），请先生成并确认领料单再报工`
      )
    }

    const qual = Number(payload.qualQty || 0)
    const scrap = Number(payload.scrapQty || 0)
    if (qual < 0 || scrap < 0) throw badRequest('合格数与报废数不能为负')
    if (qual + scrap <= 0) throw badRequest('合格数与报废数不能同时为 0')

    const available = await taskAvailable(tx, task)
    if (qual + scrap > available + EPS) {
      throw badRequest(
        `第 ${task.seq} 道「${task.process_name}」可报工数量为 ${available}，` +
        `本次申报 ${qual + scrap}（合格 ${qual} + 报废 ${scrap}），超出上道合格数`
      )
    }
    if (qual + scrap > Number(task.plan_qty) + EPS) {
      throw badRequest('报工数量不能超过计划数量')
    }

    const report = await tx.insert('work_report', {
      order_id: task.order_id,
      task_id: task.id,
      qual_qty: qual,
      scrap_qty: scrap,
      reporter_id: payload.reporterId ? Number(payload.reporterId) : null,
      receiver_id: payload.receiverId ? Number(payload.receiverId) : null,
      report_time: payload.reportTime || now(),
      remark: payload.remark || ''
    })

    const doneQty = Number(task.equip_done_qty) + qual
    const scrapQty = Number(task.scrap_qty) + scrap
    /* 本道把上一道移交的合格品全部处理完（合格+报废）即视为完成；首道按工单计划数 */
    const prevQty = await prevQualified(tx, task)
    const finished = doneQty + scrapQty >= prevQty - EPS
    const patch = {
      equip_done_qty: doneQty,
      scrap_qty: scrapQty,
      status: finished ? '已完成' : (task.status === '待开始' ? '进行中' : task.status)
    }
    const updated = await tx.update('order_task', task.id, patch)

    if (order.status === '已下达') await tx.update('work_order', order.id, { status: '生产中' })

    return {
      report: rowToApi(report),
      task: rowToApi(updated),
      available: Math.max(0, (await prevQualified(tx, updated)) - doneQty - scrapQty)
    }
  })
}

export async function removeReport(repo, reportId) {
  return repo.tx(async (tx) => {
    const report = await tx.get('work_report', reportId)
    if (!report) throw notFound('报工记录不存在')
    const task = await tx.get('order_task', report.task_id)
    if (task) {
      const doneQty = Math.max(0, Number(task.equip_done_qty) - Number(report.qual_qty))
      const scrapQty = Math.max(0, Number(task.scrap_qty) - Number(report.scrap_qty))
      const patch = { equip_done_qty: doneQty, scrap_qty: scrapQty }
      patch.status = doneQty + scrapQty <= EPS ? '待开始' : '进行中'
      await tx.update('order_task', task.id, patch)
    }
    await tx.remove('work_report', report.id)
    return { ok: true }
  })
}

/** 报工记录列表（带工单/工序/报工人名称） */
export async function listReports(repo, { orderId, taskId, limit = 200 } = {}) {
  const all = await repo.all('work_report')
  const rows = all
    .filter((r) => (orderId ? Number(r.order_id) === Number(orderId) : true))
    .filter((r) => (taskId ? Number(r.task_id) === Number(taskId) : true))
    .sort((a, b) => (a.report_time < b.report_time ? 1 : a.report_time > b.report_time ? -1 : b.id - a.id))
    .slice(0, Number(limit))

  const out = []
  for (const r of rows) {
    const task = await repo.get('order_task', r.task_id)
    const order = await repo.get('work_order', r.order_id)
    const user = r.reporter_id ? await repo.get('sys_user', r.reporter_id) : null
    const receiver = r.receiver_id ? await repo.get('sys_user', r.receiver_id) : null
    out.push({
      ...rowToApi(r),
      orderNo: order ? order.no : null,
      orderName: order ? order.name : null,
      seq: task ? task.seq : null,
      processName: task ? task.process_name : null,
      reporterName: user ? user.name : null,
      receiverName: receiver ? receiver.name : null,
      scrapRate: (Number(r.qual_qty) + Number(r.scrap_qty)) > 0
        ? +((Number(r.scrap_qty) / (Number(r.qual_qty) + Number(r.scrap_qty))) * 100).toFixed(2)
        : 0
    })
  }
  return out
}

/** 工序任务列表（带工单信息与可报工数量） */
export async function listTasks(repo, { orderId, ownerId, status } = {}) {
  const all = await repo.all('order_task')
  const rows = all
    .filter((t) => (orderId ? Number(t.order_id) === Number(orderId) : true))
    .filter((t) => (ownerId ? Number(t.owner_id) === Number(ownerId) : true))
    .filter((t) => (status ? t.status === status : true))
    .sort((a, b) => Number(a.order_id) - Number(b.order_id) || Number(a.seq) - Number(b.seq))

  const out = []
  for (const t of rows) {
    const order = await repo.get('work_order', t.order_id)
    const owner = t.owner_id ? await repo.get('sys_user', t.owner_id) : null
    const equipment = t.equipment_id ? await repo.get('equipment', t.equipment_id) : null
    const available = await taskAvailable(repo, t)
    out.push({
      ...rowToApi(t),
      orderNo: order ? order.no : null,
      orderName: order ? order.name : null,
      itemId: order ? order.item_id : null,
      ownerName: owner ? owner.name : null,
      equipmentName: equipment ? equipment.name : null,
      availableQty: available
    })
  }
  return out
}
