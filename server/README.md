# 后端服务（Express + MySQL）

生产订单与物流管理系统的后端接口。业务规则与 `db/03-proc.sql` 的三个存储过程**完全一致**，
区别只是执行位置：存储过程在数据库里跑，这里在 Node 的 Service 层跑（便于加日志、权限与校验）。

## 一、快速开始

```bash
cd server
npm install                     # 安装 express + mysql2
cp .env.example .env            # 按需修改数据库连接（Windows 用 copy）

# 方式 A：连 MySQL（先执行 ../db/01~04 脚本）
npm start

# 方式 B：内存演示模式（不需要 MySQL，自带演示数据）
USE_MEMORY=true npm start       # Windows PowerShell: $env:USE_MEMORY='true'; npm start
```

启动后：

```
接口地址：http://127.0.0.1:3000/api
健康检查：http://127.0.0.1:3000/api/health
```

> 连不上 MySQL 时会**自动退回内存仓库**并在日志里说明，方便没有数据库的机器直接演示。

## 二、数据库准备

### 本机已装好，直接用

MySQL 8.0.29 免安装版已安装在 **`C:\lab5-mysql`**（不需要管理员权限、不注册系统服务）：

| 项 | 值 |
| --- | --- |
| 地址 | `127.0.0.1:3307` |
| 账号 / 密码 | `root` / 空 |
| 库名 | `lab5_mes` |
| 启动 | 双击 `lab5-web\启动数据库.bat`（关掉窗口即停止） |
| 停止 | 双击 `lab5-web\停止数据库.bat` |
| 程序目录 | `C:\lab5-mysql\mysql-8.0.29-winx64` |
| 数据目录 | `C:\lab5-mysql\data` |

库已经建好并灌好演示数据（24 张表、4 个视图、3 个存储过程），
`server/.env` 也已指向它，直接 `npm start` 就能用。

> 端口用 3307 而不是 3306，是为了避开你机器上可能已装的 MySQL。

### 自己重建库 / 换成别的 MySQL

```bash
mysql -h 127.0.0.1 -P 3307 -u root --default-character-set=utf8mb4 < ../db/01-schema.sql
mysql -h 127.0.0.1 -P 3307 -u root --default-character-set=utf8mb4 < ../db/02-data.sql
mysql -h 127.0.0.1 -P 3307 -u root --default-character-set=utf8mb4 < ../db/03-proc.sql
mysql -h 127.0.0.1 -P 3307 -u root --default-character-set=utf8mb4 < ../db/04-queries.sql
```

`01-schema.sql` 开头就有 `DROP DATABASE IF EXISTS lab5_mes`，重复执行等于重置到初始状态。

`.env` 示例（换成你自己的库时改这里）：

```ini
PORT=3000
HOST=127.0.0.1
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=
DB_NAME=lab5_mes
```

## 三、目录结构

```
server/
├── src/
│   ├── server.mjs              # 入口：选仓库（mysql / memory）并监听
│   ├── app.js                  # Express 装配：CORS、日志、统一错误处理
│   ├── routes.js               # 全部路由
│   ├── config.js               # 环境变量 + .env 解析
│   ├── seed.js                 # 内存演示数据（与 db/02-data.sql 对齐）
│   ├── lib/
│   │   ├── errors.js           # 带状态码的错误类型
│   │   ├── convert.js          # snake_case ↔ camelCase
│   │   └── schema.js           # 24 张表白名单、必填、枚举、唯一键、删除守卫
│   ├── services/
│   │   ├── auth.js             # 登录与 token
│   │   ├── meta.js             # 通用 CRUD（基础资料）
│   │   ├── order.js            # 建单、审核下达、派工、关闭、删除
│   │   ├── report.js           # 报工与工序任务查询
│   │   └── stock.js            # 单据、确认、库存 +/− 汇总、流水
│   └── repositories/
│       ├── mysql.js            # MySQL 实现（连接池 + 事务）
│       └── memory.js           # 内存实现（同一接口，供测试/演示）
└── test/api-test.mjs           # 60 项接口自检（内存仓库 + 真实 HTTP）
```

两个仓库实现同一套接口，业务规则只写一遍（在 `services/` 里），
所以**测试跑通就等于 MySQL 版本的规则正确**，区别仅在存储。

## 四、接口一览

统一返回：成功 `{ ok: true, data }`，失败 `{ ok: false, code, message }`。

### 登录

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/login` | `{ account, password }` → `{ token, user }` |
| POST | `/api/logout` | 注销当前 token |
| POST | `/api/switch-user` | `{ userId }` → `{ token, user }`；演示用，给切换后的操作人换发凭证 |
| GET | `/api/me` | 当前登录用户 |

除 `/api/login`、`/api/health` 外，**所有接口（含读接口）**都要在请求头带上
`Authorization: Bearer <token>`；注销后原 token 立即失效。

### 基础资料（通用 CRUD，24 张表读取白名单）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/meta` | 一次拉取全部基础资料（含部门、供应商客户、路线、BOM、工单物料需求、单据明细） |
| GET | `/api/table/:table` | 列表，支持 `?keyword=&field=&value=&limit=` |
| GET | `/api/table/:table/:id` | 详情 |
| POST | `/api/table/:table` | 新增（校验必填、枚举、唯一键） |
| PUT | `/api/table/:table/:id` | 修改 |
| DELETE | `/api/table/:table/:id` | 删除（有子数据时拒绝并给出原因） |

`:table` 取值：`factory` `workshop` `department` `warehouse` `role` `sys_user` `unit` `item`
`partner` `equipment` `workstation` `tooling` `routing` `routing_detail` `bom` `bom_detail`
`work_order` `order_material` `order_task` `work_report` `stock_doc` `stock_doc_detail`
`stock_balance` `stock_flow`

> `stock_balance` / `stock_flow` **只读**：任何直接写入都会返回 400
> "库存只能由已确认的出入库单据产生"。

> `work_order` / `order_material` / `order_task` / `work_report` / `stock_doc` /
> `stock_doc_detail` 在通用接口中也只读，增删改必须通过下方对应的业务接口执行，
> 防止绕过状态流转与库存校验。所有用户查询及新增、修改响应均不返回密码字段。

### 工单 / 工序 / 报工

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/orders` | 工单列表（编号、名称、产品、负责工厂、车间、进度%） |
| POST | `/api/orders` | 建单（必须给 `name` + `factoryId` + `workshopId`） |
| GET | `/api/orders/:id` | 详情（含物料需求、工序任务、待入库汇总） |
| PUT | `/api/orders/:id` | 修改工单 |
| POST | `/api/orders/:id/audit` | **审核下达**：按 BOM 生成物料需求，按 BOM 指定的路线生成工序 |
| POST | `/api/orders/:id/close` | 关闭工单 |
| DELETE | `/api/orders/:id` | 删除（仅草稿） |
| GET | `/api/orders/:id/materials` | 工单物料齐套情况 |
| GET | `/api/orders/:id/tasks` | 工序进度（上道合格、可报工数量、在制品） |
| POST | `/api/orders/:id/inbound-doc` | 生成成品入库单（数量 = 待入库） |
| GET | `/api/tasks` | 工序任务列表（`?orderId=&ownerId=&status=`） |
| POST | `/api/tasks/:id/assign` | 派工 |
| GET | `/api/tasks/:id/available` | 可报工数量 |
| GET | `/api/reports` | 报工记录（`?orderId=&taskId=&limit=`） |
| POST | `/api/reports` | 报工 |
| DELETE | `/api/reports/:id` | 撤销报工（回滚累计） |

### 单据与库存

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/docs` | 单据列表（`?docType=&status=&warehouseId=`） |
| POST | `/api/docs` | 新建单据（草稿，不动库存） |
| GET | `/api/docs/:id` | 单据详情（含明细与当前结存） |
| PUT | `/api/docs/:id` | 修改草稿单据 |
| DELETE | `/api/docs/:id` | 删除草稿单据 |
| POST | `/api/docs/:id/confirm` | **确认单据**：整体校验后按 +/− 变动库存并写流水 |
| GET | `/api/stock` | 库存 +/− 汇总：`inQty` / `outQty` / `qty` + 合计 + 预警数 |
| GET | `/api/stock/flow` | 出入库流水 |

## 五、关键规则（与前端、存储过程三处一致）

1. **库存只能由单据产生，没有初值**
   `stock_balance` 没有任何写入接口；每次变动只能由 `/docs/:id/confirm` 触发，
   同时写 `stock_flow`，保证 `结存 = 流水累加`。
   页面显示 `累计入库(+) / 累计出库(−) / 当前结存`。
2. **确认单据先整体校验再执行**
   出库逐行校验库存、退料校验"已领未退"、成品入库校验"待入库"，
   任一行不通过 → 整单拒绝（400），库存**一点都不会变**。
3. **草稿不影响库存**
   只有确认后才动余额；已确认单据不能改、不能删、不能重复确认。
4. **审核下达时经 BOM 取工艺路线**
   `bom.routing_id` 决定用哪条路线；路线本身不绑定产品，可被多个产品复用。
   缺 BOM / 缺路线 / 路线停用 / 缺工序都会明确报错。
5. **报工不超上道合格数**
   首道上限 = 计划数量；其余 = 上一道累计合格数；报废同样占用在制品。
6. **部门与车间平级**
   两者都只挂 `factory_id`，都有唯一编号；用户按角色挂车间**或**部门。

## 六、自检

```bash
cd server
node test/api-test.mjs
```

当前结果：**86 项全部通过**，覆盖登录、写接口鉴权、密码字段过滤、通用接口业务表保护、
基础资料 CRUD、部门/供应商客户新表、
工艺路线不绑产品、BOM 指定路线、工单名称与负责工厂、审核下达、派工、
报工上限、库存 +/− 汇总、库存不足整单拒绝、重复确认、已确认单据不可改删、
流水与结存一致、删除守卫等。

前端联调（会真实走 HTTP）：

```bash
# 终端 1
cd server && USE_MEMORY=true PORT=3001 npm start
# 终端 2（在 lab5-web 根目录）
node scripts/rest-test.mjs http://127.0.0.1:3001
```

## 七、前端如何切到后端

前端默认用 localStorage 演示数据，无需后端也能跑。接后端只需二选一：

```html
<!-- 1. 在 index.html 的 <head> 里加一行 -->
<script>window.MES_API_BASE = 'http://127.0.0.1:3000'</script>
```

```js
// 2. 或在浏览器控制台
MES.rest.enable('http://127.0.0.1:3000')   // 立即接管并同步一次，刷新后保持
MES.rest.disable()                          // 关闭，回到本地模式（刷新生效）
```

开启后页面代码不需要改：`MES.api.*` 的签名与返回结构保持不变，
只是数据来源从 localStorage 换成了 `/api/*`。后端不可用时会**自动退回本地模式**，
不影响演示。
