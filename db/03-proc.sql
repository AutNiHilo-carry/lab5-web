--  Lab5 核心业务存储过程
--  与前端 app/20-api.js 的业务规则一一对应，接后端时可直接复用或改写为 Service
--  执行：mysql -u root -p --default-character-set=utf8mb4 < 03-proc.sql
--  先执行 01-schema.sql、02-data.sql
USE lab5_mes;
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_audit_order;
DROP PROCEDURE IF EXISTS sp_add_report;
DROP PROCEDURE IF EXISTS sp_confirm_stock_doc;

-- 1. 审核下达工单
--    规则：只有草稿/待审核的工单能下达；
--          物料需求按"启用的 BOM × 计划数量"写入；
--          工序任务从 BOM 指定的工艺路线复制，之后改模板不影响已下达工单
DELIMITER $$
CREATE PROCEDURE sp_audit_order(IN p_order_id INT)
BEGIN
  DECLARE v_item_id   INT;
  DECLARE v_plan_qty  DECIMAL(12,3);
  DECLARE v_status    VARCHAR(10);
  DECLARE v_bom_id    INT;
  DECLARE v_routing_id INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT item_id, plan_qty, status INTO v_item_id, v_plan_qty, v_status
  FROM work_order WHERE id = p_order_id FOR UPDATE;

  IF v_item_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '工单不存在';
  END IF;
  IF v_status NOT IN ('草稿', '待审核') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '只有草稿/待审核的工单可以审核下达';
  END IF;

  SELECT id, routing_id INTO v_bom_id, v_routing_id
  FROM bom WHERE item_id = v_item_id AND status = '启用' LIMIT 1;
  IF v_bom_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '该产品未维护有效的物料清单（BOM），无法下达';
  END IF;
  IF v_routing_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '该产品的 BOM 未指定工艺路线，无法下达';
  END IF;

  -- 写物料需求：单件用量 × 计划数量
  INSERT INTO order_material (order_id, item_id, req_qty, picked_qty, returned_qty)
  SELECT p_order_id, bd.item_id, ROUND(bd.qty_per_unit * v_plan_qty, 3), 0, 0
  FROM bom_detail bd WHERE bd.bom_id = v_bom_id;

  -- 复制工序：按 BOM 指定的那条路线
  INSERT INTO order_task (order_id, seq, process_name, equipment_type, plan_qty,
                          equip_done_qty, scrap_qty, workstation_id, status, inbound_qty)
  SELECT p_order_id, rd.seq, rd.process_name, rd.equipment_type, v_plan_qty,
         0, 0, rd.workstation_id, '待开始', 0
  FROM routing_detail rd
  WHERE rd.routing_id = v_routing_id
  ORDER BY rd.seq;

  UPDATE work_order
  SET status = '已下达', audit_time = NOW()
  WHERE id = p_order_id;

  COMMIT;

  SELECT p_order_id AS order_id,
         (SELECT COUNT(*) FROM order_material WHERE order_id = p_order_id) AS material_lines,
         (SELECT COUNT(*) FROM order_task     WHERE order_id = p_order_id) AS task_lines,
         '审核下达成功' AS msg;
END$$

-- 2. 工序报工
--    规则：已完工/已关闭的工单不能报工；
--          合格数、报废数都得 ≥ 0，合计要大于 0；
--          本工序"合格+报废"累计不能超过上一道移交的合格数，
--          首道工序按工单计划数量算上限；
--          报工往工序任务上累加，报满算这道完成；工单从"已下达"自动转"生产中"
CREATE PROCEDURE sp_add_report(
  IN p_task_id     INT,
  IN p_qual_qty    DECIMAL(12,3),
  IN p_scrap_qty   DECIMAL(12,3),
  IN p_reporter_id INT,
  IN p_remark      VARCHAR(255)
)
BEGIN
  DECLARE v_order_id   INT;
  DECLARE v_seq        INT;
  DECLARE v_done       DECIMAL(12,3);
  DECLARE v_scrap      DECIMAL(12,3);
  DECLARE v_limit      DECIMAL(12,3);
  DECLARE v_prev_done  DECIMAL(12,3);
  DECLARE v_available  DECIMAL(12,3);
  DECLARE v_order_status VARCHAR(10);
  DECLARE v_task_status  VARCHAR(10);
  DECLARE v_product_name VARCHAR(80);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT t.order_id, t.seq, t.equip_done_qty, t.scrap_qty, t.status,
         o.status, CONCAT(i.code, ' ', i.name)
    INTO v_order_id, v_seq, v_done, v_scrap, v_task_status, v_order_status, v_product_name
  FROM order_task t
  JOIN work_order o ON o.id = t.order_id
  JOIN item i       ON i.id = o.item_id
  WHERE t.id = p_task_id
  FOR UPDATE;

  IF v_order_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '工序任务不存在';
  END IF;
  IF v_order_status IN ('已完工', '已关闭') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '工单已结束，不能报工';
  END IF;
  IF p_qual_qty < 0 OR p_scrap_qty < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '合格数与报废数不能为负数';
  END IF;
  IF p_qual_qty + p_scrap_qty <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '本次报工数量必须大于 0';
  END IF;

  -- 可报工数量 = 上一道合格数（首道 = 计划数量）− 本工序已处理数
  IF v_seq = 1 THEN
    SELECT plan_qty INTO v_limit FROM work_order WHERE id = v_order_id;
  ELSE
    SELECT equip_done_qty INTO v_prev_done
    FROM order_task WHERE order_id = v_order_id AND seq = v_seq - 1;
    SET v_limit = IFNULL(v_prev_done, 0);
  END IF;
  SET v_available = v_limit - v_done - v_scrap;

  IF p_qual_qty + p_scrap_qty > v_available + 0.0001 THEN
    SET @msg = CONCAT('超出可报工数量：本工序最多还能报 ', v_available, ' 台');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @msg;
  END IF;

  INSERT INTO work_report (order_id, task_id, qual_qty, scrap_qty, reporter_id, report_time, remark)
  VALUES (v_order_id, p_task_id, p_qual_qty, p_scrap_qty, p_reporter_id, NOW(), IFNULL(p_remark, ''));

  SET v_done  = v_done + p_qual_qty;
  SET v_scrap = v_scrap + p_scrap_qty;

  UPDATE order_task
  SET equip_done_qty = v_done,
      scrap_qty      = v_scrap,
      status = CASE
                 WHEN v_done + v_scrap >= v_limit - 0.0001 THEN '已完成'
                 WHEN status = '待开始' THEN '进行中'
                 ELSE status
               END
  WHERE id = p_task_id;

  IF v_order_status = '已下达' THEN
    UPDATE work_order SET status = '生产中' WHERE id = v_order_id;
  END IF;

  COMMIT;

  SELECT v_product_name AS product, v_available AS before_qty,
         p_qual_qty AS qual_qty, p_scrap_qty AS scrap_qty, '报工成功' AS msg;
END$$

-- 3. 确认库存单据（草稿 → 已确认）
--    规则：不能重复确认，单据要有明细；
--          领料/退料/成品入库必须挂工单；
--          出库类逐行查库存，有一行不够就整单回滚；
--          退料不超过"已领未退"，成品入库不超过末道"待入库"；
--          先整体校验再统一动库存，动一次写一条流水；
--          最后回写工单物料的已领/已退和末道已入库
CREATE PROCEDURE sp_confirm_stock_doc(IN p_doc_id INT)
BEGIN
  DECLARE v_doc_type    VARCHAR(10);
  DECLARE v_wh_id       INT;
  DECLARE v_order_id    INT;
  DECLARE v_status      VARCHAR(10);
  DECLARE v_is_inbound  TINYINT;

  DECLARE v_item_id     INT;
  DECLARE v_qty         DECIMAL(12,3);
  DECLARE v_item_name   VARCHAR(100);
  DECLARE v_balance     DECIMAL(12,3);
  DECLARE v_returnable  DECIMAL(12,3);
  DECLARE v_wait_in     DECIMAL(12,3);
  DECLARE v_last_task   INT;
  DECLARE v_lines       INT;
  DECLARE v_done        TINYINT DEFAULT 0;

  DECLARE cur CURSOR FOR
    SELECT item_id, qty FROM stock_doc_detail WHERE doc_id = p_doc_id ORDER BY id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT doc_type, warehouse_id, order_id, status
    INTO v_doc_type, v_wh_id, v_order_id, v_status
  FROM stock_doc WHERE id = p_doc_id FOR UPDATE;

  IF v_doc_type IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '单据不存在';
  END IF;
  IF v_status = '已确认' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '该单据已确认，不能重复确认';
  END IF;

  SELECT COUNT(*) INTO v_lines FROM stock_doc_detail WHERE doc_id = p_doc_id;
  IF v_lines = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '单据没有任何明细，不能确认';
  END IF;

  IF v_doc_type IN ('生产领料', '生产退料', '成品入库') AND v_order_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '生产领料/生产退料/成品入库必须关联生产工单';
  END IF;

  SET v_is_inbound = IF(v_doc_type IN ('采购入库', '生产退料', '成品入库'), 1, 0);

  -- 第一遍：逐行校验，有任何一行不过就整单报错
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_item_id, v_qty;
    IF v_done = 1 THEN LEAVE read_loop; END IF;

    SELECT CONCAT(code, ' ', name) INTO v_item_name FROM item WHERE id = v_item_id;

    IF v_qty <= 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '明细数量必须大于 0';
    END IF;

    IF v_is_inbound = 0 THEN
      SELECT IFNULL(qty, 0) INTO v_balance
      FROM stock_balance WHERE warehouse_id = v_wh_id AND item_id = v_item_id;
      SET v_balance = IFNULL(v_balance, 0);
      IF v_balance < v_qty THEN
        SET @msg = CONCAT(v_item_name, ' 库存不足：当前 ', v_balance, '，需要 ', v_qty);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @msg;
      END IF;
    END IF;

    IF v_doc_type = '生产退料' THEN
      SELECT picked_qty - returned_qty INTO v_returnable
      FROM order_material WHERE order_id = v_order_id AND item_id = v_item_id;
      IF IFNULL(v_returnable, 0) < v_qty THEN
        SET @msg = CONCAT(v_item_name, ' 退料数量超过可退数量（可退 ', IFNULL(v_returnable, 0), '）');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @msg;
      END IF;
    END IF;

    IF v_doc_type = '成品入库' THEN
      SELECT equip_done_qty - inbound_qty INTO v_wait_in
      FROM order_task WHERE order_id = v_order_id ORDER BY seq DESC LIMIT 1;
      IF IFNULL(v_wait_in, 0) < v_qty THEN
        SET @msg = CONCAT(v_item_name, ' 入库数量超过待入库数量：当前待入库 ', IFNULL(v_wait_in, 0));
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @msg;
      END IF;
    END IF;
  END LOOP;
  CLOSE cur;

  -- 第二遍：校验通过，开始动库存
  SET v_done = 0;
  OPEN cur;
  exec_loop: LOOP
    FETCH cur INTO v_item_id, v_qty;
    IF v_done = 1 THEN LEAVE exec_loop; END IF;

    -- 21. 库存余额：没有记录则先建 0
    INSERT INTO stock_balance (warehouse_id, item_id, qty)
    VALUES (v_wh_id, v_item_id, 0)
    ON DUPLICATE KEY UPDATE qty = qty;

    UPDATE stock_balance
    SET qty = ROUND(qty + IF(v_is_inbound = 1, v_qty, -v_qty), 3)
    WHERE warehouse_id = v_wh_id AND item_id = v_item_id;

    -- 22. 出入库流水
    INSERT INTO stock_flow (warehouse_id, item_id, change_qty, balance_after, doc_id, doc_type, flow_time)
    SELECT v_wh_id, v_item_id, IF(v_is_inbound = 1, v_qty, -v_qty), qty, p_doc_id, v_doc_type, NOW()
    FROM stock_balance WHERE warehouse_id = v_wh_id AND item_id = v_item_id;

    -- 16. 回写工单物料
    IF v_doc_type = '生产领料' THEN
      UPDATE order_material SET picked_qty = picked_qty + v_qty
      WHERE order_id = v_order_id AND item_id = v_item_id;
    END IF;
    IF v_doc_type = '生产退料' THEN
      UPDATE order_material SET returned_qty = returned_qty + v_qty
      WHERE order_id = v_order_id AND item_id = v_item_id;
    END IF;
    IF v_doc_type = '成品入库' THEN
      UPDATE order_task SET inbound_qty = inbound_qty + v_qty
      WHERE order_id = v_order_id AND seq = (SELECT max_seq FROM (SELECT MAX(seq) AS max_seq FROM order_task WHERE order_id = v_order_id) x);
    END IF;
  END LOOP;
  CLOSE cur;

  -- 19. 单据状态
  UPDATE stock_doc SET status = '已确认', confirm_time = NOW() WHERE id = p_doc_id;

  COMMIT;

  SELECT p_doc_id AS doc_id, v_doc_type AS doc_type, v_lines AS lines_affected, '确认成功' AS msg;
END$$

DELIMITER ;

-- 演示顺序：下达草稿工单 → 确认采购入库草稿 → 报工
-- CALL sp_audit_order(2);
-- CALL sp_confirm_stock_doc(6);
-- CALL sp_add_report(3, 5, 0, 3, '电气安装补报');
