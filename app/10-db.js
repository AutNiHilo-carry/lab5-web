/* 数据层：用 localStorage 模拟数据库，表结构对应需求文档中的设计 */
;(function (MES) {
  const { reactive } = Vue

  const STORAGE_KEY = 'lab5-mes-db-v2'

  const TABLES = [
    'factory', 'workshop', 'department', 'warehouse', 'role', 'user', 'unit', 'item', 'partner',
    'equipment', 'workstation', 'tooling',
    'routing', 'routingDetail', 'bom', 'bomDetail',
    'workOrder', 'orderMaterial', 'orderTask', 'workReport',
    'stockDoc', 'stockDocDetail', 'stockBalance', 'stockFlow'
  ]

  MES.TABLES = TABLES

  function emptyDb() {
    const db = { seq: {}, _meta: { seededAt: MES.now() } }
    TABLES.forEach((t) => { db[t] = []; db.seq[t] = 0 })
    return db
  }

  const state = reactive(emptyDb())

  // 基础工具

  function nextId(table) {
    state.seq[table] = (state.seq[table] || 0) + 1
    return state.seq[table]
  }

  function byId(table, id) {
    return state[table].find((r) => r.id === id) || null
  }

  function nameOf(table, id, field = 'name') {
    const row = byId(table, id)
    return row ? row[field] : '-'
  }

  function itemLabel(itemId) {
    const it = byId('item', itemId)
    return it ? `${it.code} ${it.name}` : '-'
  }

  function balanceOf(warehouseId, itemId) {
    const row = state.stockBalance.find((b) => b.warehouseId === warehouseId && b.itemId === itemId)
    return row ? row.qty : 0
  }

  function push(table, row) {
    const id = nextId(table)
    const rec = { id, ...row }
    state[table].push(rec)
    return rec
  }

  function upsertBalance(warehouseId, itemId, changeQty = 0) {
    let row = state.stockBalance.find((b) => b.warehouseId === warehouseId && b.itemId === itemId)
    if (!row) row = push('stockBalance', { warehouseId, itemId, qty: 0 })
    row.qty = +(row.qty + changeQty).toFixed(3)
    return row
  }

  /* 库存唯一的写入口：先改余额，再记一条流水。
     入库传正数、出库传负数；余额行没有就顺带建一条 */
  function moveStock(warehouseId, itemId, changeQty, doc, time) {
    const row = upsertBalance(warehouseId, itemId, changeQty)
    push('stockFlow', {
      warehouseId,
      itemId,
      changeQty,
      balanceAfter: row.qty,
      docId: doc ? doc.id : null,
      docType: doc ? doc.docType : '手动调整',
      time: time || MES.now()
    })
    return row
  }

  // 持久化

  let saveTimer = null

  function save() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        const snap = { seq: state.seq, _meta: state._meta }
        TABLES.forEach((t) => { snap[t] = state[t] })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
      } catch (e) {
        console.warn('本地存储写入失败', e)
      }
    }, 120)
  }

  function applySnapshot(snap) {
    TABLES.forEach((t) => {
      state[t] = Array.isArray(snap[t]) ? snap[t] : []
      state.seq[t] = snap.seq && snap.seq[t] !== undefined
        ? snap.seq[t]
        : state[t].reduce((m, r) => Math.max(m, r.id || 0), 0)
    })
    state._meta = snap._meta || { seededAt: MES.now() }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      applySnapshot(JSON.parse(raw))
      return state.workOrder.length > 0
    } catch (e) {
      console.warn('本地数据读取失败，改用示例数据', e)
      return false
    }
  }

  function reset() {
    applySnapshot(emptyDb())
    seed()
    save()
  }

  // 演示数据

  function seed() {
    // 工厂 / 车间 / 仓库
    push('factory', { code: 'F01', name: '星航无人机总装厂', address: '深圳市南山区科技园北区 8 号', contact: '0755-8666 8888', leader: '周建国', remark: '整机总装与检测基地' })
    push('factory', { code: 'F02', name: '星航精密结构件厂', address: '东莞市松山湖工业园 3 号', contact: '0769-2233 4455', leader: '吴海涛', remark: '结构件加工' })

    push('workshop', { code: 'WS01', name: '机加工车间', factoryId: 1, leader: '赵磊', remark: '下料、折弯、组框' })
    push('workshop', { code: 'WS02', name: '总装车间', factoryId: 1, leader: '王强', remark: '整机装配与电气安装' })
    push('workshop', { code: 'WS03', name: '质量检测车间', factoryId: 1, leader: '孙悦', remark: '调试、检测、包装' })

    // 部门（与车间平级，同属工厂）
    push('department', { code: 'DP01', name: '生产计划部', factoryId: 1, leader: '李彦', remark: '工单编制与下达' })
    push('department', { code: 'DP02', name: '采购部', factoryId: 1, leader: '钱伟', remark: '原材料采购与供应商管理' })
    push('department', { code: 'DP03', name: '仓储物流部', factoryId: 1, leader: '陈静', remark: '仓库与出入库单据' })
    push('department', { code: 'DP04', name: '质量部', factoryId: 1, leader: '孙悦', remark: '来料、过程与成品检验' })
    push('department', { code: 'DP05', name: '销售部', factoryId: 1, leader: '赵敏', remark: '客户与销售出库' })

    push('warehouse', { code: 'WH01', name: '原材料仓', factoryId: 1, type: '原料库', leader: '陈静', remark: '电机、桨叶、结构件等' })
    push('warehouse', { code: 'WH02', name: '成品仓', factoryId: 1, type: '成品库', leader: '陈静', remark: '待发货整机' })
    push('warehouse', { code: 'WH03', name: '半成品仓', factoryId: 1, type: '半成品库', leader: '陈静', remark: '机架总成等在制品' })

    // 角色 / 用户
    push('role', { code: 'R01', name: '系统管理员', remark: '全部权限', perms: ['*'] })
    push('role', { code: 'R02', name: '计划员', remark: '建单、下达工单、派工', perms: ["dashboard", "base/factory", "base/partner", "base/item", "tech/bom", "tech/routing", "prod/order", "prod/wip", "prod/task", "prod/progress", "wms/doc", "wms/stock", "about"] })
    push('role', { code: 'R03', name: '操作员', remark: '按工序报工', perms: ["dashboard", "prod/order", "prod/wip", "prod/task", "prod/report", "about"] })
    push('role', { code: 'R04', name: '仓管员', remark: '出入库单据办理', perms: ["dashboard", "base/warehouse", "base/item", "wms/doc", "wms/stock", "wms/flow", "about"] })

    push('user', { account: 'admin', name: '张明', roleId: 1, departmentId: null, workshopId: null, phone: '13800000001', status: '启用', password: '123456' })
    push('user', { account: 'planner', name: '李彦', roleId: 2, departmentId: 1, workshopId: null, phone: '13800000002', status: '启用', password: '123456' })
    push('user', { account: 'op_assembly', name: '王强', roleId: 3, departmentId: null, workshopId: 2, phone: '13800000003', status: '启用', password: '123456' })
    push('user', { account: 'op_machining', name: '赵磊', roleId: 3, departmentId: null, workshopId: 1, phone: '13800000004', status: '启用', password: '123456' })
    push('user', { account: 'op_quality', name: '孙悦', roleId: 3, departmentId: 4, workshopId: null, phone: '13800000005', status: '启用', password: '123456' })
    push('user', { account: 'warehouse', name: '陈静', roleId: 4, departmentId: 3, workshopId: null, phone: '13800000006', status: '启用', password: '123456' })

    // 计量单位
    ;[['U01', '台'], ['U02', '个'], ['U03', '套'], ['U04', '米'], ['U05', '块'], ['U06', '卷']]
      .forEach(([code, name]) => push('unit', { code, name, remark: '' }))

    // 产品物料
    const items = [
      ['FG-001', '玄鸟 X4 四旋翼巡检无人机', '成品', 1, '轴距 450mm', 5, '旗舰巡检机型', '整机', 12000],
      ['FG-002', '玄武 X6 六旋翼载重无人机', '成品', 1, '轴距 680mm', 3, '重载平台', '整机', 26000],
      ['SF-001', '玄鸟 X4 碳纤维机架总成', '半成品', 3, '碳纤维折叠机架', 10, '巡检机自制结构件', '结构件', 600],
      ['RM-001', '无刷电机 2212', '原材料', 2, '920KV', 200, '', '动力件', 180],
      ['RM-002', '螺旋桨 9450', '原材料', 2, '自紧桨', 400, '', '动力件', 25],
      ['RM-003', '电子调速器 30A', '原材料', 2, '支持 PWM', 200, '', '电子件', 60],
      ['RM-004', '飞控主板 PX4', '原材料', 2, '带 GPS 模块', 50, '', '电子件', 900],
      ['RM-005', '锂电池 4S 5200mAh', '原材料', 5, '25C 放电', 30, '', '动力件', 320],
      ['RM-006', '碳纤维方管 16mm', '原材料', 4, '3K 斜纹', 300, '', '结构件', 45],
      ['RM-007', '内六角螺丝 M3*8', '原材料', 2, '不锈钢', 5000, '', '标准件', 0.05],
      ['RM-008', '折叠机臂', '原材料', 2, '含折叠件', 100, '', '结构件', 120],
      ['RM-009', '三轴云台相机', '原材料', 2, '4K 变焦', 20, '', '电子件', 1500],
      ['RM-010', '铝合金包装箱', '原材料', 2, '带防震棉', 40, '']
    ]
    items.forEach(([code, name, category, unitId, spec, safetyStock, remark, subCategory, refPrice]) =>
      push('item', { code, name, category, subCategory, unitId, spec, safetyStock, refPrice, remark }))

    const ITEM = {}
    state.item.forEach((i) => { ITEM[i.code] = i.id })

    // 供应商 / 客户
    ;[
      ['SUP-001', '深圳市瑞达电机有限公司', '供应商', '周立', '0755-8123 4567', '深圳市宝安区福永街道 12 号', '电机、电调速器主供'],
      ['SUP-002', '东莞市恒力复材有限公司', '供应商', '林芳', '0769-8877 6655', '东莞市松山湖工业园 6 号', '碳纤维方管、机臂'],
      ['SUP-003', '广州市芯航电子有限公司', '供应商', '黄强', '020-6688 9900', '广州市黄埔区科学城 3 号', '飞控主板、云台相机'],
      ['CUS-001', '深圳市天翼巡检科技有限公司', '客户', '吴敏', '0755-8999 1122', '深圳市南山区高新南一道 5 号', '巡检服务商，长期客户'],
      ['CUS-002', '东莞市电力巡维中心', '客户', '郑海', '0769-2211 3344', '东莞市南城区莞太路 88 号', '电网巡检项目']
    ].forEach(([code, name, partnerType, contact, phone, address, remark]) =>
      push('partner', { code, name, partnerType, contact, phone, address, remark }))

    // 工艺路线（通用工序模板，不绑定产品，由 BOM 引用）
    const rt1 = push('routing', { no: 'RT-X4-01', name: '四旋翼总装标准路线', version: 'V1.0', status: '启用', remark: '备料→装配→电气→调试→检测→包装' })
    const rt2 = push('routing', { no: 'RT-X6-01', name: '六旋翼总装标准路线', version: 'V1.0', status: '启用', remark: '含载重测试工序' })
    const rt3 = push('routing', { no: 'RT-FRAME-01', name: '机架总成加工路线', version: 'V1.0', status: '启用', remark: '下料→组框→加固' })

    const routingRows = [
      [rt1.id, 1, '备料下料', '激光切割机', 1, 30],
      [rt1.id, 2, '机架装配', '电动装配台', 2, 60],
      [rt1.id, 3, '电气安装', '智能电批', 3, 45],
      [rt1.id, 4, '整机调试', '综合测试台', 4, 40],
      [rt1.id, 5, '整机检测', '综合测试台', 5, 20],
      [rt1.id, 6, '包装入库', '无', 6, 15],
      [rt2.id, 1, '备料下料', '激光切割机', 1, 35],
      [rt2.id, 2, '机架装配', '电动装配台', 2, 75],
      [rt2.id, 3, '电气安装', '智能电批', 3, 60],
      [rt2.id, 4, '整机调试', '综合测试台', 4, 50],
      [rt2.id, 5, '载重测试', '综合测试台', 5, 30],
      [rt2.id, 6, '包装入库', '无', 6, 20],
      [rt3.id, 1, '下料', '激光切割机', 1, 20],
      [rt3.id, 2, '组框', '数控折弯机', 1, 40],
      [rt3.id, 3, '加固', '电动装配台', 2, 25]
    ]
    routingRows.forEach(([routingId, seq, processName, equipmentType, workstationId, stdMinutes]) =>
      push('routingDetail', { routingId, seq, processName, equipmentType, workstationId, stdMinutes }))

    // BOM（BOM 负责指定该产品用哪条工艺路线）
    const bom1 = push('bom', { no: 'BOM-FG001-01', itemId: ITEM['FG-001'], routingId: rt1.id, version: 'V1.0', status: '启用', remark: '四旋翼标准配置' })
    const bom2 = push('bom', { no: 'BOM-FG002-01', itemId: ITEM['FG-002'], routingId: rt2.id, version: 'V1.0', status: '启用', remark: '六旋翼标准配置' })
    const bom3 = push('bom', { no: 'BOM-SF001-01', itemId: ITEM['SF-001'], routingId: rt3.id, version: 'V1.0', status: '启用', remark: '机架总成' })

    const bomRows = [
      [bom1.id, 'RM-001', 4], [bom1.id, 'RM-002', 8], [bom1.id, 'RM-003', 4], [bom1.id, 'RM-004', 1],
      [bom1.id, 'RM-005', 1], [bom1.id, 'RM-006', 3.5], [bom1.id, 'RM-007', 24], [bom1.id, 'RM-008', 4],
      [bom1.id, 'RM-009', 1], [bom1.id, 'RM-010', 1],
      [bom2.id, 'RM-001', 6], [bom2.id, 'RM-002', 12], [bom2.id, 'RM-003', 6], [bom2.id, 'RM-004', 1],
      [bom2.id, 'RM-005', 1], [bom2.id, 'RM-006', 4.8], [bom2.id, 'RM-007', 36], [bom2.id, 'RM-008', 6],
      [bom2.id, 'RM-009', 1], [bom2.id, 'RM-010', 1],
      [bom3.id, 'RM-008', 4], [bom3.id, 'RM-006', 3.5], [bom3.id, 'RM-007', 16]
    ]
    bomRows.forEach(([bomId, code, qtyPerUnit]) =>
      push('bomDetail', { bomId, itemId: ITEM[code], qtyPerUnit }))

    // 设备 / 工位 / 工装
    ;[
      ['EQ-01', '激光切割机', 1, 'LC-1325', '正常'],
      ['EQ-02', '数控折弯机', 1, 'NC-40', '正常'],
      ['EQ-03', '电动装配台', 2, 'AS-200', '正常'],
      ['EQ-04', '智能电批', 2, 'ES-30', '检修'],
      ['EQ-05', '综合测试台', 3, 'TT-800', '正常'],
      ['EQ-06', '桨叶动平衡仪', 3, 'DB-12', '正常']
    ].forEach(([code, name, workshopId, model, status]) =>
      push('equipment', { code, name, workshopId, model, status, remark: '' }))

    ;[
      ['ST-01', '备料工位', 1, '一楼 A 区'],
      ['ST-02', '装配工位一', 2, '二楼 B 区'],
      ['ST-03', '装配工位二', 2, '二楼 B 区'],
      ['ST-04', '调试工位', 3, '三楼 C 区'],
      ['ST-05', '检测工位', 3, '三楼 C 区'],
      ['ST-06', '包装工位', 2, '一楼 D 区']
    ].forEach(([code, name, workshopId, location]) =>
      push('workstation', { code, name, workshopId, location, remark: '' }))

    ;[
      ['TL-01', '机架焊接工装', 1, 'J-01'],
      ['TL-02', '电机安装治具', 2, 'J-02'],
      ['TL-03', '动平衡夹具', 3, 'J-03']
    ].forEach(([code, name, workshopId, model]) =>
      push('tooling', { code, name, workshopId, model, remark: '' }))

    buildDemoOrders(ITEM)
    buildDemoStock(ITEM)
  }

  /** 按 BOM 的物料明细 + BOM 指定的工艺路线，生成工单的物料需求与工序任务 */
  function buildOrderLines(order) {
    const bom = state.bom.find((b) => b.itemId === order.itemId && b.status === '启用')
    if (!bom) throw new Error('该产品未维护有效的物料清单（BOM），无法下达')
    const routing = state.routing.find((r) => r.id === bom.routingId && r.status === '启用')
    if (!routing) throw new Error('该产品的 BOM 未指定有效的工艺路线，无法下达')

    state.bomDetail
      .filter((x) => x.bomId === bom.id)
      .forEach((x) =>
        push('orderMaterial', {
          orderId: order.id,
          itemId: x.itemId,
          reqQty: +(x.qtyPerUnit * order.planQty).toFixed(3),
          pickedQty: 0,
          returnedQty: 0
        }))

    state.routingDetail
      .filter((x) => x.routingId === routing.id)
      .sort((a, b) => a.seq - b.seq)
      .forEach((x) =>
        push('orderTask', {
          orderId: order.id,
          seq: x.seq,
          processName: x.processName,
          equipmentType: x.equipmentType,
          planQty: order.planQty,
          equipDoneQty: 0,
          scrapQty: 0,
          equipmentId: null,
          workstationId: x.workstationId || null,
          toolingId: null,
          ownerId: null,
          planStart: null,
          planEnd: null,
          status: '待开始',
          inboundQty: 0,
          remark: ''
        }))
  }

  function report(task, qualQty, scrapQty, reporterId, time, remark) {
    task.equipDoneQty += qualQty
    task.scrapQty += scrapQty
    task.status = '已完成'
    push('workReport', {
      orderId: task.orderId,
      taskId: task.id,
      qualQty,
      scrapQty,
      reporterId,
      reportTime: time || MES.now(),
      remark: remark || ''
    })
  }

  function buildDemoOrders(ITEM) {
    const P = state.user.find((u) => u.account === 'planner').id
    const OPS = state.user.filter((u) => u.roleId === 3)

    /* 生产中的工单 */
    const o1 = push('workOrder', {
      no: 'WO-20250918-001', name: 'X4 巡检机首批生产', itemId: ITEM['FG-001'], planQty: 20,
      factoryId: 1, workshopId: 2,
      status: '生产中', planStart: MES.dateAgo(6), planEnd: MES.dateAgo(1), creatorId: P,
      createTime: MES.timeAgo(7, 9, 12), auditTime: MES.timeAgo(7, 10, 30),
      priority: '高', remark: '巡检项目首批订单'
    })
    buildOrderLines(o1)

    const pickMap = { 'RM-001': 80, 'RM-002': 160, 'RM-003': 80, 'RM-004': 20, 'RM-005': 20, 'RM-006': 70, 'RM-007': 480, 'RM-008': 80, 'RM-009': 20, 'RM-010': 20 }
    state.orderMaterial.filter((m) => m.orderId === o1.id).forEach((m) => {
      const code = byId('item', m.itemId).code
      if (pickMap[code]) m.pickedQty = pickMap[code]
    })
    state.orderMaterial.find((m) => m.orderId === o1.id && byId('item', m.itemId).code === 'RM-002').returnedQty = 4

    const tasks1 = state.orderTask.filter((t) => t.orderId === o1.id).sort((a, b) => a.seq - b.seq)
    const assign = [
      { equipmentId: 1, workstationId: 1, toolingId: 1, ownerId: OPS[0].id },
      { equipmentId: 3, workstationId: 2, toolingId: 2, ownerId: OPS[0].id },
      { equipmentId: 4, workstationId: 3, toolingId: 2, ownerId: OPS[0].id },
      { equipmentId: 5, workstationId: 4, toolingId: null, ownerId: OPS[2].id },
      { equipmentId: 5, workstationId: 5, toolingId: 3, ownerId: OPS[2].id },
      { equipmentId: null, workstationId: 6, toolingId: null, ownerId: OPS[2].id }
    ]
    tasks1.forEach((t, i) => {
      Object.assign(t, assign[i] || {})
      t.planStart = MES.dateAgo(5 - Math.min(i, 3))
      t.planEnd = MES.dateAgo(3 - Math.min(i, 2))
    })
    report(tasks1[0], 12, 0, OPS[0].id, MES.timeAgo(5, 10, 0), '')
    report(tasks1[0], 7, 1, OPS[0].id, MES.timeAgo(5, 15, 30), '桨叶动平衡超差')
    report(tasks1[1], 10, 0, OPS[0].id, MES.timeAgo(4, 10, 0), '')
    report(tasks1[1], 8, 1, OPS[0].id, MES.timeAgo(4, 16, 20), '螺丝孔滑牙')
    report(tasks1[2], 10, 0, OPS[0].id, MES.timeAgo(3, 11, 0), '')
    tasks1[2].status = '进行中'
    tasks1[3].status = '进行中'

    /* 草稿工单，用来试审核下达 */
    push('workOrder', {
      no: 'WO-20250924-002', name: 'X6 载重机试产', itemId: ITEM['FG-002'], planQty: 10,
      factoryId: 1, workshopId: 2,
      status: '草稿', planStart: MES.dateAgo(-2), planEnd: MES.dateAgo(-10), creatorId: P,
      createTime: MES.timeAgo(0, 8, 40), auditTime: null, priority: '中', remark: '载重机型试产'
    })

    /* 已完工工单 */
    const o3 = push('workOrder', {
      no: 'WO-20250910-001', name: 'X4 第二批交付', itemId: ITEM['FG-001'], planQty: 15,
      factoryId: 1, workshopId: 2,
      status: '已完工', planStart: MES.dateAgo(20), planEnd: MES.dateAgo(12), creatorId: P,
      createTime: MES.timeAgo(21, 9, 0), auditTime: MES.timeAgo(21, 9, 40),
      priority: '中', remark: ''
    })
    buildOrderLines(o3)
    const tasks3 = state.orderTask.filter((t) => t.orderId === o3.id).sort((a, b) => a.seq - b.seq)
    tasks3.forEach((t, i) => {
      Object.assign(t, {
        equipmentId: [1, 3, 4, 5, 5, null][i],
        workstationId: [1, 2, 3, 4, 5, 6][i],
        ownerId: OPS[i < 3 ? 0 : 2].id,
        planStart: MES.dateAgo(19 - i),
        planEnd: MES.dateAgo(17 - i)
      })
      report(t, i === 0 ? 14 : 15, i === 0 ? 1 : 0, OPS[i < 3 ? 0 : 2].id, MES.timeAgo(19 - i, 14, 0), '')
    })
    state.orderMaterial.filter((m) => m.orderId === o3.id).forEach((m) => { m.pickedQty = m.reqQty })

    /* 已关闭工单 */
    const o4 = push('workOrder', {
      no: 'WO-20250905-003', name: '机架总成备件加工', itemId: ITEM['SF-001'], planQty: 30,
      factoryId: 2, workshopId: 1,
      status: '已关闭', planStart: MES.dateAgo(26), planEnd: MES.dateAgo(22), creatorId: P,
      createTime: MES.timeAgo(27, 13, 20), auditTime: MES.timeAgo(27, 14, 0),
      priority: '低', remark: '客户改型，剩余任务终止'
    })
    buildOrderLines(o4)
    const tasks4 = state.orderTask.filter((t) => t.orderId === o4.id).sort((a, b) => a.seq - b.seq)
    tasks4.forEach((t, i) => {
      Object.assign(t, { equipmentId: [1, 2, 3][i], workstationId: [1, 1, 2][i], ownerId: OPS[1].id })
      report(t, i === 0 ? 30 : 28, i === 0 ? 0 : 2, OPS[1].id, MES.timeAgo(25 - i, 11, 0), '')
    })
  }

  function buildDemoStock(ITEM) {
    const WH = {}
    state.warehouse.forEach((w) => { WH[w.code] = w.id })
    const W = state.user.find((u) => u.account === 'warehouse').id

    const applyLine = (doc, itemId, qty) => {
      push('stockDocDetail', { docId: doc.id, itemId, qty })
      const inbound = ['采购入库', '生产退料', '成品入库'].indexOf(doc.docType) >= 0
      moveStock(doc.warehouseId, itemId, inbound ? qty : -qty, doc, doc.confirmTime)
    }

    const PID_SUP = (state.partner.find((p) => p.code === 'SUP-001') || {}).id
    const PID_CUS = (state.partner.find((p) => p.code === 'CUS-001') || {}).id

    const doc1 = push('stockDoc', {
      no: 'RK-20250915-001', docType: '采购入库', warehouseId: WH['WH01'], orderId: null, partnerId: PID_SUP, amount: 140400,
      status: '已确认', creatorId: W, createTime: MES.timeAgo(10, 9, 30),
      confirmTime: MES.timeAgo(10, 10, 0), remark: '电机、桨叶、标准件到货'
    })
    ;[['RM-001', 200], ['RM-002', 400], ['RM-007', 5000], ['RM-004', 30], ['RM-005', 25],
      ['RM-009', 20], ['RM-010', 40], ['RM-008', 80], ['RM-006', 150], ['RM-003', 160]]
      .forEach(([code, qty]) => applyLine(doc1, ITEM[code], qty))

    const order1 = state.workOrder.find((o) => o.no === 'WO-20250918-001')
    const doc2 = push('stockDoc', {
      no: 'LL-20250918-002', docType: '生产领料', warehouseId: WH['WH01'], orderId: order1.id,
      status: '已确认', creatorId: W, createTime: MES.timeAgo(7, 11, 0),
      confirmTime: MES.timeAgo(7, 11, 20), remark: '工单 WO-20250918-001 首批领料'
    })
    ;[['RM-001', 80], ['RM-002', 160], ['RM-003', 80], ['RM-004', 20], ['RM-005', 20],
      ['RM-006', 70], ['RM-007', 480], ['RM-008', 80], ['RM-009', 20], ['RM-010', 20]]
      .forEach(([code, qty]) => applyLine(doc2, ITEM[code], qty))

    const doc3 = push('stockDoc', {
      no: 'RL-20250920-001', docType: '生产退料', warehouseId: WH['WH01'], orderId: order1.id,
      status: '已确认', creatorId: W, createTime: MES.timeAgo(5, 16, 0),
      confirmTime: MES.timeAgo(5, 16, 10), remark: '桨叶来料不良退回'
    })
    applyLine(doc3, ITEM['RM-002'], 4)

    const order3 = state.workOrder.find((o) => o.no === 'WO-20250910-001')
    const doc4 = push('stockDoc', {
      no: 'CP-20250921-001', docType: '成品入库', warehouseId: WH['WH02'], orderId: order3.id,
      status: '已确认', creatorId: W, createTime: MES.timeAgo(4, 15, 0),
      confirmTime: MES.timeAgo(4, 15, 5), remark: ''
    })
    applyLine(doc4, ITEM['FG-001'], 15)
    const lastTask = state.orderTask.filter((t) => t.orderId === order3.id).sort((a, b) => b.seq - a.seq)[0]
    if (lastTask) lastTask.inboundQty = 15

    const doc5 = push('stockDoc', {
      no: 'XS-20250922-001', docType: '销售出库', warehouseId: WH['WH02'], orderId: null, partnerId: PID_CUS, amount: 36000,
      status: '已确认', creatorId: W, createTime: MES.timeAgo(2, 10, 0),
      confirmTime: MES.timeAgo(2, 10, 30), remark: '深圳市天翼巡检科技有限公司'
    })
    applyLine(doc5, ITEM['FG-001'], 3)

    /* 草稿单据，用来试确认库存变动 */
    const doc6 = push('stockDoc', {
      no: 'RK-20250924-002', docType: '采购入库', warehouseId: WH['WH01'], orderId: null, partnerId: PID_SUP, amount: 21600,
      status: '草稿', creatorId: W, createTime: MES.timeAgo(0, 9, 0),
      confirmTime: null, remark: '电机、电调补货（草稿，待确认）'
    })
    ;[['RM-001', 100], ['RM-003', 60]].forEach(([code, qty]) =>
      push('stockDocDetail', { docId: doc6.id, itemId: ITEM[code], qty }))

    const doc7 = push('stockDoc', {
      no: 'LL-20250924-003', docType: '生产领料', warehouseId: WH['WH01'], orderId: order1.id,
      status: '草稿', creatorId: W, createTime: MES.timeAgo(0, 9, 20),
      confirmTime: null, remark: '工单二次领料（草稿，待确认）'
    })
    ;[['RM-004', 5], ['RM-005', 5]].forEach(([code, qty]) =>
      push('stockDocDetail', { docId: doc7.id, itemId: ITEM[code], qty }))

    /* 库存不设期初值：余额只由上面这些已确认单据经 moveStock 累加出来。
       没有来源单据的物料就是 0，连余额行都不建，这样"结存 = 流水累加"才成立 */
  }

  // 导出
  MES.db = {
    state,
    nextId,
    byId,
    nameOf,
    itemLabel,
    balanceOf,
    push,
    moveStock,
    upsertBalance,
    buildOrderLines,
    save,
    load,
    reset,
    seed
  }
})(window.MES)


