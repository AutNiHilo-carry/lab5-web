# 数据库设计说明 · Lab5 生产订单与物流管理系统

本文档对应 `db/` 目录下的 4 个脚本，覆盖**表设计 → 建表 → 初始化数据 → 业务逻辑 → 查询报表**全链路。

## 一、脚本清单

| 文件 | 作用 | 说明 |
| --- | --- | --- |
| `01-schema.sql` | 建库建表 | 24 张表、40 个外键、21 个唯一索引，含中文注释 |
| `02-data.sql` | 初始化数据 | 与前端演示数据一致，含已确认/草稿两类单据 |
| `03-proc.sql` | 业务存储过程 | 审核下达、报工、确认单据三个核心过程 |
| `04-queries.sql` | 视图与报表 | 4 个视图 + 13 个常用查询 |

执行顺序（**必须按顺序**，后者依赖前者）：

```bash
mysql -u root -p --default-character-set=utf8mb4 < db/01-schema.sql
mysql -u root -p --default-character-set=utf8mb4 < db/02-data.sql
mysql -u root -p --default-character-set=utf8mb4 < db/03-proc.sql
mysql -u root -p --default-character-set=utf8mb4 < db/04-queries.sql
```

> 必须指定 `--default-character-set=utf8mb4`，否则中文注释和默认值会乱码。
> 环境为 MySQL 5.7 或 8.0；`01-schema.sql` 刻意不使用 `CHECK` 约束
> （5.7 会忽略、部分版本会报错），取值范围改由应用层与存储过程校验。

## 二、设计思路

1. **基础资料先行**：工厂下同时挂**车间**和**部门**（两者平级，都有编号），
   车间再挂设备、工位、工装与操作员；用户可按角色归属**车间或部门**。
2. **成品与原材料同表**：`item` 保存全部物料，用 `category`
   （成品 / 半成品 / 原材料）区分，BOM 明细、单据明细、库存余额都指向它。
3. **工艺路线与产品解耦**：`routing`/`routing_detail` 只是一套**通用工序模板**，
   本身不绑定任何产品；**由 `bom.routing_id` 指定"这个产品的 BOM 用哪条路线"**。
   一个产品换路线只改 BOM，不必复制一份路线；同一条路线可被多个产品复用。
4. **模板与任务分离**：`bom`、`bom_detail`、`routing`、`routing_detail` 都是**生产模板**；
   工单审核下达时把"单件用量 × 计划数量"和"工序"**复制**到
   `order_material`、`order_task`，之后修改模板不影响已下达的工单。
5. **不另建派工表**：设备、工位、工装、负责人、计划时间直接记在 `order_task` 上。
6. **单据与余额分离**：`stock_doc` 记录"为什么变化"，`stock_balance` 记录"现在有多少"，
   `stock_flow` 记录每一次变动，三者通过"仓库 + 物料"对应，可直接对账。
7. **库存没有"初值"概念**：`stock_balance` 只能由**已确认单据**按 +入库 / −出库 累加产生，
   页面显示的是"累计入库(+)、累计出库(−)、当前结存"，而不是一个可以手填的数字。

## 三、表清单（24 张）

| # | 表名 | 中文名 | 主键 | 主要外键 | 对应界面 |
| --- | --- | --- | --- | --- | --- |
| 1 | factory | 工厂 | id | — | 基础资料 · 工厂 |
| 2 | workshop | 车间 | id | factory_id | 基础资料 · 车间 |
| 3 | department | 部门 | id | factory_id | 基础资料 · 部门 |
| 4 | warehouse | 仓库 | id | factory_id | 基础资料 · 仓库 |
| 5 | role | 角色 | id | — | 基础资料 · 用户与角色 |
| 6 | sys_user | 用户 | id | role_id, workshop_id, department_id | 基础资料 · 用户与角色 |
| 7 | unit | 计量单位 | id | — | 基础资料 · 计量单位 |
| 8 | item | 产品物料 | id | unit_id | 基础资料 · 产品物料 |
| 9 | partner | 供应商与客户 | id | — | 基础资料 · 供应商与客户 |
| 10 | equipment | 设备 | id | workshop_id | 基础资料 · 设备 |
| 11 | workstation | 工位 | id | workshop_id | 基础资料 · 工位 |
| 12 | tooling | 工装 | id | workshop_id | 基础资料 · 工装 |
| 13 | routing | 工艺路线主表 | id | —（不绑产品） | 工艺管理 · 工艺路线 |
| 14 | routing_detail | 工艺路线明细 | id | routing_id, workstation_id | 工艺管理 · 工序 |
| 15 | bom | 物料清单主表 | id | item_id, routing_id | 工艺管理 · BOM |
| 16 | bom_detail | 物料清单明细 | id | bom_id, item_id | 工艺管理 · BOM 明细 |
| 17 | work_order | 生产工单 | id | item_id, factory_id, workshop_id, creator_id | 生产管理 · 生产工单 |
| 18 | order_material | 工单物料需求 | id | order_id, item_id | 生产管理 · 工单详情 |
| 19 | order_task | 工序任务 | id | order_id, equipment_id, workstation_id, tooling_id, owner_id | 生产管理 · 派工报工 |
| 20 | work_report | 报工记录 | id | order_id, task_id, reporter_id | 生产管理 · 报工记录 |
| 21 | stock_doc | 库存单据主表 | id | warehouse_id, order_id, creator_id | 仓储管理 · 库存单据 |
| 22 | stock_doc_detail | 库存单据明细 | id | doc_id, item_id | 仓储管理 · 单据明细 |
| 23 | stock_balance | 库存余额 | id | warehouse_id, item_id（唯一） | 仓储管理 · 库存余额 |
| 24 | stock_flow | 出入库流水 | id | warehouse_id, item_id, doc_id | 仓储管理 · 出入库流水 |

> `sys_user` 加 `sys_` 前缀，避免与 MySQL 保留字 `user` 冲突（否则每处都要写反引号）。
> 数据库列名用下划线（`factory_id`），前端用驼峰（`factoryId`），
> 后端 MyBatis-Plus / JPA 自动映射即可。

## 四、关键字段说明

### 车间与部门（平级）

- `workshop.factory_id`、`department.factory_id` 都指向 `factory.id`，
  两者是**同级**组织单元，不是上下级关系。
- 两者都有编号：`uk_workshop_code`、`uk_department_code`，编号全局唯一，便于工单/人员引用。
- `department` 字段：`code`、`name`、`factory_id`、`leader`、`remark`。
- `sys_user.workshop_id` 与 `sys_user.department_id` **二选一**：
  车间操作员挂车间，计划/采购/仓储/质量/销售挂部门；管理员两者都为空。
  数据库层面不加互斥约束（5.7 不支持 `CHECK`），由前端表单与后端校验保证。

### 供应商与客户（单表 + 类型区分）

- `partner` 一张表存两类单位，用 `partner_type` 区分 `'供应商'` / `'客户'`，
  加索引 `idx_partner_type` 便于按类型过滤；编号 `uk_partner_code` 唯一。
- 为什么不用两张表：两类字段完全相同（编号、名称、联系人、电话、地址、备注），
  拆表会产生大量重复结构；单表 + 类型字段只需一个页面加类型筛选，
  后续若要加"应付/应收"再扩字段即可。
- 供应商对应采购入库，客户对应销售出库（`stock_doc.doc_type` 已区分方向）。

### 工艺路线（不绑定产品）

- `routing` 字段：`no`、`name`、`version`、`status`、`remark`，**没有 `item_id`**。
- 一条路线只描述"要做哪些工序、什么顺序、什么设备要求"，是**可复用的工序模板**。
- 产品与路线的关系由 `bom.routing_id` 单向指定：
  `item` ← `bom.item_id`，`bom.routing_id` → `routing.id`。
- 好处：①换工艺只改 BOM，不必新建路线；②同一路线可服务多个产品（如 X4/X6 共用总装路线）；
  ③路线是通用资产，可跨产品统计标准工时。

### 物料清单（BOM）

- `bom.item_id` → `item.id`：确定"生产哪种产品"。
- `bom.routing_id` → `routing.id`：**确定该产品用哪条工艺路线**（可为空，但下达时会报错）。
- `bom_detail.bom_id` → `bom.id`：确定这条明细属于哪份清单。
- `bom_detail.item_id` → `item.id`：这里是**原材料**；一种物料可被多份清单使用。
- `qty_per_unit` 存单件用量；工单里存本次需求数量 `order_material.req_qty`
  以及实际领用 `picked_qty`、退回 `returned_qty`。
- `uk_bom_no` 保证 BOM 编号唯一；同一产品可有多版本，靠 `status` 控制"仅一个启用"。

### 工单与生产记录

- `work_order.no`（编号）与 `work_order.name`（名称）**同时存在**：
  编号由系统按日期流水生成、用于唯一标识与追溯；名称由计划员填写，用于现场识别
  （如"X4 巡检机首批生产"）。
- `work_order.factory_id`：**负责生产的工厂**；`work_order.workshop_id`：具体生产车间。
  工厂用于跨厂统计与责任划分，车间用于派工到具体资源。
- `order_task.order_id` → `work_order.id`：一张工单有多道工序任务。
- `work_report.task_id` → `order_task.id`：一道任务可分多次报工。
- 累计值 `equip_done_qty`、`scrap_qty` 落在 `order_task` 上，
  明细留在 `work_report` 中，两者可互相校验（见 Q10）。
- `inbound_qty` 只记在末道工序，表示"已入库数量"。

### 仓储单据与库存

- `stock_doc_detail.doc_id` → `stock_doc.id`，明细数量 `qty` **恒为正数**，
  出入方向由 `doc_type` 决定（采购入库/生产退料/成品入库为正，生产领料/销售出库为负）。
- `stock_balance` 在 `(warehouse_id, item_id)` 上建唯一索引 —— 同一仓库同一种物料只有一条余额。
- **`stock_balance.qty` 不允许直接 INSERT 初值、也不允许 UPDATE 手改**，
  只能由 `sp_confirm_stock_doc` 按已确认单据累加；
  `02-data.sql` 里余额本身就是用 `SELECT ... SUM(IF(doc_type IN (...), qty, -qty))` 从单据推出来的。
- `stock_flow.balance_after` 记录变动后余额，任一条余额都能追溯是哪些单据造成的；
  流水正负号即"入库 + / 出库 −"。
- 前端"库存余额"页面因此只显示：**累计入库(+)**、**累计出库(−)**、**当前结存**（= 入库 − 出库），
  不提供任何手工设置数量的入口。

## 五、业务规则与数据库约束的对应

| 需求文档中的规则 | 数据库层面的保证 | 应用层校验（存储过程） |
| --- | --- | --- |
| 草稿单据不改变库存 | 明细只在 `stock_doc_detail` | 未确认不写 `stock_balance`/`stock_flow` |
| 确认后按方向增减余额 | `DECIMAL(12,3)`，方向由 `doc_type` 决定 | 入库 +，出库 − |
| 库存只能由单据产生 | 无任何期初值；余额靠单据推导 | 只允许过程内部累加，无手工赋值入口 |
| 库存不足不能出库 | — | 确认前查余额，不足整单拒绝 |
| 退料不超过已领未退 | — | `picked_qty − returned_qty` |
| 成品入库不超过合格数 | 末道 `inbound_qty` | `equip_done_qty − inbound_qty` |
| 重复确认只生效一次 | `stock_doc.status` | 确认前判断状态 |
| 报工不超上道合格数 | — | 上道 `equip_done_qty` 作为上限 |
| 仓库 + 物料唯一余额 | `uk_stock_balance` | 写入时 upsert |
| 下达后改模板不影响工单 | 需求/工序已复制到工单表 | `sp_audit_order` 复制而非引用 |
| 工艺路线不绑产品 | `routing` 无 `item_id` | 下达时经 `bom.routing_id` 取路线 |
| 部门与车间平级 | 两者都只挂 `factory_id` | 各自编号唯一 |
| 供应商客户区分 | `partner.partner_type` + 索引 | 表单必选类型 |

## 六、存储过程（`03-proc.sql`）

| 存储过程 | 作用 | 关键规则 |
| --- | --- | --- |
| `sp_audit_order(order_id)` | 审核下达工单 | 只有草稿/待审核可下达；按 BOM×数量生成物料需求；**经 `bom.routing_id` 取路线**再复制工序；全程事务 |
| `sp_add_report(task_id, qual, scrap, reporter, remark)` | 工序报工 | 合格/报废非负且合计>0；不超上道合格数；累加后自动置"已完成"；工单转"生产中" |
| `sp_confirm_stock_doc(doc_id)` | 确认库存单据 | 不能重复确认；出库逐行校验库存；**先整体校验再执行**（用游标遍历两遍），任一行不通过整单回滚；回写工单已领/已退与末道已入库 |

三个过程都用 `START TRANSACTION` + `EXIT HANDLER FOR SQLEXCEPTION` 保证原子性，
出错时 `ROLLBACK` 并 `RESIGNAL`，不会出现"部分成功"。

`sp_audit_order` 取路线的关键语句：

```sql
SELECT id, routing_id INTO v_bom_id, v_routing_id
FROM bom WHERE item_id = v_item_id AND status = '启用' LIMIT 1;

IF v_routing_id IS NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '该产品的 BOM 未指定工艺路线，无法下达';
END IF;
```

调用示例：

```sql
CALL sp_audit_order(2);                  -- 下达草稿工单
CALL sp_add_report(3, 5, 0, 3, '补报');  -- 工序 3 报工 5 台
CALL sp_confirm_stock_doc(6);            -- 确认草稿入库单
```

## 七、视图与报表（`04-queries.sql`）

| 视图 | 用途 |
| --- | --- |
| `v_work_order` | 工单列表（编号、**名称**、产品、**负责工厂**、车间、创建人、末道合格、已入库、进度%） |
| `v_task_progress` | 各工序进度：上道合格、可报工数量、在制品 |
| `v_stock_balance` | 库存余额：**入库合计(+)、出库合计(−)、结存**、安全库存预警标记 |
| `v_order_material_status` | 工单物料齐套情况（需求/已领/欠料） |

`v_stock_balance` 的 +/− 口径（与页面显示完全对应）：

```sql
SUM(IF(change_qty > 0, change_qty, 0))  AS in_qty,   -- 累计入库 +
SUM(IF(change_qty < 0, -change_qty, 0)) AS out_qty,  -- 累计出库 −
in_qty - out_qty                        AS qty       -- 当前结存
```

核心计算口径（与前端实现一致）：

- **在制品** = 前一道合格数 − 当前工序已处理数
- **可报工数量** = 上一道合格数（首道取工单计划数量）− 本工序已处理数
- **待入库** = 末道合格数 − 累计入库数

13 个常用查询覆盖：状态看板、工单进度（含名称与工厂）、齐套率、可报工数量、库存预警、
出入库流水、个人报工统计、BOM 展开、工艺路线工序、数据一致性校验、
供应商客户清单、部门与车间对照、产品→BOM→工艺路线。

## 八、数据一致性校验

`02-data.sql` 末尾和 `04-queries.sql` 的 Q10 会核对
**库存余额是否等于流水累加**。正常应全部返回 `OK`（没有任何"无来源单据"的余额行）。

`scripts/balance-check.mjs` 则从**前端演示数据**反推余额，
与 SQL 初始化数据比对，保证前后端演示数据完全一致，并额外检查
"有流水的组合都有余额行"：

```bash
node scripts/balance-check.mjs
```

## 九、和前端的关系

前端目前用 localStorage 模拟数据库，表名与字段按上表设计
（见 `app/10-db.js` 的 `TABLES` 与种子数据），已完成并自测通过。

接后端时只需三步：

1. 执行本目录 4 个脚本建好库；
2. 后端提供 登录、工单 CRUD/审核、派工、报工、单据 CRUD/确认、库存查询 接口；
   三个存储过程可直接复用，或按同样规则改写成 Service（推荐，便于加日志与权限）；
3. 前端把 `app/20-api.js` 里的函数改成 `fetch('/api/...')`，页面代码不需要动。

## 十、自检

```bash
node scripts/sql-check.mjs      # 零依赖：编码、括号/引号配对、表数、命名、外键顺序、业务规则
node scripts/data-check.mjs     # 前端数据层：新表/新字段、库存无初值、BOM→路线
node scripts/balance-check.mjs  # 前端单据反推余额 vs SQL 数据
```

当前结果：4 个 SQL 脚本全部通过（24 张表 / 40 外键 / 21 唯一索引 / 3 存储过程 / 4 视图）。
