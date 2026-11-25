// SQL 脚本自检，不用装依赖
// 查编码（BOM、乱码）、括号引号配对，再看表是不是 24 张、
// sys_user 的命名、外键顺序、部门与车间平级、BOM 绑路线、路线不绑产品、
// 工单有名称编号和工厂、库存没有期初、供应商客户合一张表
// node scripts/sql-check.mjs

import fs from 'node:fs'

const files = ['db/01-schema.sql', 'db/02-data.sql', 'db/03-proc.sql', 'db/04-queries.sql']
const EXPECTED_TABLES = [
  'factory', 'workshop', 'department', 'warehouse', 'role', 'sys_user', 'unit', 'item',
  'partner', 'equipment', 'workstation', 'tooling',
  'routing', 'routing_detail', 'bom', 'bom_detail',
  'work_order', 'order_material', 'order_task', 'work_report',
  'stock_doc', 'stock_doc_detail', 'stock_balance', 'stock_flow'
]

let problems = 0
const pass = (msg) => console.log('  ✓ ' + msg)
const fail = (msg) => { console.log('  ✗ ' + msg); problems++ }

/** 条件成立打印通过语，否则打印失败语 */
function chk(cond, okMsg, badMsg) {
  cond ? pass(okMsg) : fail(badMsg)
}

const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

const countRows = (block) => block.split('\n').filter((l) => /^\s*\(\d/.test(l)).length

// 保留字 user，用字符码拼出来，免得正则里带反引号
const BT = String.fromCharCode(96)
const hasRawUser = (s) => s.includes(BT + 'user' + BT)

// 取某个 CREATE TABLE 的完整 DDL
const ddlOf = (body, table) =>
  (body.match(new RegExp(`CREATE TABLE ${table}\\b[\\s\\S]*?ENGINE=InnoDB`, 'i')) || [''])[0]

for (const file of files) {
  console.log(`\n【${file}】`)
  if (!fs.existsSync(file)) { fail('文件不存在'); continue }
  const raw = fs.readFileSync(file, 'utf8')
  const body = stripComments(raw)

  chk(raw.charCodeAt(0) !== 0xfeff, '无 BOM', '文件含 BOM')

  const bad = (raw.match(/\uFFFD/g) || []).length
  chk(bad === 0, '中文正常，无乱码', `含 ${bad} 个乱码替换符 U+FFFD`)

  const op = (body.match(/\(/g) || []).length
  const cp = (body.match(/\)/g) || []).length
  chk(op === cp, `括号配对（${op} 对）`, `括号不配对：${op} / ${cp}`)

  const q = (body.match(/'/g) || []).length
  chk(q % 2 === 0, '单引号成对', `单引号数量为奇数（${q}）`)

  if (file === 'db/01-schema.sql') {
    const tables = [...body.matchAll(/CREATE\s+TABLE\s+`?(\w+)`?/gi)].map((m) => m[1])
    chk(tables.length === 24, '建表语句 24 条', `建表语句 ${tables.length} 条，应为 24 条`)

    const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t))
    chk(missing.length === 0, '24 张表与设计清单一致', '缺少表：' + missing.join(', '))

    chk(!hasRawUser(body), '用户表为 sys_user', '仍在使用保留字 user')

    const fk = (body.match(/FOREIGN\s+KEY/gi) || []).length
    const uk = (body.match(/UNIQUE\s+KEY/gi) || []).length
    pass(`外键 ${fk} 个、唯一索引 ${uk} 个`)

    const dep = ddlOf(body, 'department')
    const depOk = dep.length > 0 && dep.includes('factory_id  INT          NOT NULL') &&
      dep.includes('uk_department_code')
    chk(depOk, '部门与车间平级：挂在工厂下且有编号唯一约束', 'department 定义不完整（需 factory_id + 编号唯一）')

    const routing = ddlOf(body, 'routing')
    chk(routing.length > 0 && !routing.includes('item_id'), '工艺路线不绑定产品', 'routing 仍含 item_id')

    const bom = ddlOf(body, 'bom')
    chk(bom.includes('routing_id') && bom.includes('fk_bom_routing'), 'BOM 通过 routing_id 指定工艺路线', 'BOM 缺少 routing_id 外键')

    const wo = ddlOf(body, 'work_order')
    const woOk = wo.includes('name         VARCHAR') && wo.includes('no           VARCHAR') &&
      wo.includes('factory_id   INT')
    chk(woOk, '工单含 名称 + 编号 + 负责工厂', '工单缺少 name / no / factory_id')

    const partner = ddlOf(body, 'partner')
    chk(partner.includes('partner_type'), '供应商与客户合为 partner 单表', 'partner 缺少 partner_type')

    chk(body.includes('不可手设初值'), '库存余额标注为只能由单据累积', '未标注库存不允许设初值')

    // 外键顺序：被引用表必须先建
    const created = new Set()
    const bads = []
    for (const m of body.matchAll(/CREATE\s+TABLE\s+`?(\w+)`?([\s\S]*?)(?=CREATE\s+TABLE|$)/gi)) {
      for (const r of m[2].matchAll(/REFERENCES\s+`?(\w+)`?/gi)) {
        if (!created.has(r[1]) && r[1] !== m[1]) bads.push(`${m[1]} → ${r[1]}`)
      }
      created.add(m[1])
    }
    chk(bads.length === 0, '建表顺序满足外键依赖', '外键引用尚未创建的表：' + bads.join(', '))
  }

  if (file === 'db/02-data.sql') {
    const inserts = (body.match(/INSERT\s+INTO/gi) || []).length
    pass(`INSERT 语句 ${inserts} 条`)

    chk(!hasRawUser(body), '初始化数据使用 sys_user', '使用保留字 user')

    const dep = (body.match(/INSERT INTO department[\s\S]*?;/i) || [''])[0]
    const par = (body.match(/INSERT INTO partner[\s\S]*?;/i) || [''])[0]
    chk(countRows(dep) >= 3, `部门 ${countRows(dep)} 条`, '部门数据不足 3 条')
    chk(countRows(par) >= 3, `供应商客户 ${countRows(par)} 条`, '供应商客户数据不足 3 条')
    chk(par.includes("'供应商'") && par.includes("'客户'"), '供应商与客户两类都有', '缺少供应商或客户')

    const hardCoded = body.includes('INSERT INTO stock_balance (warehouse_id, item_id, qty) VALUES')
    chk(!hardCoded, '库存无写死的期初值，全部由已确认单据推导', '存在直接写死库存余额的语句（等于设初值）')

    chk(body.includes('已确认') && body.includes('草稿'), '含已确认与草稿两类单据，可演示确认流程', '缺少已确认/草稿单据')

    const bomInsert = (body.match(/INSERT INTO bom \(id, no, item_id, routing_id[\s\S]*?;/i) || [''])[0]
    chk(bomInsert.length > 0, 'BOM 数据携带 routing_id', 'BOM 数据未指定工艺路线')
  }

  if (file === 'db/03-proc.sql') {
    const procs = [...body.matchAll(/CREATE\s+PROCEDURE\s+(\w+)/gi)].map((m) => m[1])
    pass(`存储过程 ${procs.length} 个：${procs.join(', ')}`)

    const drops = (body.match(/DROP\s+PROCEDURE/gi) || []).length
    chk(drops >= procs.length, '执行前先 DROP，可重复运行', 'DROP PROCEDURE 数量少于 CREATE')

    chk(raw.includes('DELIMITER $$'), 'DELIMITER 设置正确', '缺少 DELIMITER 设置')

    const fromBom = body.includes('v_routing_id') && body.includes('FROM bom WHERE item_id')
    chk(fromBom, '下达时从 BOM 取工艺路线', '下达未从 BOM 取工艺路线')
  }

  if (file === 'db/04-queries.sql') {
    const views = (body.match(/CREATE\s+VIEW/gi) || []).length
    const drops = (body.match(/DROP\s+VIEW/gi) || []).length
    pass(`视图 ${views} 个`)
    chk(drops >= views, '视图可重复创建', 'DROP VIEW 数量少于 CREATE VIEW')

    chk(!hasRawUser(body), '查询使用 sys_user', '使用保留字 user')

    const plusMinus = body.includes('AS in_qty') && body.includes('AS out_qty')
    chk(plusMinus, '库存视图含 入库(+)/出库(−) 汇总', '库存视图缺少 +/− 汇总')
    chk(body.includes('change_qty < 0'), '出库量按 − 统计', '未按 − 统计出库')
    chk(body.includes('FROM partner'), '含供应商客户查询', '缺少供应商客户查询')
  }
}

console.log(problems ? `\n共发现 ${problems} 处问题` : '\n全部通过，共 4 个脚本')
if (problems) process.exitCode = 1
