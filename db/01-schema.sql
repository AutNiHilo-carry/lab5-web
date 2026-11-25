--  Lab5 生产订单与物流管理系统 —— 数据库建表脚本


DROP DATABASE IF EXISTS lab5_mes;
CREATE DATABASE lab5_mes DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE lab5_mes;

-- 一、基础资料（工厂 / 车间 / 仓库 / 角色 / 用户 / 计量单位 / 物料）

-- 1. 工厂
CREATE TABLE factory (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code        VARCHAR(20)  NOT NULL                COMMENT '工厂编码',
  name        VARCHAR(50)  NOT NULL                COMMENT '工厂名称',
  address     VARCHAR(200)     NULL                COMMENT '地址',
  contact     VARCHAR(50)      NULL                COMMENT '联系电话',
  leader      VARCHAR(30)      NULL                COMMENT '负责人',
  remark      VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_factory_code (code)
) ENGINE=InnoDB COMMENT='工厂';

-- 2. 车间
CREATE TABLE workshop (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code        VARCHAR(20)  NOT NULL                COMMENT '车间编码',
  name        VARCHAR(50)  NOT NULL                COMMENT '车间名称',
  factory_id  INT          NOT NULL                COMMENT '所属工厂',
  leader      VARCHAR(30)      NULL                COMMENT '车间主任',
  remark      VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_workshop_code (code),
  KEY idx_workshop_factory (factory_id),
  CONSTRAINT fk_workshop_factory FOREIGN KEY (factory_id) REFERENCES factory (id)
) ENGINE=InnoDB COMMENT='车间（隶属于工厂）';

-- 3. 部门（与车间平级，同属工厂）
CREATE TABLE department (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code        VARCHAR(20)  NOT NULL                COMMENT '部门编码',
  name        VARCHAR(50)  NOT NULL                COMMENT '部门名称',
  factory_id  INT          NOT NULL                COMMENT '所属工厂',
  leader      VARCHAR(30)      NULL                COMMENT '部门负责人',
  remark      VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_department_code (code),
  KEY idx_department_factory (factory_id),
  CONSTRAINT fk_department_factory FOREIGN KEY (factory_id) REFERENCES factory (id)
) ENGINE=InnoDB COMMENT='部门（与车间平级）';

-- 4. 仓库
CREATE TABLE warehouse (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code        VARCHAR(20)  NOT NULL                COMMENT '仓库编码',
  name        VARCHAR(50)  NOT NULL                COMMENT '仓库名称',
  factory_id  INT          NOT NULL                COMMENT '所属工厂',
  type        VARCHAR(20)  NOT NULL DEFAULT '原料库' COMMENT '仓库类型：原料库/半成品库/成品库',
  leader      VARCHAR(30)      NULL                COMMENT '仓库负责人',
  remark      VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_warehouse_code (code),
  KEY idx_warehouse_factory (factory_id),
  CONSTRAINT fk_warehouse_factory FOREIGN KEY (factory_id) REFERENCES factory (id)
) ENGINE=InnoDB COMMENT='仓库';

-- 5. 角色
CREATE TABLE role (
  id      INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code    VARCHAR(20)  NOT NULL                COMMENT '角色编码',
  name    VARCHAR(30)  NOT NULL                COMMENT '角色名称',
  remark  VARCHAR(255)     NULL                COMMENT '权限说明',
  perms   TEXT             NULL                COMMENT '可访问页面（JSON 数组，* 表示全部）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_role_code (code)
) ENGINE=InnoDB COMMENT='角色';

-- 6. 用户（user 是 MySQL 保留字，表名改用 sys_user）
CREATE TABLE sys_user (
  id           INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  account      VARCHAR(30)  NOT NULL                COMMENT '登录账号',
  name         VARCHAR(30)  NOT NULL                COMMENT '姓名',
  role_id       INT          NOT NULL                COMMENT '角色',
  department_id INT              NULL                COMMENT '所属部门（与车间二选一）',
  workshop_id   INT              NULL                COMMENT '所属车间（与部门二选一）',
  phone         VARCHAR(20)      NULL                COMMENT '手机号',
  status        VARCHAR(10)  NOT NULL DEFAULT '启用'  COMMENT '状态：启用/停用',
  password      VARCHAR(100) NOT NULL                COMMENT '密码（演示为明文，正式环境存 BCrypt 摘要）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_account (account),
  KEY idx_user_role (role_id),
  KEY idx_user_department (department_id),
  KEY idx_user_workshop (workshop_id),
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES role (id),
  CONSTRAINT fk_user_department FOREIGN KEY (department_id) REFERENCES department (id),
  CONSTRAINT fk_user_workshop FOREIGN KEY (workshop_id) REFERENCES workshop (id)
) ENGINE=InnoDB COMMENT='用户';

-- 7. 计量单位
CREATE TABLE unit (
  id      INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code    VARCHAR(20)  NOT NULL                COMMENT '单位编码',
  name    VARCHAR(20)  NOT NULL                COMMENT '单位名称（台/个/套/米…）',
  remark  VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_unit_code (code)
) ENGINE=InnoDB COMMENT='计量单位';

-- 8. 产品物料（成品 / 半成品 / 原材料同表，按 category 区分）
CREATE TABLE item (
  id            INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  code          VARCHAR(30)   NOT NULL                COMMENT '物料编码',
  name          VARCHAR(80)   NOT NULL                COMMENT '物料名称',
  category      VARCHAR(10)   NOT NULL                COMMENT '物料类别：成品/半成品/原材料',
  sub_category  VARCHAR(30)       NULL                COMMENT '细分类别（自由填写，仅用于更细的归类）',
  unit_id       INT           NOT NULL                COMMENT '计量单位',
  spec          VARCHAR(100)      NULL                COMMENT '规格型号',
  safety_stock  DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '安全库存（库存低于此值高亮预警）',
  ref_price     DECIMAL(12,2) NOT NULL DEFAULT 0.00   COMMENT '参考单价（建单默认带出，不含税）',
  remark        VARCHAR(255)      NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_item_code (code),
  KEY idx_item_category (category),
  KEY idx_item_sub_category (sub_category),
  KEY idx_item_unit (unit_id),
  CONSTRAINT fk_item_unit FOREIGN KEY (unit_id) REFERENCES unit (id)
) ENGINE=InnoDB COMMENT='产品物料';

-- 9. 供应商 / 客户（同一张表，用 partner_type 区分）
CREATE TABLE partner (
  id            INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code          VARCHAR(20)  NOT NULL                COMMENT '往来单位编码',
  name          VARCHAR(80)  NOT NULL                COMMENT '单位名称',
  partner_type  VARCHAR(10)  NOT NULL                COMMENT '类型：供应商/客户',
  contact       VARCHAR(30)      NULL                COMMENT '联系人',
  phone         VARCHAR(30)      NULL                COMMENT '联系电话',
  address       VARCHAR(200)     NULL                COMMENT '地址',
  remark        VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_partner_code (code),
  KEY idx_partner_type (partner_type)
) ENGINE=InnoDB COMMENT='供应商 / 客户';

-- 二、生产资源（设备 / 工位 / 工装，均归属车间）

-- 10. 设备
CREATE TABLE equipment (
  id           INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code         VARCHAR(20)  NOT NULL                COMMENT '设备编码',
  name         VARCHAR(50)  NOT NULL                COMMENT '设备名称',
  workshop_id  INT          NOT NULL                COMMENT '所属车间',
  model        VARCHAR(50)      NULL                COMMENT '设备型号',
  status       VARCHAR(10)  NOT NULL DEFAULT '正常'  COMMENT '状态：正常/检修/报废',
  remark       VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_equipment_code (code),
  KEY idx_equipment_workshop (workshop_id),
  CONSTRAINT fk_equipment_workshop FOREIGN KEY (workshop_id) REFERENCES workshop (id)
) ENGINE=InnoDB COMMENT='设备';

-- 11. 工位
CREATE TABLE workstation (
  id           INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code         VARCHAR(20)  NOT NULL                COMMENT '工位编码',
  name         VARCHAR(50)  NOT NULL                COMMENT '工位名称',
  workshop_id  INT          NOT NULL                COMMENT '所属车间',
  location     VARCHAR(100)     NULL                COMMENT '位置',
  remark       VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_workstation_code (code),
  KEY idx_workstation_workshop (workshop_id),
  CONSTRAINT fk_workstation_workshop FOREIGN KEY (workshop_id) REFERENCES workshop (id)
) ENGINE=InnoDB COMMENT='工位';

-- 12. 工装
CREATE TABLE tooling (
  id           INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  code         VARCHAR(20)  NOT NULL                COMMENT '工装编码',
  name         VARCHAR(50)  NOT NULL                COMMENT '工装名称',
  workshop_id  INT          NOT NULL                COMMENT '所属车间',
  model        VARCHAR(50)      NULL                COMMENT '工装型号',
  remark       VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tooling_code (code),
  KEY idx_tooling_workshop (workshop_id),
  CONSTRAINT fk_tooling_workshop FOREIGN KEY (workshop_id) REFERENCES workshop (id)
) ENGINE=InnoDB COMMENT='工装';

-- 三、工艺管理（BOM / 工艺路线，均为主子表）

-- 13. 工艺路线主表（通用工序模板，不绑定产品；由 BOM 引用）
CREATE TABLE routing (
  id       INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  no       VARCHAR(30)  NOT NULL                COMMENT '工艺路线编号',
  name     VARCHAR(50)      NULL                COMMENT '工艺路线名称',
  version  VARCHAR(10)  NOT NULL DEFAULT 'V1.0' COMMENT '版本号',
  status   VARCHAR(10)  NOT NULL DEFAULT '启用'  COMMENT '状态：启用/停用',
  remark   VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_routing_no (no),
  KEY idx_routing_status (status)
) ENGINE=InnoDB COMMENT='工艺路线主表（不绑定产品）';

-- 14. 工艺路线明细（工序）
CREATE TABLE routing_detail (
  id              INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  routing_id      INT           NOT NULL                COMMENT '所属工艺路线',
  seq             INT           NOT NULL                COMMENT '工序顺序号（1,2,3…）',
  process_name    VARCHAR(50)   NOT NULL                COMMENT '工序名称',
  equipment_type  VARCHAR(50)       NULL                COMMENT '设备要求（设备名称/类型）',
  workstation_id  INT               NULL                COMMENT '默认工位',
  std_minutes     DECIMAL(8,2)  NOT NULL DEFAULT 0.00   COMMENT '标准工时（分钟）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_routing_detail (routing_id, seq),
  KEY idx_routing_detail_ws (workstation_id),
  CONSTRAINT fk_routing_detail_routing FOREIGN KEY (routing_id) REFERENCES routing (id) ON DELETE CASCADE,
  CONSTRAINT fk_routing_detail_ws FOREIGN KEY (workstation_id) REFERENCES workstation (id)
) ENGINE=InnoDB COMMENT='工艺路线明细（工序）';

-- 15. 物料清单主表（一个产品可有多版本，同一产品只允许一个"启用"版本）
--     BOM 负责指定"这个产品用哪条工艺路线"，工艺路线本身不绑定产品
CREATE TABLE bom (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  no          VARCHAR(30)  NOT NULL                COMMENT 'BOM 编号',
  item_id     INT          NOT NULL                COMMENT '产品（父件）',
  routing_id  INT              NULL                COMMENT '指定工艺路线（下达工单时按此复制工序）',
  version     VARCHAR(10)  NOT NULL DEFAULT 'V1.0' COMMENT '版本号',
  status      VARCHAR(10)  NOT NULL DEFAULT '启用'  COMMENT '状态：启用/停用',
  remark      VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_bom_no (no),
  KEY idx_bom_item (item_id, status),
  KEY idx_bom_routing (routing_id),
  CONSTRAINT fk_bom_item FOREIGN KEY (item_id) REFERENCES item (id),
  CONSTRAINT fk_bom_routing FOREIGN KEY (routing_id) REFERENCES routing (id)
) ENGINE=InnoDB COMMENT='物料清单（BOM）主表';

-- 16. 物料清单明细
CREATE TABLE bom_detail (
  id            INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  bom_id        INT           NOT NULL                COMMENT '所属 BOM',
  item_id       INT           NOT NULL                COMMENT '子件（原材料/半成品）',
  qty_per_unit  DECIMAL(12,3) NOT NULL                COMMENT '单件用量（一台成品所需数量）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_bom_detail (bom_id, item_id),
  KEY idx_bom_detail_item (item_id),
  CONSTRAINT fk_bom_detail_bom FOREIGN KEY (bom_id) REFERENCES bom (id) ON DELETE CASCADE,
  CONSTRAINT fk_bom_detail_item FOREIGN KEY (item_id) REFERENCES item (id)
) ENGINE=InnoDB COMMENT='物料清单明细';

-- 四、生产管理（工单 / 工单物料需求 / 工序任务 / 报工记录）

-- 17. 生产工单（有名称、编号，并指定由哪个工厂负责生产）
CREATE TABLE work_order (
  id           INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  no           VARCHAR(30)   NOT NULL                COMMENT '工单编号，如 WO-20261111-001',
  name         VARCHAR(80)   NOT NULL                COMMENT '工单名称',
  item_id      INT           NOT NULL                COMMENT '生产产品',
  plan_qty     DECIMAL(12,3) NOT NULL                COMMENT '计划数量',
  factory_id   INT           NOT NULL                COMMENT '负责生产的工厂',
  workshop_id  INT           NOT NULL                COMMENT '生产车间',
  status       VARCHAR(10)   NOT NULL DEFAULT '草稿'  COMMENT '状态：草稿/已下达/生产中/已完工/已关闭',
  plan_start   DATE              NULL                COMMENT '计划开工日期',
  plan_end     DATE              NULL                COMMENT '计划完工日期',
  creator_id   INT           NOT NULL                COMMENT '创建人（计划员）',
  create_time  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  audit_time   DATETIME          NULL                COMMENT '审核下达时间',
  priority     VARCHAR(10)   NOT NULL DEFAULT '中'    COMMENT '优先级：高/中/低',
  remark       VARCHAR(255)      NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_work_order_no (no),
  KEY idx_order_status (status),
  KEY idx_order_item (item_id),
  KEY idx_order_factory (factory_id),
  KEY idx_order_workshop (workshop_id),
  KEY idx_order_creator (creator_id),
  CONSTRAINT fk_order_item FOREIGN KEY (item_id) REFERENCES item (id),
  CONSTRAINT fk_order_factory FOREIGN KEY (factory_id) REFERENCES factory (id),
  CONSTRAINT fk_order_workshop FOREIGN KEY (workshop_id) REFERENCES workshop (id),
  CONSTRAINT fk_order_creator FOREIGN KEY (creator_id) REFERENCES sys_user (id)
) ENGINE=InnoDB COMMENT='生产工单';

-- 18. 工单物料需求（审核下达时按 BOM 单件用量 × 计划数量生成）
CREATE TABLE order_material (
  id            INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id      INT           NOT NULL                COMMENT '所属工单',
  item_id       INT           NOT NULL                COMMENT '物料',
  req_qty       DECIMAL(12,3) NOT NULL                COMMENT '需求量 = 单件用量 × 计划数量',
  picked_qty    DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '已领用数量（领料单确认后回写）',
  returned_qty  DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '已退料数量',
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_material (order_id, item_id),
  KEY idx_order_material_item (item_id),
  CONSTRAINT fk_order_material_order FOREIGN KEY (order_id) REFERENCES work_order (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_material_item FOREIGN KEY (item_id) REFERENCES item (id)
) ENGINE=InnoDB COMMENT='工单物料需求';

-- 19. 工序任务（审核下达时复制工艺路线；派工信息直接存在本表，不另建派工表）
CREATE TABLE order_task (
  id              INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id        INT           NOT NULL                COMMENT '所属工单',
  seq             INT           NOT NULL                COMMENT '工序顺序号',
  process_name    VARCHAR(50)   NOT NULL                COMMENT '工序名称',
  equipment_type  VARCHAR(50)       NULL                COMMENT '工艺要求的设备类型',
  plan_qty        DECIMAL(12,3) NOT NULL                COMMENT '本工序计划数量',
  equip_done_qty  DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '累计合格数（报工累加）',
  scrap_qty       DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '累计报废数',
  equipment_id    INT               NULL                COMMENT '【派工】设备',
  workstation_id  INT               NULL                COMMENT '【派工】工位',
  tooling_id      INT               NULL                COMMENT '【派工】工装',
  owner_id        INT               NULL                COMMENT '【派工】负责人（操作员）',
  plan_start      DATE              NULL                COMMENT '【派工】计划开工',
  plan_end        DATE              NULL                COMMENT '【派工】计划完工',
  status          VARCHAR(10)   NOT NULL DEFAULT '待开始' COMMENT '状态：待开始/进行中/已完成',
  inbound_qty     DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '已入库数量（仅末道工序使用）',
  remark          VARCHAR(255)      NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_task (order_id, seq),
  KEY idx_task_status (status),
  KEY idx_task_owner (owner_id),
  KEY idx_task_equipment (equipment_id),
  KEY idx_task_workstation (workstation_id),
  KEY idx_task_tooling (tooling_id),
  CONSTRAINT fk_task_order FOREIGN KEY (order_id) REFERENCES work_order (id) ON DELETE CASCADE,
  CONSTRAINT fk_task_equipment FOREIGN KEY (equipment_id) REFERENCES equipment (id),
  CONSTRAINT fk_task_workstation FOREIGN KEY (workstation_id) REFERENCES workstation (id),
  CONSTRAINT fk_task_tooling FOREIGN KEY (tooling_id) REFERENCES tooling (id),
  CONSTRAINT fk_task_owner FOREIGN KEY (owner_id) REFERENCES sys_user (id)
) ENGINE=InnoDB COMMENT='工序任务（含派工信息）';

-- 20. 报工记录（一次报工一条；工序任务上的合格/报废数是它的累计）
CREATE TABLE work_report (
  id           INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id     INT           NOT NULL                COMMENT '所属工单',
  task_id      INT           NOT NULL                COMMENT '所属工序任务',
  qual_qty     DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '报工合格数',
  scrap_qty    DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '报工报废数',
  reporter_id  INT           NOT NULL                COMMENT '报工人',
  report_time  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报工时间',
  receiver_id  INT               NULL                COMMENT '接收人（下道工序负责人，报工即移交）'
  remark       VARCHAR(255)      NULL                COMMENT '备注（报废原因等）',
  PRIMARY KEY (id),
  KEY idx_report_order (order_id),
  KEY idx_report_task (task_id),
  KEY idx_report_reporter (reporter_id),
  KEY idx_report_receiver (receiver_id),
  CONSTRAINT fk_report_order FOREIGN KEY (order_id) REFERENCES work_order (id) ON DELETE CASCADE,
  CONSTRAINT fk_report_task FOREIGN KEY (task_id) REFERENCES order_task (id) ON DELETE CASCADE,
  CONSTRAINT fk_report_reporter FOREIGN KEY (reporter_id) REFERENCES sys_user (id)
  CONSTRAINT fk_report_receiver FOREIGN KEY (receiver_id) REFERENCES sys_user (id),
) ENGINE=InnoDB COMMENT='报工记录';

-- 五、仓储管理（单据 / 单据明细 / 库存余额 / 出入库流水）

-- 21. 库存单据（采购入库/生产领料/生产退料/成品入库/销售出库）
CREATE TABLE stock_doc (
  id            INT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  no            VARCHAR(30)  NOT NULL                COMMENT '单据号：RK/LL/RL/CP/XS-日期-序号',
  doc_type      VARCHAR(10)  NOT NULL                COMMENT '单据类型',
  warehouse_id  INT          NOT NULL                COMMENT '仓库',
  order_id      INT              NULL                COMMENT '关联工单（领料/退料/成品入库时填写）',
  partner_id    INT              NULL                COMMENT '往来单位：采购入库=供应商，销售出库=客户',
  amount        DECIMAL(12,2) NOT NULL DEFAULT 0.00   COMMENT '总金额（仅采购入库/销售出库填写，不含税）',
  status        VARCHAR(10)  NOT NULL DEFAULT '草稿'  COMMENT '状态：草稿/已确认/已作废',
  creator_id    INT          NOT NULL                COMMENT '制单人',
  create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '制单时间',
  confirm_time  DATETIME         NULL                COMMENT '确认时间（确认后才变动库存）',
  remark        VARCHAR(255)     NULL                COMMENT '备注',
  PRIMARY KEY (id),
  UNIQUE KEY uk_stock_doc_no (no),
  KEY idx_doc_type (doc_type),
  KEY idx_doc_status (status),
  KEY idx_doc_warehouse (warehouse_id),
  KEY idx_doc_order (order_id),
  KEY idx_doc_partner (partner_id),
  KEY idx_doc_creator (creator_id),
  CONSTRAINT fk_doc_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouse (id),
  CONSTRAINT fk_doc_order FOREIGN KEY (order_id) REFERENCES work_order (id),
  CONSTRAINT fk_doc_partner FOREIGN KEY (partner_id) REFERENCES partner (id),
  CONSTRAINT fk_doc_creator FOREIGN KEY (creator_id) REFERENCES sys_user (id)
) ENGINE=InnoDB COMMENT='库存单据主表';

-- 22. 库存单据明细
CREATE TABLE stock_doc_detail (
  id      INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  doc_id  INT           NOT NULL                COMMENT '所属单据',
  item_id INT           NOT NULL                COMMENT '物料',
  qty     DECIMAL(12,3) NOT NULL                COMMENT '数量（恒为正数，出入方向由单据类型决定）',
  PRIMARY KEY (id),
  KEY idx_doc_detail_doc (doc_id),
  KEY idx_doc_detail_item (item_id),
  CONSTRAINT fk_doc_detail_doc FOREIGN KEY (doc_id) REFERENCES stock_doc (id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_detail_item FOREIGN KEY (item_id) REFERENCES item (id)
) ENGINE=InnoDB COMMENT='库存单据明细';

-- 23. 库存余额（"仓库 + 物料"唯一）
--     本表不允许直接写入或设置初值：只能由库存单据确认时按 +入库 / −出库 累加得到，
--     每次变动同时写一条 stock_flow，"余额 = 流水累加"靠这个维持
CREATE TABLE stock_balance (
  id            INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  warehouse_id  INT           NOT NULL                COMMENT '仓库',
  item_id       INT           NOT NULL                COMMENT '物料',
  qty           DECIMAL(12,3) NOT NULL DEFAULT 0.000  COMMENT '当前结存（仅由单据出入库累积，不可手设初值）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_stock_balance (warehouse_id, item_id),
  KEY idx_balance_item (item_id),
  CONSTRAINT fk_balance_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouse (id),
  CONSTRAINT fk_balance_item FOREIGN KEY (item_id) REFERENCES item (id)
) ENGINE=InnoDB COMMENT='库存余额';

-- 24. 出入库流水（每次单据确认或手工调整写一条）
CREATE TABLE stock_flow (
  id             INT           NOT NULL AUTO_INCREMENT COMMENT '主键',
  warehouse_id   INT           NOT NULL                COMMENT '仓库',
  item_id        INT           NOT NULL                COMMENT '物料',
  change_qty     DECIMAL(12,3) NOT NULL                COMMENT '变动数量（入库为正、出库为负）',
  balance_after  DECIMAL(12,3) NOT NULL                COMMENT '变动后余额',
  doc_id         INT               NULL                COMMENT '来源单据（手工调整为空）',
  doc_type       VARCHAR(10)   NOT NULL                COMMENT '单据类型',
  flow_time      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  PRIMARY KEY (id),
  KEY idx_flow_warehouse_item (warehouse_id, item_id, flow_time),
  KEY idx_flow_doc (doc_id),
  CONSTRAINT fk_flow_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouse (id),
  CONSTRAINT fk_flow_item FOREIGN KEY (item_id) REFERENCES item (id),
  CONSTRAINT fk_flow_doc FOREIGN KEY (doc_id) REFERENCES stock_doc (id)
) ENGINE=InnoDB COMMENT='出入库流水';


