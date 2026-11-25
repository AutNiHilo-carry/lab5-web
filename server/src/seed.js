/* 内存仓库的种子数据，照 db/02-data.sql 抄的关键部分
 */

const nowText = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 生成种子；返回 { table: rows[] } */
export function buildSeed() {
  const T = {}
  const push = (t, row) => {
    T[t] = T[t] || []
    const id = T[t].length + 1
    T[t].push({ id, ...row })
    return id
  }

  // 工厂 / 车间 / 部门 / 仓库
  push('factory', { code: 'F01', name: '深圳智能制造一厂', address: '深圳市宝安区福永街道 1 号', contact: '0755-8000 1000', leader: '张明', remark: '整机装配基地' })
  push('factory', { code: 'F02', name: '东莞精密结构件二厂', address: '东莞市松山湖工业园 8 号', contact: '0769-8000 2000', leader: '赵磊', remark: '机架与结构件加工' })

  push('workshop', { code: 'WS01', name: '机加工车间', factory_id: 1, leader: '赵磊', remark: '下料、折弯、组框' })
  push('workshop', { code: 'WS02', name: '总装车间', factory_id: 1, leader: '王强', remark: '整机装配与电气安装' })
  push('workshop', { code: 'WS03', name: '质量检测车间', factory_id: 1, leader: '孙悦', remark: '调试、检测、包装' })

  push('department', { code: 'DP01', name: '生产计划部', factory_id: 1, leader: '李彦', remark: '工单编制与下达' })
  push('department', { code: 'DP02', name: '采购部', factory_id: 1, leader: '钱伟', remark: '原材料采购与供应商管理' })
  push('department', { code: 'DP03', name: '仓储物流部', factory_id: 1, leader: '陈静', remark: '仓库与出入库单据' })
  push('department', { code: 'DP04', name: '质量部', factory_id: 1, leader: '孙悦', remark: '来料、过程与成品检验' })
  push('department', { code: 'DP05', name: '销售部', factory_id: 1, leader: '赵敏', remark: '客户与销售出库' })

  push('warehouse', { code: 'WH01', name: '原材料仓', factory_id: 1, type: '原料库', leader: '陈静', remark: '存放电机、桨叶、电子件' })
  push('warehouse', { code: 'WH02', name: '成品仓', factory_id: 1, type: '成品库', leader: '陈静', remark: '整机入库与发货' })
  push('warehouse', { code: 'WH03', name: '半成品仓', factory_id: 1, type: '半成品库', leader: '陈静', remark: '机架总成等半成品' })

  // 角色 / 用户（department_id 与 workshop_id 二选一）
  push('role', { code: 'R01', name: '系统管理员', remark: '全部权限', perms: ['*'] })
  push('role', { code: 'R02', name: '计划员', remark: '建单、下达工单、派工', perms: ["dashboard", "base/factory", "base/partner", "base/item", "tech/bom", "tech/routing", "prod/order", "prod/wip", "prod/task", "prod/progress", "wms/doc", "wms/stock", "about"] })
  push('role', { code: 'R03', name: '操作员', remark: '按工序报工', perms: ["dashboard", "prod/order", "prod/wip", "prod/task", "prod/report", "about"] })
  push('role', { code: 'R04', name: '仓管员', remark: '出入库单据办理', perms: ["dashboard", "base/warehouse", "base/item", "wms/doc", "wms/stock", "wms/flow", "about"] })

  push('sys_user', { account: 'admin', name: '张明', role_id: 1, department_id: null, workshop_id: null, phone: '13800000001', status: '启用', password: '123456' })
  push('sys_user', { account: 'planner', name: '李彦', role_id: 2, department_id: 1, workshop_id: null, phone: '13800000002', status: '启用', password: '123456' })
  push('sys_user', { account: 'op_assembly', name: '王强', role_id: 3, department_id: null, workshop_id: 2, phone: '13800000003', status: '启用', password: '123456' })
  push('sys_user', { account: 'op_machining', name: '赵磊', role_id: 3, department_id: null, workshop_id: 1, phone: '13800000004', status: '启用', password: '123456' })
  push('sys_user', { account: 'op_quality', name: '孙悦', role_id: 3, department_id: 4, workshop_id: null, phone: '13800000005', status: '启用', password: '123456' })
  push('sys_user', { account: 'warehouse', name: '陈静', role_id: 4, department_id: 3, workshop_id: null, phone: '13800000006', status: '启用', password: '123456' })

  // 单位 / 物料
  ;[['U01', '台'], ['U02', '个'], ['U03', '套'], ['U04', '米'], ['U05', '块'], ['U06', '卷']]
    .forEach(([code, name]) => push('unit', { code, name, remark: '' }))

  ;[
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
  ].forEach(([code, name, category, unit_id, spec, safety_stock, remark, sub_category, ref_price]) =>
    push('item', { code, name, category, sub_category, unit_id, spec, safety_stock, ref_price, remark }))

  // 供应商 / 客户
  ;[
    ['SUP-001', '深圳市瑞达电机有限公司', '供应商', '周立', '0755-8123 4567', '深圳市宝安区福永街道 12 号', '电机、电调速器主供'],
    ['SUP-002', '东莞市恒力复材有限公司', '供应商', '林芳', '0769-8877 6655', '东莞市松山湖工业园 6 号', '碳纤维方管、机臂'],
    ['SUP-003', '广州市芯航电子有限公司', '供应商', '黄强', '020-6688 9900', '广州市黄埔区科学城 3 号', '飞控主板、云台相机'],
    ['CUS-001', '深圳市天翼巡检科技有限公司', '客户', '吴敏', '0755-8999 1122', '深圳市南山区高新南一道 5 号', '巡检服务商，长期客户'],
    ['CUS-002', '东莞市电力巡维中心', '客户', '郑海', '0769-2211 3344', '东莞市南城区莞太路 88 号', '电网巡检项目']
  ].forEach(([code, name, partner_type, contact, phone, address, remark]) =>
    push('partner', { code, name, partner_type, contact, phone, address, remark }))

  // 设备 / 工位 / 工装
  ;[
    ['EQ-01', '激光切割机', 1, 'LC-1325', '正常'],
    ['EQ-02', '数控折弯机', 1, 'NC-40', '正常'],
    ['EQ-03', '电动装配台', 2, 'AS-200', '正常'],
    ['EQ-04', '智能电批', 2, 'ES-30', '检修'],
    ['EQ-05', '综合测试台', 3, 'TT-800', '正常'],
    ['EQ-06', '桨叶动平衡仪', 3, 'DB-12', '正常']
  ].forEach(([code, name, workshop_id, model, status]) =>
    push('equipment', { code, name, workshop_id, model, status, remark: '' }))

  ;[
    ['ST-01', '备料工位', 1, '一楼 A 区'],
    ['ST-02', '装配工位', 2, '二楼 B 区'],
    ['ST-03', '电气工位', 2, '二楼 C 区'],
    ['ST-04', '调试工位', 3, '三楼 D 区'],
    ['ST-05', '检测工位', 3, '三楼 E 区'],
    ['ST-06', '包装工位', 3, '一楼 F 区']
  ].forEach(([code, name, workshop_id, location]) =>
    push('workstation', { code, name, workshop_id, location, remark: '' }))

  ;[
    ['TL-01', '机架装配夹具', 2, 'JIG-A'],
    ['TL-02', '桨叶平衡夹具', 3, 'JIG-B'],
    ['TL-03', '整机测试架', 3, 'JIG-C']
  ].forEach(([code, name, workshop_id, model]) =>
    push('tooling', { code, name, workshop_id, model, remark: '' }))

  // 工艺路线：通用模板，不绑定产品
  const rt1 = push('routing', { no: 'RT-X4-01', name: '四旋翼总装标准路线', version: 'V1.0', status: '启用', remark: '备料→装配→电气→调试→检测→包装' })
  const rt2 = push('routing', { no: 'RT-X6-01', name: '六旋翼总装标准路线', version: 'V1.0', status: '启用', remark: '含载重测试工序' })
  const rt3 = push('routing', { no: 'RT-FRAME-01', name: '机架总成加工路线', version: 'V1.0', status: '启用', remark: '下料→组框→加固' })

  ;[
    [rt1, 1, '备料下料', '激光切割机', 1, 30],
    [rt1, 2, '机架装配', '电动装配台', 2, 60],
    [rt1, 3, '电气安装', '智能电批', 3, 45],
    [rt1, 4, '整机调试', '综合测试台', 4, 40],
    [rt1, 5, '整机检测', '综合测试台', 5, 20],
    [rt1, 6, '包装入库', '无', 6, 15],
    [rt2, 1, '备料下料', '激光切割机', 1, 35],
    [rt2, 2, '机架装配', '电动装配台', 2, 75],
    [rt2, 3, '电气安装', '智能电批', 3, 60],
    [rt2, 4, '整机调试', '综合测试台', 4, 50],
    [rt2, 5, '载重测试', '综合测试台', 5, 30],
    [rt2, 6, '包装入库', '无', 6, 20],
    [rt3, 1, '下料', '激光切割机', 1, 20],
    [rt3, 2, '组框', '数控折弯机', 1, 40],
    [rt3, 3, '加固', '电动装配台', 2, 25]
  ].forEach(([routing_id, seq, process_name, equipment_type, workstation_id, std_minutes]) =>
    push('routing_detail', { routing_id, seq, process_name, equipment_type, workstation_id, std_minutes }))

  // BOM：由 BOM 指定工艺路线
  const bom1 = push('bom', { no: 'BOM-FG001-01', item_id: 1, routing_id: rt1, version: 'V1.0', status: '启用', remark: '四旋翼标准配置' })
  const bom2 = push('bom', { no: 'BOM-FG002-01', item_id: 2, routing_id: rt2, version: 'V1.0', status: '启用', remark: '六旋翼标准配置' })
  const bom3 = push('bom', { no: 'BOM-SF001-01', item_id: 3, routing_id: rt3, version: 'V1.0', status: '启用', remark: '机架总成' })

  ;[
    [bom1, 4, 4], [bom1, 5, 8], [bom1, 6, 4], [bom1, 7, 1], [bom1, 8, 1],
    [bom1, 9, 3.5], [bom1, 10, 24], [bom1, 11, 4], [bom1, 12, 1], [bom1, 13, 1],
    [bom2, 4, 6], [bom2, 5, 12], [bom2, 6, 6], [bom2, 7, 1], [bom2, 8, 1],
    [bom2, 9, 4.8], [bom2, 10, 36], [bom2, 11, 6], [bom2, 12, 1], [bom2, 13, 1],
    [bom3, 11, 4], [bom3, 9, 3.5], [bom3, 10, 16]
  ].forEach(([bom_id, item_id, qty_per_unit]) =>
    push('bom_detail', { bom_id, item_id, qty_per_unit }))

  // 工单：带名称 + 编号 + 负责工厂
  const o1 = push('work_order', {
    no: 'WO-20250918-001', name: 'X4 巡检机首批生产', item_id: 1, plan_qty: 20,
    factory_id: 1, workshop_id: 2, status: '生产中',
    plan_start: daysAgo(6), plan_end: daysAgo(1), creator_id: 2,
    create_time: '2025-09-18 09:12:00', audit_time: '2025-09-18 10:30:00',
    priority: '高', remark: '巡检项目首批订单'
  })

  /* 工单 o1 的物料与工序（模拟已下达） */
  ;[[4, 80], [5, 160], [6, 80], [7, 20], [8, 20], [9, 70], [10, 480], [11, 80], [12, 20], [13, 20]]
    .forEach(([item_id, req_qty]) =>
      push('order_material', { order_id: o1, item_id, req_qty, picked_qty: req_qty, returned_qty: 0 }))

  const o1Tasks = []
  ;[
    [1, '备料下料', '激光切割机', 20, 20, 0, 1, 1, '已完成'],
    [2, '机架装配', '电动装配台', 20, 19, 1, 3, 2, '已完成'],
    [3, '电气安装', '智能电批', 20, 12, 0, 4, 3, '进行中'],
    [4, '整机调试', '综合测试台', 20, 0, 0, 5, 4, '待开始'],
    [5, '整机检测', '综合测试台', 20, 0, 0, 5, 5, '待开始'],
    [6, '包装入库', '无', 20, 0, 0, null, 6, '待开始']
  ].forEach(([seq, process_name, equipment_type, plan_qty, equip_done_qty, scrap_qty, equipment_id, workstation_id, status]) =>
    o1Tasks.push(push('order_task', {
      order_id: o1, seq, process_name, equipment_type, plan_qty, equip_done_qty, scrap_qty,
      equipment_id, workstation_id, tooling_id: null, owner_id: 3,
      plan_start: daysAgo(3), plan_end: daysAgo(1), status, inbound_qty: 0, remark: ''
    })))

  /* 草稿工单，用来试审核下达 */
  push('work_order', {
    no: 'WO-20250924-002', name: 'X6 载重机试产', item_id: 2, plan_qty: 10,
    factory_id: 1, workshop_id: 2, status: '草稿',
    plan_start: daysAgo(-2), plan_end: daysAgo(-10), creator_id: 2,
    create_time: '2025-09-24 08:40:00', audit_time: null, priority: '中', remark: '载重机型试产'
  })

  /* 已完工工单 */
  const o3 = push('work_order', {
    no: 'WO-20250910-001', name: 'X4 第二批交付', item_id: 1, plan_qty: 15,
    factory_id: 1, workshop_id: 2, status: '已完工',
    plan_start: daysAgo(20), plan_end: daysAgo(12), creator_id: 2,
    create_time: '2025-09-10 09:00:00', audit_time: '2025-09-10 09:40:00',
    priority: '中', remark: ''
  })
  ;[[4, 60], [5, 120], [6, 60], [7, 15], [8, 15], [9, 52.5], [10, 360], [11, 60], [12, 15], [13, 15]]
    .forEach(([item_id, req_qty]) =>
      push('order_material', { order_id: o3, item_id, req_qty, picked_qty: req_qty, returned_qty: 0 }))

  const o3Tasks = []
  ;[1, 2, 3, 4, 5, 6].forEach((seq) => {
    o3Tasks.push(push('order_task', {
      order_id: o3, seq,
      process_name: ['备料下料', '机架装配', '电气安装', '整机调试', '整机检测', '包装入库'][seq - 1],
      equipment_type: '激光切割机', plan_qty: 15, equip_done_qty: 15, scrap_qty: 0,
      equipment_id: 1, workstation_id: seq, tooling_id: null, owner_id: 3,
      plan_start: daysAgo(18), plan_end: daysAgo(12), status: '已完成',
      inbound_qty: seq === 6 ? 15 : 0, remark: ''
    }))
  })

  // 库存单据（已确认 + 草稿）
  const doc = (no, doc_type, warehouse_id, order_id, status, create_time, confirm_time, remark, partner_id = null, amount = 0) =>
    push('stock_doc', {
      no, doc_type, warehouse_id, order_id, status, creator_id: 6,
      partner_id, amount, create_time, confirm_time, remark
    })
  const line = (doc_id, item_id, qty) => push('stock_doc_detail', { doc_id, item_id, qty })

  /* 采购入库（已确认）：补齐原材料 */
  const d1 = doc('RK-20250915-001', '采购入库', 1, null, '已确认', '2025-09-15 08:30:00', '2025-09-15 09:00:00', '首批原材料到货', 1, 140400)
  ;[[4, 200], [5, 400], [6, 160], [7, 30], [8, 25], [9, 150], [10, 5000], [11, 80], [12, 20], [13, 40]]
    .forEach(([item_id, qty]) => line(d1, item_id, qty))

  /* 生产领料（已确认）：o1 首次领料 */
  const d2 = doc('LL-20250918-001', '生产领料', 1, o1, '已确认', '2025-09-18 11:00:00', '2025-09-18 11:20:00', '工单首批领料')
  ;[[4, 80], [5, 160], [6, 80], [7, 20], [8, 20], [9, 70], [10, 480], [11, 80], [12, 20], [13, 20]]
    .forEach(([item_id, qty]) => line(d2, item_id, qty))

  /* 生产退料（已确认）：多余桨叶退回 */
  const d3 = doc('TL-20250919-001', '生产退料', 1, o1, '已确认', '2025-09-19 09:10:00', '2025-09-19 09:30:00', '桨叶余料退回')
  line(d3, 5, 4)

  /* 成品入库（已确认）：o3 完工入库 */
  const d4 = doc('RK-20250912-001', '成品入库', 2, o3, '已确认', '2025-09-12 15:00:00', '2025-09-12 15:20:00', '工单 WO-20250910-001 成品入库')
  line(d4, 1, 15)

  /* 销售出库（已确认）：发给客户 */
  const d5 = doc('XS-20250920-001', '销售出库', 2, null, '已确认', '2025-09-20 10:00:00', '2025-09-20 10:30:00', '客户 CUS-001 提货', 4, 36000)
  line(d5, 1, 3)

  /* 草稿采购入库，确认后库存会变 */
  const d6 = doc('RK-20250925-001', '采购入库', 1, null, '草稿', '2025-09-25 08:50:00', null, '第二批原材料到货（待确认）', 1, 21600)
  ;[[4, 100], [6, 60]].forEach(([item_id, qty]) => line(d6, item_id, qty))

  // 由已确认单据推导余额与流水（不设任何期初值）
  const IN_TYPES = ['采购入库', '生产退料', '成品入库']
  const confirmed = (T.stock_doc || []).filter((d) => d.status === '已确认')
  confirmed.forEach((d) => {
    const dir = IN_TYPES.indexOf(d.doc_type) >= 0 ? 1 : -1
    ;(T.stock_doc_detail || []).filter((l) => l.doc_id === d.id).forEach((l) => {
      const bal = (T.stock_balance || []).find((b) => b.warehouse_id === d.warehouse_id && b.item_id === l.item_id)
      const before = bal ? bal.qty : 0
      const after = +(before + dir * l.qty).toFixed(3)
      if (bal) bal.qty = after
      else push('stock_balance', { warehouse_id: d.warehouse_id, item_id: l.item_id, qty: after })
      push('stock_flow', {
        warehouse_id: d.warehouse_id, item_id: l.item_id,
        change_qty: dir * l.qty, balance_after: after,
        doc_id: d.id, doc_type: d.doc_type,
        flow_time: d.confirm_time || d.create_time
      })
    })
  })

  /* 报工记录（o1 已完成的两道工序） */
  push('work_report', { order_id: o1, task_id: o1Tasks[0], qual_qty: 20, scrap_qty: 0, reporter_id: 3, report_time: '2025-09-19 10:00:00', remark: '' })
  push('work_report', { order_id: o1, task_id: o1Tasks[1], qual_qty: 19, scrap_qty: 1, reporter_id: 3, report_time: '2025-09-20 15:30:00', remark: '螺丝孔滑牙' })
  push('work_report', { order_id: o1, task_id: o1Tasks[2], qual_qty: 12, scrap_qty: 0, reporter_id: 3, report_time: '2025-09-21 11:00:00', remark: '' })

  return T
}

export { nowText, daysAgo }


