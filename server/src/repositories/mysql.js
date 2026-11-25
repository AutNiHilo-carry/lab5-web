/* MySQL 仓库：接口跟内存版一样，规则都在 services/
 * 用之前先跑 db/01~04
 */

import mysql from 'mysql2/promise'
import { columnsOf } from '../lib/schema.js'

const ALL = [
  'factory', 'workshop', 'department', 'warehouse', 'role', 'sys_user', 'unit', 'item', 'partner',
  'equipment', 'workstation', 'tooling', 'routing', 'routing_detail', 'bom', 'bom_detail',
  'work_order', 'order_material', 'order_task', 'work_report',
  'stock_doc', 'stock_doc_detail', 'stock_balance', 'stock_flow'
]

/* 白名单外的表名直接拒掉，不拼进 SQL */
function table(t) {
  if (ALL.indexOf(t) < 0) throw new Error('未知数据表：' + t)
  return '`' + t + '`'
}

export function createMysqlRepo(pool) {
  const repo = {
    kind: 'mysql',
    pool,

    async all(t) {
      const [rows] = await pool.query(`SELECT * FROM ${table(t)}`)
      return rows
    },

    async find(t, where) {
      const keys = Object.keys(where || {})
      const sql = keys.length
        ? `SELECT * FROM ${table(t)} WHERE ` + keys.map((k) => `\`${k}\` = ?`).join(' AND ')
        : `SELECT * FROM ${table(t)}`
      const [rows] = await pool.query(sql, keys.map((k) => where[k]))
      return rows
    },

    async one(t, where) {
      const rows = await repo.find(t, where)
      return rows[0] || null
    },

    async get(t, id) {
      const [rows] = await pool.query(`SELECT * FROM ${table(t)} WHERE id = ?`, [id])
      return rows[0] || null
    },

    async insert(t, row) {
      const cols = Object.keys(row)
      const sql = `INSERT INTO ${table(t)} (${cols.map((c) => '`' + c + '`').join(',')})
                   VALUES (${cols.map(() => '?').join(',')})`
      const [res] = await pool.query(sql, cols.map((c) => row[c]))
      return repo.get(t, res.insertId)
    },

    async update(t, id, patch) {
      const cols = Object.keys(patch)
      if (!cols.length) return repo.get(t, id)
      const sql = `UPDATE ${table(t)} SET ${cols.map((c) => '`' + c + '` = ?').join(',')} WHERE id = ?`
      await pool.query(sql, [...cols.map((c) => patch[c]), id])
      return repo.get(t, id)
    },

    async remove(t, id) {
      const [res] = await pool.query(`DELETE FROM ${table(t)} WHERE id = ?`, [id])
      return res.affectedRows > 0
    },

    async nextId(t) {
      const [rows] = await pool.query(`SELECT IFNULL(MAX(id), 0) + 1 AS n FROM ${table(t)}`)
      return rows[0].n
    },

    /* 事务：同一个连接里执行，出错回滚；已经在事务里就直接复用 */
    async tx(fn) {
      if (pool.__inTx) return fn(repo)
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        const txRepo = createMysqlRepo(connAdapter(conn))
        const out = await fn(txRepo)
        await conn.commit()
        return out
      } catch (e) {
        try { await conn.rollback() } catch (_) { /* ignore */ }
        throw e
      } finally {
        conn.release()
      }
    },

    // 这几个查询跟 04-queries.sql 里的视图口径一样

    async orderList() {
      const [rows] = await pool.query(`
        SELECT o.id, o.no, o.name, o.item_id AS itemId,
               i.code AS itemCode, i.name AS itemName, o.plan_qty AS planQty,
               o.factory_id AS factoryId, f.name AS factoryName,
               o.workshop_id AS workshopId, w.name AS workshopName,
               o.status, o.priority,
               o.plan_start AS planStart, o.plan_end AS planEnd,
               o.creator_id AS creatorId,
               u.name AS creatorName, o.create_time AS createTime, o.audit_time AS auditTime,
               o.remark,
               IFNULL(t.equip_done_qty, 0) AS lastDoneQty,
               IFNULL(t.inbound_qty, 0) AS inboundQty,
               ROUND(IFNULL(t.equip_done_qty, 0) / o.plan_qty * 100, 1) AS progressPct
        FROM work_order o
        JOIN item i     ON i.id = o.item_id
        JOIN factory f  ON f.id = o.factory_id
        JOIN workshop w ON w.id = o.workshop_id
        JOIN sys_user u ON u.id = o.creator_id
        LEFT JOIN (SELECT x.order_id, x.equip_done_qty, x.inbound_qty
                   FROM order_task x
                   JOIN (SELECT order_id, MAX(seq) AS mx FROM order_task GROUP BY order_id) m
                     ON m.order_id = x.order_id AND m.mx = x.seq) t ON t.order_id = o.id
        ORDER BY o.id DESC`)
      return rows
    },

    async taskProgress(orderId) {
      const [rows] = await pool.query(`
        SELECT t.id AS taskId, t.seq, t.process_name AS processName,
               t.equip_done_qty AS equipDoneQty, t.scrap_qty AS scrapQty, t.status,
               IFNULL(p.equip_done_qty, o.plan_qty) AS prevQualified,
               IFNULL(p.equip_done_qty, o.plan_qty) - t.equip_done_qty - t.scrap_qty AS availableQty,
               IFNULL(p.equip_done_qty, o.plan_qty) - t.equip_done_qty AS wipQty
        FROM order_task t
        JOIN work_order o ON o.id = t.order_id
        LEFT JOIN order_task p ON p.order_id = t.order_id AND p.seq = t.seq - 1
        WHERE t.order_id = ?
        ORDER BY t.seq`, [orderId])
      return rows
    },

    async stockRows() {
      const [rows] = await pool.query(`
        SELECT b.warehouse_id AS warehouseId, b.item_id AS itemId,
               w.name AS warehouseName, i.code AS itemCode, i.name AS itemName,
               i.category, i.spec, un.name AS unitName,
               IFNULL(f.in_qty, 0) AS inQty, IFNULL(f.out_qty, 0) AS outQty,
               IFNULL(f.in_qty, 0) - IFNULL(f.out_qty, 0) AS qty,
               i.safety_stock AS safetyStock,
               IF(IFNULL(f.in_qty, 0) - IFNULL(f.out_qty, 0) < i.safety_stock, '预警', '正常') AS warnFlag
        FROM stock_balance b
        JOIN warehouse w ON w.id = b.warehouse_id
        JOIN item i      ON i.id = b.item_id
        JOIN unit un     ON un.id = i.unit_id
        LEFT JOIN (SELECT warehouse_id, item_id,
                          SUM(IF(change_qty > 0, change_qty, 0))  AS in_qty,
                          SUM(IF(change_qty < 0, -change_qty, 0)) AS out_qty
                   FROM stock_flow GROUP BY warehouse_id, item_id) f
               ON f.warehouse_id = b.warehouse_id AND f.item_id = b.item_id
        ORDER BY b.warehouse_id, b.item_id`)
      return rows
    },

    async flowList(limit = 200) {
      const [rows] = await pool.query(`
        SELECT f.id, f.warehouse_id AS warehouseId, w.name AS warehouseName,
               f.item_id AS itemId, i.code AS itemCode, i.name AS itemName,
               f.change_qty AS changeQty, f.balance_after AS balanceAfter,
               f.doc_id AS docId, f.doc_type AS docType, f.flow_time AS flowTime
        FROM stock_flow f
        JOIN warehouse w ON w.id = f.warehouse_id
        JOIN item i      ON i.id = f.item_id
        ORDER BY f.flow_time DESC, f.id DESC
        LIMIT ?`, [Number(limit)])
      return rows
    },

    async materialStatus(orderId) {
      const [rows] = await pool.query(`
        SELECT m.id, m.order_id AS orderId, m.item_id AS itemId,
               i.code AS itemCode, i.name AS itemName,
               m.req_qty AS reqQty, m.picked_qty AS pickedQty, m.returned_qty AS returnedQty,
               m.req_qty - m.picked_qty + m.returned_qty AS lackQty,
               IF(m.req_qty - m.picked_qty + m.returned_qty <= 0, '已齐套', '欠料') AS status
        FROM order_material m
        JOIN item i ON i.id = m.item_id
        WHERE m.order_id = ?
        ORDER BY m.id`, [orderId])
      return rows
    }
  }

  return repo
}

/* 事务连接适配：让 createMysqlRepo 也能接受单个连接 */
/* 把连接包成和内存仓库一样的接口。外面已经开了事务就直接复用，
   不再嵌套 BEGIN，否则内层 COMMIT 会把外层的事务提前提交掉 */
function connAdapter(conn) {
  return {
    __inTx: true,
    query: (sql, params) => conn.query(sql, params),
    getConnection: async () => conn
  }
}

/** 创建连接池 */
export function createPool(cfg) {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: cfg.connectionLimit || 10,
    charset: 'utf8mb4',
    dateStrings: true,
    decimalNumbers: true
  })
}

export { ALL as MYSQL_TABLES, columnsOf }
