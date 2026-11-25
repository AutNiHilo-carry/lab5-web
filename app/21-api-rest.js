/* 接后端用：把 MES.api 从 localStorage 换成调 server/ 的接口
 * 开启：MES.rest.enable('http://127.0.0.1:3000')，或地址栏加 ?api=http://127.0.0.1:3000
 * 关闭：MES.rest.disable()，刷新生效
 * 页面代码不用动，函数名和返回值跟本地版一样
 */

;(function (MES) {
  const STORAGE_KEY = 'lab5-mes-api-base'

  function detectBase() {
    /* 1. URL 参数 ?api=... */
    try {
      if (typeof location !== 'undefined' && typeof URLSearchParams !== 'undefined' && location.search) {
        const fromUrl = new URLSearchParams(location.search).get('api')
        if (fromUrl) return fromUrl
      }
    } catch (e) { /* ignore */ }

    /* 2. index.html 里预设的全局变量 */
    if (typeof window !== 'undefined' && window.MES_API_BASE) return window.MES_API_BASE

    /* 3. 上次 enable() 记住的地址 */
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return saved
    } catch (e) { /* file:// 下可能被禁用 */ }

    return ''
  }

  let base = detectBase()
  let token = ''

  const tokenKey = () => STORAGE_KEY + ':token:' + String(base).replace(/\/+$/, '').replace(/\/api$/, '')
  function saveToken(value) {
    token = value
    try {
      if (value) localStorage.setItem(tokenKey(), value)
      else localStorage.removeItem(tokenKey())
    } catch (e) { /* 存储不可用时仍支持本次登录 */ }
  }
  function restoreToken() {
    try { token = localStorage.getItem(tokenKey()) || '' } catch (e) { token = '' }
  }
  restoreToken()

  /** 统一成 .../api 结尾，允许只写 http://127.0.0.1:3000 */
  const apiRoot = () => {
    const b = String(base || '').replace(/\/+$/, '')
    return /\/api$/.test(b) ? b : b + '/api'
  }

  // HTTP

  async function request(method, path, body) {
    if (!base) throw new Error('未配置后端地址，请先执行 MES.rest.enable(...)')
    const res = await fetch(apiRoot() + path, {
      method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {}
      ),
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await res.text()
    let json = {}
    try { json = text ? JSON.parse(text) : {} } catch (e) { json = { message: text } }
    if (!res.ok || json.ok === false) {
      if (res.status === 401 && path !== '/login') {
        saveToken('')
        if (MES.session && MES.session.logout) MES.session.logout()
        if (typeof location !== 'undefined') location.hash = '#/login'
      }
      const err = new Error(json.message || `请求失败（${res.status}）`)
      err.status = res.status
      err.code = json.code
      throw err
    }
    return json.data
  }

  const GET = (p) => request('GET', p)
  const POST = (p, b) => request('POST', p, b || {})
  const PUT = (p, b) => request('PUT', p, b || {})
  const DEL = (p) => request('DELETE', p)

  // 表名映射
  /* 前端状态里的表名（驼峰） ↔ 后端表名（下划线） */
  const TABLE_MAP = {
    factory: 'factory',
    workshop: 'workshop',
    department: 'department',
    warehouse: 'warehouse',
    role: 'role',
    user: 'sys_user',
    unit: 'unit',
    item: 'item',
    partner: 'partner',
    equipment: 'equipment',
    workstation: 'workstation',
    tooling: 'tooling',
    routing: 'routing',
    routingDetail: 'routing_detail',
    bom: 'bom',
    bomDetail: 'bom_detail',
    workOrder: 'work_order',
    orderMaterial: 'order_material',
    orderTask: 'order_task',
    workReport: 'work_report',
    stockDoc: 'stock_doc',
    stockDocDetail: 'stock_doc_detail',
    stockBalance: 'stock_balance',
    stockFlow: 'stock_flow'
  }
  const toServerTable = (t) => TABLE_MAP[t] || t

  // 字段名 camel ↔ snake
  const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
  const toSnake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

  const rowIn = (obj) => {
    const out = {}
    Object.keys(obj || {}).forEach((k) => { out[toCamel(k)] = obj[k] })
    return out
  }
  const rowOut = (obj) => {
    const out = {}
    Object.keys(obj || {}).forEach((k) => { out[toSnake(k)] = obj[k] })
    return out
  }

  const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms))

  // 覆盖 MES.api 的实现

  function install(localApi) {
    const state = MES.db.state

    /** 上道移交的合格数（首道按工单计划数量）；需同步返回，供 computed / 弹窗直接使用。
        task 既可以是任务对象（页面传的），也可以是任务 id（脚本/接口用）。 */
    const resolveTask = (task) =>
      (task && typeof task === 'object' ? task : MES.db.byId('orderTask', Number(task)))

    const prevQualifiedOf = (task) => {
      const t = resolveTask(task)
      if (!t) return 0
      const order = MES.db.byId('workOrder', t.orderId)
      const list = state.orderTask
        .filter((x) => x.orderId === t.orderId)
        .sort((a, b) => a.seq - b.seq)
      const idx = list.findIndex((x) => x.id === t.id)
      if (idx <= 0) return order ? order.planQty : 0
      return list[idx - 1].equipDoneQty
    }

    /** 角色可访问页面；管理员返回 ['*'] */
    function permsOf(user) {
      if (!user) return null
      const role = state.role.find((r) => Number(r.id) === Number(user.roleId))
      if (!role) return []
      if (role.code === 'R01') return ['*']
      let arr = role.perms
      if (typeof arr === 'string') {
        try { arr = JSON.parse(arr) } catch (e) { arr = [] }
      }
      return Array.isArray(arr) ? arr : []
    }
    const canSee = (perms, key) => !perms || perms.indexOf('*') >= 0 || perms.indexOf(key) >= 0

    /** 整库同步：一次性把后端数据灌进 state，页面照常用 state 渲染 */
    async function reload(user) {
      const meta = await GET('/meta')
      Object.keys(meta).forEach((serverTable) => {
        const localTable = Object.keys(TABLE_MAP).find((k) => TABLE_MAP[k] === serverTable)
        if (!localTable) return
        state[localTable] = meta[serverTable].map(rowIn)
        state.seq[localTable] = state[localTable].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
      })
      /* 没有权限的表就不拉；万一被拒也当成空数据，不能让整库同步失败 */
      const perms = permsOf(user || (MES.session && MES.session.user))
      const load = async (url, key, fallback) => {
        if (key && !canSee(perms, key)) return fallback
        try { return await GET(url) } catch (e) {
          if (e && e.status === 403) return fallback
          throw e
        }
      }

      /* 工单 / 单据 / 报工等业务表单独拉 */
      state.workOrder = (await load('/orders', 'prod/order', [])).map(rowIn)
      const docs = await load('/docs', 'wms/doc', [])
      state.stockDoc = docs.map((d) => rowIn(d))
      const reports = await load('/reports?limit=1000', 'prod/report', [])
      state.workReport = reports.map(rowIn)
      const tasks = await load('/tasks', 'prod/task', [])
      state.orderTask = tasks.map(rowIn)
      const flows = await load('/stock/flow?limit=1000', 'wms/flow', [])
      /* 后端返回 flowTime，页面按 time 渲染，这里补齐 */
      state.stockFlow = flows.map((f) => ({ ...rowIn(f), time: f.time || f.flowTime }))
      const stock = await load('/stock', 'wms/stock', { rows: [] })
      state.stockBalance = (stock.rows || []).map((r) => ({
        id: r.warehouseId + '-' + r.itemId,
        warehouseId: r.warehouseId,
        itemId: r.itemId,
        qty: r.qty,
        inQty: r.inQty,
        outQty: r.outQty
      }))
      /* 后端数据到位后，如果还没恢复登录态（本地快照里没有这个人），用后端的用户表再试一次 */
      if (MES.session && MES.session.restore && !MES.session.user) MES.session.restore()
      return true
    }

    const restApi = Object.assign({}, localApi, {
      // 登录：后端校验账号密码，成功后再整库同步一次，返回 state 里的那条用户
      async login(account, password) {
        const data = await POST('/login', { account, password })
        saveToken(data.token)
        await reload(rowIn(data.user))
        const u = state.user.find((x) => Number(x.id) === Number(data.user.id)) || rowIn(data.user)
        return u
      },

      /* 演示用：切换操作人时换发后端凭证，写操作才会真正记在新用户名下 */
      async switchUser(userId) {
        const data = await POST('/switch-user', { userId })
        saveToken(data.token)
        await reload(rowIn(data.user))
        return rowIn(data.user)
      },

      // 通用 CRUD
      async createRow(table, payload) {
        const saved = await POST('/table/' + toServerTable(table), payload)
        const row = rowIn(saved)
        await reload()
        return row
      },
      async updateRow(table, id, payload) {
        const saved = await PUT('/table/' + toServerTable(table) + '/' + id, payload)
        await reload()
        return rowIn(saved)
      },
      async removeRow(table, id) {
        await DEL('/table/' + toServerTable(table) + '/' + id)
        await reload()
        return true
      },

      // 工单
      async createOrder(payload) {
        const saved = await POST('/orders', payload)
        await reload()
        return rowIn(saved)
      },
      async auditOrder(orderId) {
        const data = await POST(`/orders/${orderId}/audit`)
        await reload()
        return rowIn(data.order)
      },
      async deleteOrder(orderId) {
        await DEL('/orders/' + orderId)
        await reload()
        return true
      },
      async closeOrder(orderId) {
        const saved = await POST(`/orders/${orderId}/close`)
        await reload()
        return rowIn(saved)
      },

      // 派工 / 报工
      async assignTask(taskId, payload) {
        const saved = await POST(`/tasks/${taskId}/assign`, payload)
        await reload()
        return rowIn(saved)
      },
      async addReport(payload) {
        const data = await POST('/reports', payload)
        await reload()
        return rowIn(data.report)
      },
      async removeReport(reportId) {
        await DEL('/reports/' + reportId)
        await reload()
        return true
      },
      /* 可报工数量：页面在 setup/computed 里同步取值，不能返回 Promise；
         算法与后端 /tasks/:id/available 一致（上道合格 − 本道已合格 − 本道报废） */
      prevQualified(task) {
        return prevQualifiedOf(task)
      },
      taskAvailable(task) {
        const t = resolveTask(task)
        if (!t) return 0
        return +(prevQualifiedOf(t) - t.equipDoneQty - t.scrapQty).toFixed(3)
      },

      // 单据
      async createDoc(payload) {
        const saved = await POST('/docs', payload)
        await reload()
        return rowIn(saved.doc)
      },
      async updateDoc(docId, payload) {
        const saved = await PUT('/docs/' + docId, payload)
        await reload()
        return rowIn(saved.doc)
      },
      async deleteDoc(docId) {
        await DEL('/docs/' + docId)
        await reload()
        return true
      },
      async confirmDoc(docId) {
        const data = await POST(`/docs/${docId}/confirm`)
        await reload()
        return rowIn(data.doc)
      },
      async createInboundDocForOrder(orderId) {
        const saved = await POST(`/orders/${orderId}/inbound-doc`)
        await reload()
        return rowIn(saved.doc)
      },

      // 库存汇总（页面直接调用）
      stockSummary(warehouseId, itemId) {
        const row = state.stockBalance.find(
          (b) => b.warehouseId === warehouseId && b.itemId === itemId
        )
        if (!row) return { inQty: 0, outQty: 0, qty: 0, flowCount: 0 }
        return { inQty: row.inQty || 0, outQty: row.outQty || 0, qty: row.qty, flowCount: 0 }
      },
      stockRows() {
        return state.stockBalance.map((b) => {
          const it = MES.db.byId('item', b.itemId)
          const wh = MES.db.byId('warehouse', b.warehouseId)
          const unit = it ? MES.db.byId('unit', it.unitId) : null
          return {
            id: b.warehouseId + '-' + b.itemId,
            warehouseId: b.warehouseId,
            itemId: b.itemId,
            warehouseName: wh ? wh.name : '-',
            itemCode: it ? it.code : '-',
            itemName: it ? it.name : '-',
            category: it ? it.category : '',
            unitName: unit ? unit.name : '',
            spec: it ? it.spec : '',
            safetyStock: it ? it.safetyStock : 0,
            inQty: b.inQty || 0,
            outQty: b.outQty || 0,
            qty: b.qty,
            warn: it ? b.qty < it.safetyStock : false
          }
        })
      },

      // 恢复初始数据
      async resetDemoData() {
        await reload()
        return true
      }
    })

    MES.api = restApi
    MES.rest.reload = reload
    MES.rest.active = true
    return restApi
  }

  // 对外控制器

  MES.rest = {
    active: false,
    get base() { return base },
    get enabled() { return !!base },

    /** 开启 REST 模式（会自动整库同步一次） */
    async enable(apiBase) {
      base = apiBase || base
      if (!base) throw new Error('请传入后端地址，例如 MES.rest.enable("http://127.0.0.1:3000")')
      restoreToken()
      try { localStorage.setItem(STORAGE_KEY, base) } catch (e) { /* ignore */ }
      const probe = await GET('/health')
      install(window.__MES_LOCAL_API__ || {})
      await MES.rest.reload()
      return probe
    },

    /** 关掉，回到 localStorage（刷新生效） */
    disable() {
      try { localStorage.removeItem(STORAGE_KEY) } catch (e) { /* ignore */ }
      base = ''
      token = ''
      MES.rest.active = false
      return true
    },

    /** 先发出注销请求，再立即清除本地凭证。 */
    async logout() {
      if (!token) return
      const pending = POST('/logout')
      saveToken('')
      await pending
    },

    /** 手动同步一次后端数据 */
    async reload() { return true }
  }

  /* 启动时若已配置后端地址，自动挂载（数据同步失败则退回本地模式，不影响页面） */
  if (base) {
    /* 本地实现留着，切换时要用 */
    window.__MES_LOCAL_API__ = Object.assign({}, MES.api)
    install(window.__MES_LOCAL_API__)
    if (!token) {
      /* 读接口也要登录：没有凭证就先不拉数据，登录成功后 login() 会自己同步 */
      console.log('[MES] 已连接后端，等待登录：' + base)
    } else {
      MES.rest.reload().then(() => {
        console.log('[MES] 已连接后端：' + base)
      }).catch((e) => {
        if (e && e.status === 401) {
          /* 凭证过期（例如后端重启）：保持 REST 模式，等重新登录后再同步 */
          console.warn('[MES] 登录已失效，重新登录后会同步后端数据')
          return
        }
        console.warn('[MES] 后端未就绪，继续使用本地演示数据：' + e.message)
        MES.api = window.__MES_LOCAL_API__
        MES.rest.active = false
      })
    }
  }
})(window.MES)

