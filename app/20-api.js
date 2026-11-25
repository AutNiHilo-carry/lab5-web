/* 页面只通过这一层读写数据，以后换后端就改这里 */
;(function (MES) {
  const db = MES.db
  const state = db.state
  const byId = db.byId
  const push = db.push
  const EPS = 1e-6

  const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms))

  async function wrap(fn) {
    await delay()
    const result = fn()
    db.save()
    return result
  }

  // 通用 CRUD

  function createRow(table, data) {
    return wrap(() => push(table, { ...data }))
  }

  function updateRow(table, id, data) {
    return wrap(() => {
      const row = byId(table, id)
      if (!row) throw new Error('记录不存在')
      Object.assign(row, data)
      return row
    })
  }

  function removeRow(table, id, guard) {
    return wrap(() => {
      const row = byId(table, id)
      if (!row) throw new Error('记录不存在')
      if (guard) {
        const msg = guard(row)
        if (msg) throw new Error(msg)
      }
      state[table].splice(state[table].findIndex((r) => r.id === id), 1)
      return true
    })
  }

  // 登录：账号密码都在这儿校验，页面只管调

  function login(account, password) {
    return wrap(() => {
      const user = state.user.find((u) => u.account === account)
      if (!user) throw new Error('账号或密码错误')
      if (user.status !== '启用') throw new Error('该账号已被停用')
      if (String(user.password) !== String(password)) throw new Error('账号或密码错误')
      const copy = { ...user }
      delete copy.password
      return copy
    })
  }

  // 工单

  function nextSerial() {
    const today = MES.now().slice(0, 10).replace(/-/g, '')
    const sameDay = state.workOrder.filter((o) => o.no.indexOf(today) >= 0).length
    return `${today}-${String(sameDay + 1).padStart(3, '0')}`
  }

  function createOrder(payload) {
    return wrap(() => {
      if (!payload.name || !String(payload.name).trim()) throw new Error('请填写工单名称')
      if (!payload.itemId) throw new Error('请选择生产的产品')
      if (!payload.planQty || Number(payload.planQty) <= 0) throw new Error('计划数量必须大于 0')
      if (!payload.factoryId) throw new Error('请选择负责生产的工厂')
      if (!payload.workshopId) throw new Error('请选择主要车间')
      return push('workOrder', {
        no: `WO-${nextSerial()}`,
        name: String(payload.name).trim(),
        itemId: payload.itemId,
        planQty: Number(payload.planQty),
        factoryId: payload.factoryId,
        workshopId: payload.workshopId,
        status: '草稿',
        planStart: payload.planStart,
        planEnd: payload.planEnd,
        priority: payload.priority || '中',
        creatorId: payload.creatorId,
        createTime: MES.now(),
        auditTime: null,
        remark: payload.remark || ''
      })
    })
  }

  /** 审核下达：把 BOM 物料需求与工艺路线工序复制到工单 */
  function auditOrder(orderId) {
    return wrap(() => {
      const order = byId('workOrder', orderId)
      if (!order) throw new Error('工单不存在')
      if (order.status !== '草稿') throw new Error('只有草稿状态的工单可以审核下达')
      if (state.orderTask.some((t) => t.orderId === orderId)) throw new Error('该工单已存在工序任务')
      // 下达要做两件事：BOM 明细 × 计划数 算出物料需求；
      // 再顺着 BOM 上的 routingId 找到工艺路线，把工序复制成工序任务
      db.buildOrderLines(order)
      order.status = '已下达'
      order.auditTime = MES.now()
      return order
    })
  }

  function deleteOrder(orderId) {
    return wrap(() => {
      const order = byId('workOrder', orderId)
      if (!order) throw new Error('工单不存在')
      if (order.status !== '草稿') throw new Error('只有草稿工单可以删除')
      state.workOrder.splice(state.workOrder.findIndex((o) => o.id === orderId), 1)
      state.orderMaterial = state.orderMaterial.filter((m) => m.orderId !== orderId)
      return true
    })
  }

  function closeOrder(orderId) {
    return wrap(() => {
      const order = byId('workOrder', orderId)
      if (!order) throw new Error('工单不存在')
      if (order.status === '已关闭') throw new Error('工单已关闭')
      if (order.status === '已完工') throw new Error('工单已完工，无需关闭')
      order.status = '已关闭'
      state.orderTask
        .filter((t) => t.orderId === orderId && t.status !== '已完成')
        .forEach((t) => { t.status = '已取消' })
      return order
    })
  }

  /** 派工：在工序任务上补充设备 / 工位 / 工装 / 负责人 / 计划时间 */
  function assignTask(taskId, payload) {
    return wrap(() => {
      const task = byId('orderTask', taskId)
      if (!task) throw new Error('工序任务不存在')
      const order = byId('workOrder', task.orderId)
      if (order && ['已关闭', '已完工'].indexOf(order.status) >= 0) throw new Error('工单已结束，不能派工')
      Object.assign(task, payload)
      if (task.status === '待开始') task.status = '进行中'
      if (order && order.status === '已下达') order.status = '生产中'
      return task
    })
  }

  function prevQualified(task) {
    const order = byId('workOrder', task.orderId)
    const tasks = state.orderTask.filter((t) => t.orderId === task.orderId).sort((a, b) => a.seq - b.seq)
    const idx = tasks.findIndex((t) => t.id === task.id)
    // 第一道没有上一道，就按工单计划数量卡
    if (idx <= 0) return order ? order.planQty : 0
    return tasks[idx - 1].equipDoneQty
  }

  function taskAvailable(task) {
    // 已经报过合格的和报废的都算处理掉了，剩下的才是还能报的
    return +(prevQualified(task) - task.equipDoneQty - task.scrapQty).toFixed(3)
  }

  /** 报工 */
  function addReport(payload) {
    return wrap(() => {
      const task = byId('orderTask', payload.taskId)
      if (!task) throw new Error('工序任务不存在')
      const order = byId('workOrder', task.orderId)
      if (order && ['已关闭', '已完工'].indexOf(order.status) >= 0) throw new Error('工单已结束，不能报工')

      /* 物料齐套校验：还有欠料就不允许开工报工 */
      const lack = state.orderMaterial
        .filter((m) => m.orderId === task.orderId)
        .filter((m) => Number(m.reqQty) - Number(m.pickedQty) > 0)
      if (lack.length) {
        const names = lack.slice(0, 3).map((m) => (byId('item', m.itemId) || {}).name || '物料').join('、')
        throw new Error(`工单还有 ${lack.length} 项物料未领齐（${names}${lack.length > 3 ? ' 等' : ''}），请先生成并确认领料单再报工`)
      }

      const qual = Number(payload.qualQty) || 0
      const scrap = Number(payload.scrapQty) || 0
      if (qual < 0 || scrap < 0) throw new Error('合格数与报废数不能为负数')
      if (qual + scrap <= 0) throw new Error('本次报工数量必须大于 0')

      const available = taskAvailable(task)
      if (qual + scrap > available + EPS) {
        throw new Error(`超出可报工数量：本工序最多还能报 ${available} 台`)
      }

      const rec = push('workReport', {
        orderId: task.orderId,
        taskId: task.id,
        qualQty: qual,
        scrapQty: scrap,
        reporterId: payload.reporterId,
        receiverId: payload.receiverId || null,
        reportTime: MES.now(),
        remark: payload.remark || ''
      })
      task.equipDoneQty = +(task.equipDoneQty + qual).toFixed(3)
      task.scrapQty = +(task.scrapQty + scrap).toFixed(3)
      if (task.equipDoneQty + task.scrapQty >= prevQualified(task) - EPS) {
        task.status = '已完成'
      } else if (task.status === '待开始') {
        task.status = '进行中'
      }
      if (order && order.status === '已下达') order.status = '生产中'
      return rec
    })
  }

  function removeReport(reportId) {
    return wrap(() => {
      const rec = byId('workReport', reportId)
      if (!rec) throw new Error('报工记录不存在')
      const task = byId('orderTask', rec.taskId)
      if (task) {
        task.equipDoneQty = +(task.equipDoneQty - rec.qualQty).toFixed(3)
        task.scrapQty = +(task.scrapQty - rec.scrapQty).toFixed(3)
        if (task.inboundQty > task.equipDoneQty) task.inboundQty = task.equipDoneQty
        if (task.status === '已完成') task.status = '进行中'
      }
      state.workReport.splice(state.workReport.findIndex((r) => r.id === reportId), 1)
      return true
    })
  }

  // 仓储单据

  function docPrefix(docType) {
    return { 采购入库: 'RK', 生产领料: 'LL', 生产退料: 'RL', 成品入库: 'CP', 销售出库: 'XS' }[docType] || 'DJ'
  }

  function createDoc(payload) {
    return wrap(() => {
      if (!payload.docType) throw new Error('请选择业务类型')
      if (!payload.warehouseId) throw new Error('请选择仓库')
      if (['生产领料', '生产退料', '成品入库'].indexOf(payload.docType) >= 0 && !payload.orderId) {
        throw new Error(`${payload.docType}必须关联生产工单`)
      }
      const lines = (payload.lines || []).filter((l) => l.itemId && Number(l.qty) > 0)
      if (!lines.length) throw new Error('请至少录入一行有效明细')

      const today = MES.now().slice(0, 10).replace(/-/g, '')
      const prefix = docPrefix(payload.docType)
      const sameDay = state.stockDoc.filter((d) => d.no.indexOf(prefix) === 0 && d.no.indexOf(today) >= 0).length
      const doc = push('stockDoc', {
        no: `${prefix}-${today}-${String(sameDay + 1).padStart(3, '0')}`,
        docType: payload.docType,
        warehouseId: payload.warehouseId,
        orderId: payload.orderId || null,
        partnerId: payload.partnerId || null,
        amount: ['采购入库', '销售出库'].indexOf(payload.docType) >= 0 ? Number(payload.amount) || 0 : 0,
        status: '草稿',
        creatorId: payload.creatorId,
        createTime: MES.now(),
        confirmTime: null,
        remark: payload.remark || ''
      })
      lines.forEach((l) => push('stockDocDetail', { docId: doc.id, itemId: l.itemId, qty: Number(l.qty) }))
      return doc
    })
  }

  function updateDoc(docId, payload) {
    return wrap(() => {
      const doc = byId('stockDoc', docId)
      if (!doc) throw new Error('单据不存在')
      if (doc.status === '已确认') throw new Error('已确认的单据不能再修改')
      if (payload.warehouseId) doc.warehouseId = payload.warehouseId
      if (payload.orderId !== undefined) doc.orderId = payload.orderId
      if (payload.remark !== undefined) doc.remark = payload.remark
      if (payload.lines) {
        state.stockDocDetail = state.stockDocDetail.filter((l) => l.docId !== docId)
        payload.lines
          .filter((l) => l.itemId && Number(l.qty) > 0)
          .forEach((l) => push('stockDocDetail', { docId, itemId: l.itemId, qty: Number(l.qty) }))
      }
      return doc
    })
  }

  function deleteDoc(docId) {
    return wrap(() => {
      const doc = byId('stockDoc', docId)
      if (!doc) throw new Error('单据不存在')
      if (doc.status === '已确认') throw new Error('已确认的单据不能删除')
      state.stockDoc.splice(state.stockDoc.findIndex((d) => d.id === docId), 1)
      state.stockDocDetail = state.stockDocDetail.filter((l) => l.docId !== docId)
      return true
    })
  }

  /**
   * 确认单据：校验 + 增减库存余额 + 写库存流水
   * 1 草稿不改库存，确认后才生效；2 出库库存不足不允许确认；
   * 3 退料不超过已领未退；4 成品入库不超过最后一道工序合格数；
   * 5 同一张单据重复确认只生效一次。
   */
  function confirmDoc(docId) {
    return wrap(() => {
      const doc = byId('stockDoc', docId)
      if (!doc) throw new Error('单据不存在')
      if (doc.status === '已确认') throw new Error('该单据已确认，不能重复确认')

      const lines = state.stockDocDetail.filter((l) => l.docId === docId)
      if (!lines.length) throw new Error('单据没有任何明细，不能确认')

      const order = doc.orderId ? byId('workOrder', doc.orderId) : null
      if (['生产领料', '生产退料', '成品入库'].indexOf(doc.docType) >= 0 && !order) {
        throw new Error(`${doc.docType}必须关联生产工单`)
      }
      if (order && order.status === '已关闭') {
        throw new Error(`工单 ${order.no} 已关闭，不能再处理它的单据`)
      }

      // 这三类入库记正数，其余（生产领料、销售出库）记负数
      const inbound = ['采购入库', '生产退料', '成品入库'].indexOf(doc.docType) >= 0

      /* 先把所有行验一遍，再动数据 */
      lines.forEach((line) => {
        if (line.qty <= 0) throw new Error('明细数量必须大于 0')
        const item = byId('item', line.itemId)
        const name = item ? `${item.code} ${item.name}` : '未知物料'

        if (!inbound) {
          const balance = db.balanceOf(doc.warehouseId, line.itemId)
          if (balance + EPS < line.qty) {
            throw new Error(`${name} 库存不足：当前 ${balance}，需要 ${line.qty}`)
          }
        }

        if (doc.docType === '生产退料') {
          const mat = state.orderMaterial.find((m) => m.orderId === doc.orderId && m.itemId === line.itemId)
          const returnable = mat ? +(mat.pickedQty - mat.returnedQty).toFixed(3) : 0
          if (line.qty > returnable + EPS) {
            throw new Error(`${name} 退料数量超过可退数量：已领 ${mat ? mat.pickedQty : 0}，已退 ${mat ? mat.returnedQty : 0}`)
          }
        }

        if (doc.docType === '成品入库') {
          const last = state.orderTask
            .filter((t) => t.orderId === doc.orderId)
            .sort((a, b) => b.seq - a.seq)[0]
          // 待入库 = 末道工序合格数 − 已经入过库的数量
          const waitQty = last ? +(last.equipDoneQty - last.inboundQty).toFixed(3) : 0
          if (line.qty > waitQty + EPS) {
            throw new Error(`${name} 入库数量超过待入库数量：当前待入库 ${waitQty}`)
          }
        }
      })

      /* 执行 */
      lines.forEach((line) => {
        db.moveStock(doc.warehouseId, line.itemId, inbound ? line.qty : -line.qty, doc, MES.now())
        if (doc.docType === '生产领料') {
          const mat = state.orderMaterial.find((m) => m.orderId === doc.orderId && m.itemId === line.itemId)
          if (mat) mat.pickedQty = +(mat.pickedQty + line.qty).toFixed(3)
        }
        if (doc.docType === '生产退料') {
          const mat = state.orderMaterial.find((m) => m.orderId === doc.orderId && m.itemId === line.itemId)
          if (mat) mat.returnedQty = +(mat.returnedQty + line.qty).toFixed(3)
        }
        if (doc.docType === '成品入库') {
          const last = state.orderTask
            .filter((t) => t.orderId === doc.orderId)
            .sort((a, b) => b.seq - a.seq)[0]
          if (last) last.inboundQty = +(last.inboundQty + line.qty).toFixed(3)
        }
      })

      doc.status = '已确认'
      doc.confirmTime = MES.now()

      /* 最后一道工序合格品全部入库后，工单自动完工 */
      if (order && doc.docType === '成品入库') {
        const last = state.orderTask
          .filter((t) => t.orderId === order.id)
          .sort((a, b) => b.seq - a.seq)[0]
        if (last && last.equipDoneQty > 0 && last.inboundQty >= last.equipDoneQty - EPS) {
          order.status = '已完工'
        }
      }
      return doc
    })
  }

  /** 一键生成"成品入库"草稿单（按待入库数量） */
  function createInboundDocForOrder(orderId, userId) {
    return wrap(() => {
      const order = byId('workOrder', orderId)
      if (!order) throw new Error('工单不存在')
      const last = state.orderTask
        .filter((t) => t.orderId === orderId)
        .sort((a, b) => b.seq - a.seq)[0]
      if (!last) throw new Error('该工单还没有工序任务')
      // 只看最后一道工序：合格了多少、已经入库多少，差额才是能入的
      const waitQty = +(last.equipDoneQty - last.inboundQty).toFixed(3)
      if (waitQty <= 0) throw new Error('当前没有待入库的合格品')

      const wh = state.warehouse.find((w) => w.type === '成品库')
      if (!wh) throw new Error('未找到成品库')

      const today = MES.now().slice(0, 10).replace(/-/g, '')
      const sameDay = state.stockDoc.filter((d) => d.no.indexOf('CP') === 0 && d.no.indexOf(today) >= 0).length
      const doc = push('stockDoc', {
        no: `CP-${today}-${String(sameDay + 1).padStart(3, '0')}`,
        docType: '成品入库',
        warehouseId: wh.id,
        orderId,
        status: '草稿',
        creatorId: userId,
        createTime: MES.now(),
        confirmTime: null,
        remark: `工单 ${order.no} 成品入库`
      })
      push('stockDocDetail', { docId: doc.id, itemId: order.itemId, qty: waitQty })
      return doc
    })
  }

  // 库存汇总

  /**
   * 单个"仓库 + 物料"的库存汇总：入库合计(+)、出库合计(−)、当前结存。
   * 结存不读余额表、也不存初值，直接由流水累加，页面上看到的就是这个数
   */
  function stockSummary(warehouseId, itemId) {
    const flows = state.stockFlow.filter(
      (f) => f.warehouseId === warehouseId && f.itemId === itemId
    )
    const inQty = flows.reduce((s, f) => s + (f.changeQty > 0 ? f.changeQty : 0), 0)
    const outQty = flows.reduce((s, f) => s + (f.changeQty < 0 ? -f.changeQty : 0), 0)
    return {
      inQty: +inQty.toFixed(3),
      outQty: +outQty.toFixed(3),
      qty: +(inQty - outQty).toFixed(3),
      flowCount: flows.length
    }
  }

  /** 库存余额页面用的行数据：只列出有出入库记录的"仓库 + 物料"组合 */
  function stockRows() {
    const keys = new Map()
    state.stockFlow.forEach((f) => {
      const k = f.warehouseId + ':' + f.itemId
      if (!keys.has(k)) keys.set(k, { warehouseId: f.warehouseId, itemId: f.itemId })
    })
    return [...keys.values()]
      .map(({ warehouseId, itemId }) => {
        const wh = byId('warehouse', warehouseId)
        const it = byId('item', itemId)
        const sum = stockSummary(warehouseId, itemId)
        const unit = it ? byId('unit', it.unitId) : null
        return {
          id: warehouseId + '-' + itemId,
          warehouseId,
          itemId,
          warehouseName: wh ? wh.name : '-',
          itemCode: it ? it.code : '-',
          itemName: it ? it.name : '-',
          category: it ? it.category : '',
          unitName: unit ? unit.name : '',
          spec: it ? it.spec : '',
          safetyStock: it ? it.safetyStock : 0,
          inQty: sum.inQty,
          outQty: sum.outQty,
          qty: sum.qty,
          warn: it ? sum.qty < it.safetyStock : false
        }
      })
      .sort((a, b) => a.warehouseId - b.warehouseId || a.itemId - b.itemId)
  }

  // 演示数据

  function resetDemoData() {
    return wrap(() => {
      db.reset()
      return true
    })
  }

  MES.api = {
    createRow,
    updateRow,
    removeRow,
    login,
    createOrder,
    auditOrder,
    deleteOrder,
    closeOrder,
    assignTask,
    addReport,
    removeReport,
    prevQualified,
    taskAvailable,
    createDoc,
    updateDoc,
    deleteDoc,
    confirmDoc,
    createInboundDocForOrder,
    stockSummary,
    stockRows,
    resetDemoData
  }
})(window.MES)

