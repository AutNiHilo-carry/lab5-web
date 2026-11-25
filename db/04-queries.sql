--  Lab5 常用查询 / 报表视图
--  对应前端各页面使用的统计数据
--  执行：mysql -u root -p --default-character-set=utf8mb4 < 04-queries.sql
--  先执行 01-schema.sql、02-data.sql
USE lab5_mes;
SET NAMES utf8mb4;

-- 一、视图（供"生产进度""库存预警"等页面直接读取）

-- 1. 工单列表（带工单名称、编号、负责工厂、产品、车间、创建人、进度）
DROP VIEW IF EXISTS v_work_order;
CREATE VIEW v_work_order AS
SELECT o.id, o.no, o.name, i.code AS item_code, i.name AS item_name, o.plan_qty,
       f.name AS factory_name, w.name AS workshop_name, o.status, o.priority,
       o.plan_start, o.plan_end,
       u.name AS creator_name, o.create_time, o.audit_time,
       IFNULL(t.done_qty, 0) AS last_done_qty,
       IFNULL(t.inbound_qty, 0) AS inbound_qty,
       ROUND(IFNULL(t.done_qty, 0) / o.plan_qty * 100, 1) AS progress_pct
FROM work_order o
JOIN item i     ON i.id = o.item_id
JOIN factory f  ON f.id = o.factory_id
JOIN workshop w ON w.id = o.workshop_id
JOIN sys_user u   ON u.id = o.creator_id
LEFT JOIN (SELECT x.order_id, x.equip_done_qty AS done_qty, x.inbound_qty
           FROM order_task x
           JOIN (SELECT order_id, MAX(seq) AS mx FROM order_task GROUP BY order_id) m
             ON m.order_id = x.order_id AND m.mx = x.seq) t
       ON t.order_id = o.id;

-- 2. 各工序生产进度
--    可报工数量 = 上一道合格数（首道 = 计划数量）− 本工序已处理数
--    在制品     = 前一道合格数 − 当前工序已处理数
--    待入库     = 末道合格数 − 累计入库数
DROP VIEW IF EXISTS v_task_progress;
CREATE VIEW v_task_progress AS
SELECT t.id AS task_id, o.no AS order_no, t.seq, t.process_name, t.plan_qty,
       t.equip_done_qty, t.scrap_qty,
       IF(t.seq = 1, o.plan_qty, p.equip_done_qty) AS prev_done_qty,
       IF(t.seq = 1, o.plan_qty, p.equip_done_qty) - t.equip_done_qty - t.scrap_qty AS available_qty,
       IFNULL(p.equip_done_qty, 0) - t.equip_done_qty - t.scrap_qty AS wip_qty,
       t.inbound_qty,
       LAST_VALUE(t.equip_done_qty) OVER (PARTITION BY t.order_id ORDER BY t.seq
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_done_qty,
       t.status, u.name AS owner_name, e.name AS equipment_name, ws.name AS workstation_name
FROM order_task t
JOIN work_order o ON o.id = t.order_id
LEFT JOIN order_task p ON p.order_id = t.order_id AND p.seq = t.seq - 1
LEFT JOIN sys_user u     ON u.id = t.owner_id
LEFT JOIN equipment e  ON e.id = t.equipment_id
LEFT JOIN workstation ws ON ws.id = t.workstation_id;

-- 3. 库存余额：不显示"初始值"，只显示 入库合计(+)、出库合计(−)、当前结存
--    结存 = 入库合计 − 出库合计，与 stock_flow 累加完全一致
DROP VIEW IF EXISTS v_stock_balance;
CREATE VIEW v_stock_balance AS
SELECT b.warehouse_id, w.name AS warehouse_name, b.item_id, i.code AS item_code,
       i.name AS item_name, i.category, i.spec, un.name AS unit_name,
       IFNULL(f.in_qty, 0)  AS in_qty,
       IFNULL(f.out_qty, 0) AS out_qty,
       IFNULL(f.in_qty, 0) - IFNULL(f.out_qty, 0) AS qty,
       i.safety_stock,
       IF(IFNULL(f.in_qty, 0) - IFNULL(f.out_qty, 0) < i.safety_stock, '预警', '正常') AS warn_flag
FROM stock_balance b
JOIN warehouse w ON w.id = b.warehouse_id
JOIN item i      ON i.id = b.item_id
JOIN unit un     ON un.id = i.unit_id
LEFT JOIN (SELECT warehouse_id, item_id,
                  SUM(IF(change_qty > 0, change_qty, 0))  AS in_qty,
                  SUM(IF(change_qty < 0, -change_qty, 0)) AS out_qty
           FROM stock_flow GROUP BY warehouse_id, item_id) f
       ON f.warehouse_id = b.warehouse_id AND f.item_id = b.item_id;

-- 4. 工单齐套情况（需求 / 已领 / 欠料）
DROP VIEW IF EXISTS v_order_material_status;
CREATE VIEW v_order_material_status AS
SELECT m.order_id, o.no AS order_no, m.item_id, i.code AS item_code, i.name AS item_name,
       m.req_qty, m.picked_qty, m.returned_qty,
       ROUND(m.picked_qty - m.returned_qty, 3) AS net_picked_qty,
       ROUND(m.req_qty - (m.picked_qty - m.returned_qty), 3) AS lack_qty
FROM order_material m
JOIN work_order o ON o.id = m.order_id
JOIN item i       ON i.id = m.item_id;

-- 二、常用查询

-- Q1. 待办看板：各状态工单数量
SELECT status AS '工单状态', COUNT(*) AS '数量'
FROM work_order GROUP BY status ORDER BY FIELD(status, '草稿', '已下达', '生产中', '已完工', '已关闭');

-- Q2. 工单生产进度（工单名称 + 负责工厂 + 末道合格 / 已入库 / 待入库）
SELECT o.no AS '工单编号', o.name AS '工单名称', f.name AS '负责工厂',
       i.name AS '产品', o.plan_qty AS '计划数',
       t.equip_done_qty AS '末道合格数',
       t.inbound_qty AS '已入库',
       t.equip_done_qty - t.inbound_qty AS '待入库',
       o.status AS '状态'
FROM work_order o
JOIN item i    ON i.id = o.item_id
JOIN factory f ON f.id = o.factory_id
JOIN (SELECT x.* FROM order_task x
      JOIN (SELECT order_id, MAX(seq) AS mx FROM order_task GROUP BY order_id) m
        ON m.order_id = x.order_id AND m.mx = x.seq) t ON t.order_id = o.id
ORDER BY o.id;

-- Q3. 每张工单的物料齐套率
SELECT order_no AS '工单号',
       COUNT(*) AS '物料种类',
       SUM(IF(lack_qty <= 0, 1, 0)) AS '已齐套种类',
       ROUND(SUM(IF(lack_qty <= 0, 1, 0)) / COUNT(*) * 100, 1) AS '齐套率(%)'
FROM v_order_material_status
GROUP BY order_id, order_no;

-- Q4. 工序任务可报工数量（现场用：某工单还能报多少）
SELECT task_id AS '任务ID', seq AS '工序', process_name AS '工序名',
       equip_done_qty AS '已报合格', scrap_qty AS '已报废',
       available_qty AS '可报工数量', status AS '状态'
FROM v_task_progress
WHERE order_no = 'WO-20261111-001'
ORDER BY seq;

-- Q5. 库存预警：低于安全库存的物料
SELECT warehouse_name AS '仓库', item_code AS '物料编码', item_name AS '物料',
       qty AS '库存', safety_stock AS '安全库存', safety_stock - qty AS '缺口'
FROM v_stock_balance
WHERE warn_flag = '预警'
ORDER BY (safety_stock - qty) DESC;

-- Q6. 出入库流水（最近 20 条）
SELECT f.flow_time AS '时间', w.name AS '仓库', i.code AS '物料编码', i.name AS '物料',
       f.change_qty AS '变动数量', f.balance_after AS '变动后余额',
       f.doc_type AS '单据类型', d.no AS '单据号'
FROM stock_flow f
JOIN warehouse w ON w.id = f.warehouse_id
JOIN item i      ON i.id = f.item_id
LEFT JOIN stock_doc d ON d.id = f.doc_id
ORDER BY f.flow_time DESC, f.id DESC
LIMIT 20;

-- Q7. 个人报工统计（按人、按工序）
SELECT u.name AS '报工人', t.process_name AS '工序',
       COUNT(*) AS '报工次数', SUM(r.qual_qty) AS '合格合计', SUM(r.scrap_qty) AS '报废合计',
       ROUND(SUM(r.scrap_qty) / NULLIF(SUM(r.qual_qty + r.scrap_qty), 0) * 100, 2) AS '报废率(%)'
FROM work_report r
JOIN sys_user u      ON u.id = r.reporter_id
JOIN order_task t  ON t.id = r.task_id
GROUP BY u.id, u.name, t.process_name
ORDER BY `报废率(%)` DESC;

-- Q8. BOM 物料清单（展开某产品）
SELECT b.no AS 'BOM编号', i.code AS '物料编码', i.name AS '物料名称',
       bd.qty_per_unit AS '单件用量', u.name AS '单位'
FROM bom b
JOIN bom_detail bd ON bd.bom_id = b.id
JOIN item i        ON i.id = bd.item_id
JOIN unit u        ON u.id = i.unit_id
WHERE b.no = 'BOM-FG001-01'
ORDER BY bd.id;

-- Q9. 某条工艺路线的完整工序（工艺路线不绑定产品，按编号查）
SELECT r.no AS '路线编号', r.name AS '路线名称', rd.seq AS '顺序', rd.process_name AS '工序',
       rd.equipment_type AS '设备要求', ws.name AS '工位', rd.std_minutes AS '标准工时(分)'
FROM routing r
JOIN routing_detail rd ON rd.routing_id = r.id
LEFT JOIN workstation ws ON ws.id = rd.workstation_id
WHERE r.no = 'RT-X4-01'
ORDER BY rd.seq;

-- Q10. 数据一致性校验：库存余额是否等于流水累加（不应出现 DIFF）
SELECT b.warehouse_id, b.item_id,
       b.qty AS '余额表数量', IFNULL(f.s, 0) AS '流水累加',
       IF(b.qty = IFNULL(f.s, 0), 'OK', 'DIFF') AS '校验结果'
FROM stock_balance b
LEFT JOIN (SELECT warehouse_id, item_id, SUM(change_qty) AS s
           FROM stock_flow GROUP BY warehouse_id, item_id) f
       ON f.warehouse_id = b.warehouse_id AND f.item_id = b.item_id
ORDER BY b.warehouse_id, b.item_id;

-- Q11. 供应商 / 客户清单
SELECT partner_type AS '类型', code AS '编码', name AS '单位名称',
       contact AS '联系人', phone AS '电话', address AS '地址'
FROM partner
ORDER BY partner_type, code;

-- Q12. 部门与车间（平级，同属工厂）
SELECT f.name AS '工厂', '部门' AS '类型', d.code AS '编码', d.name AS '名称', d.leader AS '负责人'
FROM department d JOIN factory f ON f.id = d.factory_id
UNION ALL
SELECT f.name, '车间', w.code, w.name, w.leader
FROM workshop w JOIN factory f ON f.id = w.factory_id
ORDER BY 工厂, 类型, 编码;

-- Q13. 产品 → BOM → 工艺路线（BOM 负责绑定路线）
SELECT i.code AS '产品编码', i.name AS '产品', b.no AS 'BOM编号',
       r.no AS '工艺路线', r.name AS '路线名称',
       (SELECT COUNT(*) FROM routing_detail rd WHERE rd.routing_id = r.id) AS '工序数'
FROM bom b
JOIN item i     ON i.id = b.item_id
LEFT JOIN routing r ON r.id = b.routing_id
WHERE b.status = '启用';
