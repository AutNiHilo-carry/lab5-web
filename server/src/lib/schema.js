/* 24 张表的元数据：可写字段、必填、唯一键、删除守卫
 * /api/:table 的通用增删改全靠这里拦非法写入
 */

/** 可写列（不含 id / 系统自动维护的列） */
const C = {
  factory: ['code', 'name', 'address', 'contact', 'leader', 'remark'],
  workshop: ['code', 'name', 'factory_id', 'leader', 'remark'],
  department: ['code', 'name', 'factory_id', 'leader', 'remark'],
  warehouse: ['code', 'name', 'factory_id', 'type', 'leader', 'remark'],
  role: ['code', 'name', 'remark', 'perms'],
  sys_user: ['account', 'name', 'role_id', 'department_id', 'workshop_id', 'phone', 'status', 'password'],
  unit: ['code', 'name', 'remark'],
  item: ['code', 'name', 'category', 'sub_category', 'unit_id', 'spec', 'safety_stock', 'ref_price', 'remark'],
  partner: ['code', 'name', 'partner_type', 'contact', 'phone', 'address', 'remark'],
  equipment: ['code', 'name', 'workshop_id', 'model', 'status', 'remark'],
  workstation: ['code', 'name', 'workshop_id', 'location', 'remark'],
  tooling: ['code', 'name', 'workshop_id', 'model', 'remark'],
  routing: ['no', 'name', 'version', 'status', 'remark'],
  routing_detail: ['routing_id', 'seq', 'process_name', 'equipment_type', 'workstation_id', 'std_minutes'],
  bom: ['no', 'item_id', 'routing_id', 'version', 'status', 'remark'],
  bom_detail: ['bom_id', 'item_id', 'qty_per_unit'],
  work_order: ['no', 'name', 'item_id', 'plan_qty', 'factory_id', 'workshop_id', 'status',
    'plan_start', 'plan_end', 'creator_id', 'create_time', 'audit_time', 'priority', 'remark'],
  order_material: ['order_id', 'item_id', 'req_qty', 'picked_qty', 'returned_qty'],
  order_task: ['order_id', 'seq', 'process_name', 'equipment_type', 'plan_qty', 'equip_done_qty',
    'scrap_qty', 'equipment_id', 'workstation_id', 'tooling_id', 'owner_id',
    'plan_start', 'plan_end', 'status', 'inbound_qty', 'remark'],
  work_report: ['order_id', 'task_id', 'qual_qty', 'scrap_qty', 'reporter_id', 'receiver_id', 'report_time', 'remark'],
  stock_doc: ['no', 'doc_type', 'warehouse_id', 'order_id', 'partner_id', 'amount', 'status', 'creator_id', 'create_time', 'confirm_time', 'remark'],
  stock_doc_detail: ['doc_id', 'item_id', 'qty'],
  stock_balance: ['warehouse_id', 'item_id', 'qty'],
  stock_flow: ['warehouse_id', 'item_id', 'change_qty', 'balance_after', 'doc_id', 'doc_type', 'flow_time']
}

/** 中文名（用于报错信息） */
const CN = {
  factory: '工厂', workshop: '车间', department: '部门', warehouse: '仓库', role: '角色',
  sys_user: '用户', unit: '计量单位', item: '产品物料', partner: '供应商/客户',
  equipment: '设备', workstation: '工位', tooling: '工装',
  routing: '工艺路线', routing_detail: '工艺路线明细', bom: '物料清单', bom_detail: '物料清单明细',
  work_order: '生产工单', order_material: '工单物料需求', order_task: '工序任务', work_report: '报工记录',
  stock_doc: '库存单据', stock_doc_detail: '库存单据明细', stock_balance: '库存余额', stock_flow: '出入库流水'
}

/** 必填项（新增时校验） */
const REQUIRED = {
  factory: ['code', 'name'],
  workshop: ['code', 'name', 'factory_id'],
  department: ['code', 'name', 'factory_id'],
  warehouse: ['code', 'name', 'factory_id', 'type'],
  role: ['code', 'name'],
  sys_user: ['account', 'name', 'role_id'],
  unit: ['code', 'name'],
  item: ['code', 'name', 'category', 'unit_id'],
  partner: ['code', 'name', 'partner_type'],
  equipment: ['code', 'name', 'workshop_id'],
  workstation: ['code', 'name', 'workshop_id'],
  tooling: ['code', 'name', 'workshop_id'],
  routing: ['no', 'name'],
  routing_detail: ['routing_id', 'seq', 'process_name'],
  bom: ['no', 'item_id'],
  bom_detail: ['bom_id', 'item_id', 'qty_per_unit'],
  work_order: ['name', 'item_id', 'plan_qty', 'factory_id', 'workshop_id'],
  order_material: ['order_id', 'item_id', 'req_qty'],
  order_task: ['order_id', 'seq', 'process_name'],
  work_report: ['order_id', 'task_id', 'qual_qty'],
  stock_doc: ['no', 'doc_type', 'warehouse_id'],
  stock_doc_detail: ['doc_id', 'item_id', 'qty'],
  stock_balance: ['warehouse_id', 'item_id'],
  stock_flow: ['warehouse_id', 'item_id', 'change_qty', 'doc_type']
}

/** 唯一键，用来提示"已存在"而不是抛 SQL 报错 */
const UNIQUE = {
  factory: ['code'],
  workshop: ['code'],
  department: ['code'],
  warehouse: ['code'],
  role: ['code'],
  sys_user: ['account'],
  unit: ['code'],
  item: ['code'],
  partner: ['code'],
  equipment: ['code'],
  workstation: ['code'],
  tooling: ['code'],
  routing: ['no'],
  bom: ['no'],
  stock_doc: ['no']
}

/** 删除守卫：被引用就不让删，跟前端那套一样 */
const GUARDS = [
  { table: 'factory', child: 'workshop', fk: 'factory_id', msg: '该工厂下还有车间，不能删除' },
  { table: 'factory', child: 'department', fk: 'factory_id', msg: '该工厂下还有部门，不能删除' },
  { table: 'factory', child: 'warehouse', fk: 'factory_id', msg: '该工厂下还有仓库，不能删除' },
  { table: 'workshop', child: 'equipment', fk: 'workshop_id', msg: '该车间下还有设备，不能删除' },
  { table: 'workshop', child: 'work_order', fk: 'workshop_id', msg: '该车间还有工单，不能删除' },
  { table: 'workshop', child: 'sys_user', fk: 'workshop_id', msg: '该车间还有人员，不能删除' },
  { table: 'department', child: 'sys_user', fk: 'department_id', msg: '该部门下还有人员，不能删除' },
  { table: 'role', child: 'sys_user', fk: 'role_id', msg: '该角色还有用户，不能删除' },
  { table: 'unit', child: 'item', fk: 'unit_id', msg: '该单位已被物料引用，不能删除' },
  { table: 'item', child: 'bom_detail', fk: 'item_id', msg: '该物料已用于物料清单，不能删除' },
  { table: 'item', child: 'order_material', fk: 'item_id', msg: '该物料已被工单引用，不能删除' },
  { table: 'routing', child: 'bom', fk: 'routing_id', msg: '该工艺路线已被 BOM 引用，不能删除' },
  { table: 'routing', child: 'routing_detail', fk: 'routing_id', msg: '请先删除该路线下的工序，再删除路线' },
  { table: 'bom', child: 'bom_detail', fk: 'bom_id', msg: '请先删除该清单的明细，再删除清单' },
  { table: 'warehouse', child: 'stock_doc', fk: 'warehouse_id', msg: '该仓库还有库存单据，不能删除' },
  { table: 'partner', child: 'stock_doc', fk: 'partner_id', msg: '该单位还有关联单据，不能删除' }
]

/** 枚举校验，库里没加 CHECK，只能在这里挡 */
const ENUMS = {
  'item.category': ['成品', '半成品', '原材料'],
  'partner.partner_type': ['供应商', '客户'],
  'warehouse.type': ['原料库', '半成品库', '成品库', '其他'],
  'routing.status': ['启用', '停用'],
  'bom.status': ['启用', '停用'],
  'work_order.status': ['草稿', '已下达', '生产中', '已完工', '已关闭'],
  'work_order.priority': ['高', '中', '低'],
  'order_task.status': ['待开始', '进行中', '已完成'],
  'sys_user.status': ['启用', '停用'],
  'equipment.status': ['正常', '检修', '停用'],
  'stock_doc.doc_type': ['采购入库', '生产领料', '生产退料', '成品入库', '销售出库'],
  'stock_doc.status': ['草稿', '已确认']
}

export const TABLE_NAMES = Object.keys(C)
export const columnsOf = (t) => C[t] || null
export const cnOf = (t) => CN[t] || t
export const requiredOf = (t) => REQUIRED[t] || []
export const uniqueOf = (t) => UNIQUE[t] || []
export const guardsOf = (t) => GUARDS.filter((g) => g.table === t || g.child === t)
export const enumsOf = (t) => Object.keys(ENUMS)
  .filter((k) => k.split('.')[0] === t)
  .map((k) => ({ field: k.split('.')[1], values: ENUMS[k] }))

export function isTable(t) {
  return Object.prototype.hasOwnProperty.call(C, t)
}

/** 校验一条记录，返回错误信息数组 */
export function validateRow(table, row, { isNew }) {
  const errs = []
  const cn = cnOf(table)

  if (isNew) {
    requiredOf(table).forEach((f) => {
      const v = row[f]
      if (v === undefined || v === null || v === '') errs.push(`${cn}：${f} 不能为空`)
    })
  }

  enumsOf(table).forEach(({ field, values }) => {
    const v = row[field]
    if (v !== undefined && v !== null && v !== '' && values.indexOf(v) < 0) {
      errs.push(`${cn}：${field} 只能是 ${values.join(' / ')}`)
    }
  })

  if (table === 'work_order' && row.plan_qty !== undefined && Number(row.plan_qty) <= 0) {
    errs.push('工单：计划数量必须大于 0')
  }
  if (table === 'bom_detail' && row.qty_per_unit !== undefined && Number(row.qty_per_unit) <= 0) {
    errs.push('物料清单明细：单件用量必须大于 0')
  }
  if (table === 'stock_doc_detail' && row.qty !== undefined && Number(row.qty) <= 0) {
    errs.push('单据明细：数量必须大于 0（出入方向由单据类型决定）')
  }
  if ((table === 'stock_balance' || table === 'stock_flow') && row.qty !== undefined) {
    errs.push('库存不允许手工设置数量：余额只能由已确认单据产生')
  }
  return errs
}


