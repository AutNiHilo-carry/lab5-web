--  Lab5 基础数据（数据字典）初始化脚本
--  跟前端 app/10-db.js 的 seed() 是同一套数据，方便联调时对照
--  执行：mysql -u root -p --default-character-set=utf8mb4 < 02-data.sql
--  先执行 01-schema.sql
USE lab5_mes;
SET NAMES utf8mb4;

-- 一、基础资料
INSERT INTO factory (id, code, name, address, contact, leader, remark) VALUES
 (1, 'F01', '星航无人机总装厂', '深圳市南山区科技园北区 8 号', '0755-8666 8888', '周建国', '整机总装与检测基地'),
 (2, 'F02', '星航精密结构件厂', '东莞市松山湖工业园 3 号',    '0769-2233 4455', '吴海涛', '结构件加工');

INSERT INTO workshop (id, code, name, factory_id, leader, remark) VALUES
 (1, 'WS01', '机加工车间',   1, '赵磊', '下料、折弯、组框'),
 (2, 'WS02', '总装车间',     1, '王强', '整机装配与电气安装'),
 (3, 'WS03', '质量检测车间', 1, '孙悦', '调试、检测、包装');

-- 部门（与车间平级，同属工厂）
INSERT INTO department (id, code, name, factory_id, leader, remark) VALUES
 (1, 'DP01', '生产计划部', 1, '李彦', '工单编制与下达'),
 (2, 'DP02', '采购部',     1, '钱伟', '原材料采购与供应商管理'),
 (3, 'DP03', '仓储物流部', 1, '陈静', '仓库与出入库单据'),
 (4, 'DP04', '质量部',     1, '孙悦', '来料、过程与成品检验'),
 (5, 'DP05', '销售部',     1, '赵敏', '客户与销售出库');

INSERT INTO warehouse (id, code, name, factory_id, type, leader, remark) VALUES
 (1, 'WH01', '原材料仓', 1, '原料库',   '陈静', '电机、桨叶、结构件等'),
 (2, 'WH02', '成品仓',   1, '成品库',   '陈静', '待发货整机'),
 (3, 'WH03', '半成品仓', 1, '半成品库', '陈静', '机架总成等在制品');

INSERT INTO role (id, code, name, remark, perms) VALUES
 (1, 'R01', '系统管理员', '全部权限', '["*"]'),
 (2, 'R02', '计划员', '建单、下达工单、派工', '["dashboard", "base/factory", "base/partner", "base/item", "tech/bom", "tech/routing", "prod/order", "prod/wip", "prod/task", "prod/progress", "wms/doc", "wms/stock", "about"]'),
 (3, 'R03', '操作员', '按工序报工', '["dashboard", "prod/order", "prod/wip", "prod/task", "prod/report", "about"]'),
 (4, 'R04', '仓管员', '出入库单据办理', '["dashboard", "base/warehouse", "base/item", "wms/doc", "wms/stock", "wms/flow", "about"]');

INSERT INTO sys_user (id, account, name, role_id, department_id, workshop_id, phone, status, password) VALUES
 (1, 'admin',        '张明', 1, NULL, NULL, '13800000001', '启用', '123456'),
 (2, 'planner',      '李彦', 2, 1,    NULL, '13800000002', '启用', '123456'),
 (3, 'op_assembly',  '王强', 3, NULL, 2,    '13800000003', '启用', '123456'),
 (4, 'op_machining', '赵磊', 3, NULL, 1,    '13800000004', '启用', '123456'),
 (5, 'op_quality',   '孙悦', 3, 4,    NULL, '13800000005', '启用', '123456'),
 (6, 'warehouse',    '陈静', 4, 3,    NULL, '13800000006', '启用', '123456');

INSERT INTO unit (id, code, name, remark) VALUES
 (1, 'U01', '台', ''), (2, 'U02', '个', ''), (3, 'U03', '套', ''),
 (4, 'U04', '米', ''), (5, 'U05', '块', ''), (6, 'U06', '卷', '');

INSERT INTO item (id, code, name, category, unit_id, spec, safety_stock, ref_price, sub_category, remark) VALUES
 (1, 'FG-001', '玄鸟 X4 四旋翼巡检无人机', '成品', 1, '轴距 450mm', 5, 12000, '整机', '旗舰巡检机型'),
 (2, 'FG-002', '玄武 X6 六旋翼载重无人机', '成品', 1, '轴距 680mm', 3, 26000, '整机', '重载平台'),
 (3, 'SF-001', '玄鸟 X4 碳纤维机架总成', '半成品', 3, '碳纤维折叠机架', 10, 600, '结构件', '巡检机自制结构件'),
 (4, 'RM-001', '无刷电机 2212', '原材料', 2, '920KV', 200, 180, '动力件', ''),
 (5, 'RM-002', '螺旋桨 9450', '原材料', 2, '自紧桨', 400, 25, '动力件', ''),
 (6, 'RM-003', '电子调速器 30A', '原材料', 2, '支持 PWM', 200, 60, '电子件', ''),
 (7, 'RM-004', '飞控主板 PX4', '原材料', 2, '带 GPS 模块', 50, 900, '电子件', ''),
 (8, 'RM-005', '锂电池 4S 5200mAh', '原材料', 5, '25C 放电', 30, 320, '动力件', ''),
 (9, 'RM-006', '碳纤维方管 16mm', '原材料', 4, '3K 斜纹', 300, 45, '结构件', ''),
 (10, 'RM-007', '内六角螺丝 M3*8', '原材料', 2, '不锈钢', 5000, 0.05, '标准件', ''),
 (11, 'RM-008', '折叠机臂', '原材料', 2, '含折叠件', 100, 120, '结构件', ''),
 (12, 'RM-009', '三轴云台相机', '原材料', 2, '4K 变焦', 20, 1500, '电子件', ''),
 (13, 'RM-010', '铝合金包装箱', '原材料', 2, '带防震棉', 40, 80, '包装件', '');

-- 供应商 / 客户
INSERT INTO partner (id, code, name, partner_type, contact, phone, address, remark) VALUES
 (1, 'SUP-001', '深圳市瑞达电机有限公司',   '供应商', '周立', '0755-8123 4567', '深圳市宝安区福永街道 12 号', '电机、电调速器主供'),
 (2, 'SUP-002', '东莞市恒力复材有限公司',   '供应商', '林芳', '0769-8877 6655', '东莞市松山湖工业园 6 号',   '碳纤维方管、机臂'),
 (3, 'SUP-003', '广州市芯航电子有限公司',   '供应商', '黄强', '020-6688 9900',  '广州市黄埔区科学城 3 号',   '飞控主板、云台相机'),
 (4, 'CUS-001', '深圳市天翼巡检科技有限公司', '客户',   '吴敏', '0755-8999 1122', '深圳市南山区高新南一道 5 号', '巡检服务商，长期客户'),
 (5, 'CUS-002', '东莞市电力巡维中心',       '客户',   '郑海', '0769-2211 3344', '东莞市南城区莞太路 88 号',   '电网巡检项目');

-- 设备 / 工位 / 工装
INSERT INTO equipment (id, code, name, workshop_id, model, status, remark) VALUES
 (1, 'EQ-01', '激光切割机',   1, 'LC-1325', '正常', ''),
 (2, 'EQ-02', '数控折弯机',   1, 'NC-40',   '正常', ''),
 (3, 'EQ-03', '电动装配台',   2, 'AS-200',  '正常', ''),
 (4, 'EQ-04', '智能电批',     2, 'ES-30',   '检修', ''),
 (5, 'EQ-05', '综合测试台',   3, 'TT-800',  '正常', ''),
 (6, 'EQ-06', '桨叶动平衡仪', 3, 'DB-12',   '正常', '');

INSERT INTO workstation (id, code, name, workshop_id, location, remark) VALUES
 (1, 'ST-01', '备料工位',   1, '一楼 A 区', ''),
 (2, 'ST-02', '装配工位一', 2, '二楼 B 区', ''),
 (3, 'ST-03', '装配工位二', 2, '二楼 B 区', ''),
 (4, 'ST-04', '调试工位',   3, '三楼 C 区', ''),
 (5, 'ST-05', '检测工位',   3, '三楼 C 区', ''),
 (6, 'ST-06', '包装工位',   2, '一楼 D 区', '');

INSERT INTO tooling (id, code, name, workshop_id, model, remark) VALUES
 (1, 'TL-01', '机架焊接工装', 1, 'J-01', ''),
 (2, 'TL-02', '电机安装治具', 2, 'J-02', ''),
 (3, 'TL-03', '动平衡夹具',   3, 'J-03', '');

-- 二、工艺路线（主 + 明细）—— 通用工序模板，不绑定产品
INSERT INTO routing (id, no, name, version, status, remark) VALUES
 (1, 'RT-X4-01',      '四旋翼总装标准路线', 'V1.0', '启用', '备料→装配→电气→调试→检测→包装'),
 (2, 'RT-X6-01',      '六旋翼总装标准路线', 'V1.0', '启用', '含载重测试工序'),
 (3, 'RT-FRAME-01',   '机架总成加工路线',   'V1.0', '启用', '下料→组框→加固');

INSERT INTO routing_detail (routing_id, seq, process_name, equipment_type, workstation_id, std_minutes) VALUES
 (1, 1, '备料下料', '激光切割机', 1, 30), (1, 2, '机架装配', '电动装配台', 2, 60),
 (1, 3, '电气安装', '智能电批',   3, 45), (1, 4, '整机调试', '综合测试台', 4, 40),
 (1, 5, '整机检测', '综合测试台', 5, 20), (1, 6, '包装入库', '无',         6, 15),
 (2, 1, '备料下料', '激光切割机', 1, 35), (2, 2, '机架装配', '电动装配台', 2, 75),
 (2, 3, '电气安装', '智能电批',   3, 60), (2, 4, '整机调试', '综合测试台', 4, 50),
 (2, 5, '载重测试', '综合测试台', 5, 30), (2, 6, '包装入库', '无',         6, 20),
 (3, 1, '下料',     '激光切割机', 1, 20), (3, 2, '组框',     '数控折弯机', 1, 40),
 (3, 3, '加固',     '电动装配台', 2, 25);

-- 三、BOM（主 + 明细）—— BOM 指定该产品用哪条工艺路线
INSERT INTO bom (id, no, item_id, routing_id, version, status, remark) VALUES
 (1, 'BOM-FG001-01', 1, 1, 'V1.0', '启用', '四旋翼标准配置，走四旋翼总装路线'),
 (2, 'BOM-FG002-01', 2, 2, 'V1.0', '启用', '六旋翼标准配置，走六旋翼总装路线'),
 (3, 'BOM-SF001-01', 3, 3, 'V1.0', '启用', '机架总成，走机架加工路线');

-- 四旋翼 X4：一台整机 = 4 个电机 + 8 支桨 + …
INSERT INTO bom_detail (bom_id, item_id, qty_per_unit) VALUES
 (1,  4, 4.0), (1,  5, 8.0), (1,  6, 4.0), (1,  7, 1.0), (1,  8, 1.0),
 (1,  9, 3.5), (1, 10, 24.0), (1, 11, 4.0), (1, 12, 1.0), (1, 13, 1.0);

-- 六旋翼 X6
INSERT INTO bom_detail (bom_id, item_id, qty_per_unit) VALUES
 (2,  4, 6.0), (2,  5, 12.0), (2,  6, 6.0), (2,  7, 1.0), (2,  8, 1.0),
 (2,  9, 4.8), (2, 10, 36.0), (2, 11, 6.0), (2, 12, 1.0), (2, 13, 1.0);

-- 机架总成
INSERT INTO bom_detail (bom_id, item_id, qty_per_unit) VALUES
 (3, 11, 4.0), (3,  9, 3.5), (3, 10, 16.0);

-- 四、演示工单：WO-20250918-001（生产中，四旋翼 20 台）
--     审核下达后由程序（或 04-proc.sql）生成物料需求与 6 道工序任务
INSERT INTO work_order (id, no, name, item_id, plan_qty, factory_id, workshop_id, status, plan_start, plan_end,
                        creator_id, create_time, audit_time, priority, remark) VALUES
 (1, 'WO-20261111-001', 'X4 巡检机首批生产', 1, 20, 1, 2, '生产中', DATE_SUB(CURDATE(), INTERVAL 6 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY),
  2, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 7 DAY), '09:12:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 7 DAY), '10:30:00'), '高', '巡检项目首批订单'),
 (2, 'WO-20261111-002', 'X6 载重机试产', 2, 10, 1, 2, '草稿',  DATE_ADD(CURDATE(), INTERVAL 2 DAY), DATE_ADD(CURDATE(), INTERVAL 10 DAY),
  2, TIMESTAMP(CURDATE(), '08:40:00'), NULL, '中', '载重机型试产'),
 (3, 'WO-20261030-001', 'X4 第二批交付', 1, 15, 1, 2, '已完工', DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_SUB(CURDATE(), INTERVAL 12 DAY),
  2, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 21 DAY), '09:00:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 21 DAY), '09:40:00'), '中', ''),
 (4, 'WO-20261025-003', '机架总成备件加工', 3, 30, 2, 1, '已关闭', DATE_SUB(CURDATE(), INTERVAL 26 DAY), DATE_SUB(CURDATE(), INTERVAL 22 DAY),
  2, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 27 DAY), '13:20:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 27 DAY), '14:00:00'), '低', '客户改型，剩余任务终止');

-- 工单 1 的物料需求（BOM 单件用量 × 20）
INSERT INTO order_material (order_id, item_id, req_qty, picked_qty, returned_qty) VALUES
 (1,  4, 80.0, 80.0, 0.0),  (1,  5, 160.0, 160.0, 4.0), (1,  6, 80.0, 80.0, 0.0),
 (1,  7, 20.0, 20.0, 0.0),  (1,  8, 20.0, 20.0, 0.0),   (1,  9, 70.0, 70.0, 0.0),
 (1, 10, 480.0, 480.0, 0.0),(1, 11, 80.0, 80.0, 0.0),  (1, 12, 20.0, 20.0, 0.0),
 (1, 13, 20.0, 20.0, 0.0);

-- 工单 1 的工序任务（含派工信息）
INSERT INTO order_task (order_id, seq, process_name, equipment_type, plan_qty,
                        equip_done_qty, scrap_qty, equipment_id, workstation_id, tooling_id,
                        owner_id, plan_start, plan_end, status, inbound_qty, remark) VALUES
 (1, 1, '备料下料', '激光切割机', 20, 19, 1, 1, 1, 1, 3, DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY), '已完成', 0, ''),
 (1, 2, '机架装配', '电动装配台', 20, 18, 1, 3, 2, 2, 3, DATE_SUB(CURDATE(), INTERVAL 4 DAY), DATE_SUB(CURDATE(), INTERVAL 2 DAY), '已完成', 0, ''),
 (1, 3, '电气安装', '智能电批',   20, 10, 0, 4, 3, 2, 3, DATE_SUB(CURDATE(), INTERVAL 3 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), '进行中', 0, ''),
 (1, 4, '整机调试', '综合测试台', 20,  0, 0, 5, 4, NULL, 5, DATE_SUB(CURDATE(), INTERVAL 2 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), '进行中', 0, ''),
 (1, 5, '整机检测', '综合测试台', 20,  0, 0, 5, 5, 3, 5, DATE_SUB(CURDATE(), INTERVAL 2 DAY), CURDATE(), '待开始', 0, ''),
 (1, 6, '包装入库', '无',         20,  0, 0, NULL, 6, NULL, 5, DATE_SUB(CURDATE(), INTERVAL 1 DAY), CURDATE(), '待开始', 0, '');

-- 工单 1 的报工记录
INSERT INTO work_report (order_id, task_id, qual_qty, scrap_qty, reporter_id, report_time, remark) VALUES
 (1, 1, 12, 0, 3, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 5 DAY), '10:00:00'), ''),
 (1, 1,  7, 1, 3, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 5 DAY), '15:30:00'), '桨叶动平衡超差'),
 (1, 2, 10, 0, 3, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '10:00:00'), ''),
 (1, 2,  8, 1, 3, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '16:20:00'), '螺丝孔滑牙'),
 (1, 3, 10, 0, 3, TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 3 DAY), '11:00:00'), '');

-- 工单 3（已完工）：15 台全部报工并入库
INSERT INTO order_material (order_id, item_id, req_qty, picked_qty, returned_qty)
SELECT 3, item_id, qty_per_unit * 15, qty_per_unit * 15, 0 FROM bom_detail WHERE bom_id = 1;

INSERT INTO order_task (order_id, seq, process_name, equipment_type, plan_qty, equip_done_qty, scrap_qty,
                        equipment_id, workstation_id, owner_id, plan_start, plan_end, status, inbound_qty, remark)
SELECT 3, seq, process_name, equipment_type, 15,
       IF(seq = 1, 14, 15), IF(seq = 1, 1, 0),
       ELT(seq, 1, 3, 4, 5, 5, NULL), ELT(seq, 1, 2, 3, 4, 5, 6),
       IF(seq <= 3, 3, 5),
       DATE_SUB(CURDATE(), INTERVAL (19 - seq) DAY), DATE_SUB(CURDATE(), INTERVAL (17 - seq) DAY),
       '已完成', IF(seq = 6, 15, 0), ''
FROM routing_detail WHERE routing_id = 1;

INSERT INTO work_report (order_id, task_id, qual_qty, scrap_qty, reporter_id, report_time, remark)
SELECT 3, id, IF(seq = 1, 14, 15), IF(seq = 1, 1, 0), IF(seq <= 3, 3, 5),
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL (19 - seq) DAY), '14:00:00'), ''
FROM order_task WHERE order_id = 3;

-- 工单 4（已关闭）：机架总成 30 套，前 3 道工序报工后终止
INSERT INTO order_material (order_id, item_id, req_qty, picked_qty, returned_qty)
SELECT 4, item_id, qty_per_unit * 30, qty_per_unit * 30, 0 FROM bom_detail WHERE bom_id = 3;

INSERT INTO order_task (order_id, seq, process_name, equipment_type, plan_qty, equip_done_qty, scrap_qty,
                        equipment_id, workstation_id, owner_id, status, inbound_qty, remark)
SELECT 4, seq, process_name, equipment_type, 30,
       IF(seq = 1, 30, 28), IF(seq = 1, 0, 2),
       ELT(seq, 1, 2, 3), ELT(seq, 1, 1, 2), 4, '已完成', 0, ''
FROM routing_detail WHERE routing_id = 3;

INSERT INTO work_report (order_id, task_id, qual_qty, scrap_qty, reporter_id, report_time, remark)
SELECT 4, id, IF(seq = 1, 30, 28), IF(seq = 1, 0, 2), 4,
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL (25 - seq) DAY), '11:00:00'), ''
FROM order_task WHERE order_id = 4;

-- 五、演示库存单据（已确认单据才影响余额与流水）
INSERT INTO stock_doc (id, no, doc_type, warehouse_id, order_id, partner_id, amount, status, creator_id, create_time, confirm_time, remark) VALUES
 (1, 'RK-20261029-001', '采购入库', 1, NULL, 1, 140400, '已确认', 6,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 10 DAY), '09:30:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 10 DAY), '10:00:00'), '电机、桨叶、标准件到货'),
 (2, 'LL-20261104-002', '生产领料', 1, 1, NULL, 0, '已确认', 6,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 7 DAY), '11:00:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 7 DAY), '11:20:00'), '工单 WO-20261111-001 首批领料'),
 (3, 'RL-20261106-001', '生产退料', 1, 1, NULL, 0, '已确认', 6,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 5 DAY), '16:00:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 5 DAY), '16:10:00'), '桨叶来料不良退回'),
 (4, 'CP-20261107-001', '成品入库', 2, 3, NULL, 0, '已确认', 6,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '15:00:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 4 DAY), '15:05:00'), ''),
 (5, 'XS-20261109-001', '销售出库', 2, NULL, 4, 36000, '已确认', 6,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '10:00:00'),
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '10:30:00'), '深圳市天翼巡检科技有限公司'),
 (6, 'RK-20261111-002', '采购入库', 1, NULL, 1, 21600, '草稿', 6,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 0 DAY), '09:00:00'),
     NULL, '电机、电调补货（草稿，待确认）'),
 (7, 'LL-20261111-003', '生产领料', 1, 1, NULL, 0, '草稿', 6,
     TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL 0 DAY), '09:20:00'),
     NULL, '工单二次领料（草稿，待确认）');

INSERT INTO stock_doc_detail (doc_id, item_id, qty) VALUES
 (1,  4, 200), (1,  5, 400), (1, 10, 5000), (1,  7, 30), (1,  8, 25),
 (1, 12, 20),  (1, 13, 40),  (1, 11, 80),   (1,  9, 150),(1,  6, 160),
 (2,  4, 80),  (2,  5, 160), (2,  6, 80),   (2,  7, 20), (2,  8, 20),
 (2,  9, 70),  (2, 10, 480), (2, 11, 80),   (2, 12, 20), (2, 13, 20),
 (3,  5, 4),
 (4,  1, 15),
 (5,  1, 3),
 (6,  4, 100), (6,  6, 60),
 (7,  7, 5),   (7,  8, 5);

-- 六、由已确认单据推导库存余额与流水
--     规则：入库 = 采购入库/生产退料/成品入库，出库 = 生产领料/销售出库
-- 重要：库存不设任何期初值。余额只能由上面这些已确认单据按 +入库 / −出库 累加而来，
--       没有来源单据的物料按 0 算（余额表里干脆不出现），"余额 = 流水累加"才不会被破坏。
INSERT INTO stock_balance (warehouse_id, item_id, qty)
SELECT d.warehouse_id, dd.item_id,
       SUM(IF(d.doc_type IN ('采购入库', '生产退料', '成品入库'), dd.qty, -dd.qty))
FROM stock_doc d
JOIN stock_doc_detail dd ON dd.doc_id = d.id
WHERE d.status = '已确认'
GROUP BY d.warehouse_id, dd.item_id;

-- 流水：按单据确认时间顺序，逐条累加算出变动后余额
INSERT INTO stock_flow (warehouse_id, item_id, change_qty, balance_after, doc_id, doc_type, flow_time)
SELECT d.warehouse_id, dd.item_id,
       c.change_qty, c.running_balance, d.id, d.doc_type, d.confirm_time
FROM stock_doc_detail dd
JOIN stock_doc d ON d.id = dd.doc_id AND d.status = '已确认'
JOIN (
  SELECT dd2.id AS detail_id,
         IF(d2.doc_type IN ('采购入库', '生产退料', '成品入库'), dd2.qty, -dd2.qty) AS change_qty,
         SUM(IF(d2.doc_type IN ('采购入库', '生产退料', '成品入库'), dd2.qty, -dd2.qty))
           OVER (PARTITION BY d2.warehouse_id, dd2.item_id ORDER BY d2.confirm_time, d2.id, dd2.id) AS running_balance
  FROM stock_doc d2
  JOIN stock_doc_detail dd2 ON dd2.doc_id = d2.id
  WHERE d2.status = '已确认'
) c ON c.detail_id = dd.id
ORDER BY d.confirm_time, d.id, dd.id;

-- 校验：库存余额必须等于"所有已确认单据的流水累加"（不应有任何 DIFF）
SELECT '库存余额核对' AS chk,
       b.warehouse_id, b.item_id, b.qty AS balance_qty,
       IFNULL(f.sum_change, 0) AS flow_sum,
       IF(b.qty = IFNULL(f.sum_change, 0), 'OK', 'DIFF') AS result
FROM stock_balance b
LEFT JOIN (SELECT warehouse_id, item_id, SUM(change_qty) AS sum_change
           FROM stock_flow GROUP BY warehouse_id, item_id) f
       ON f.warehouse_id = b.warehouse_id AND f.item_id = b.item_id
ORDER BY b.warehouse_id, b.item_id;


