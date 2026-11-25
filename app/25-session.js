/* 会话：当前登录用户 */
;(function (MES) {
  const { reactive, computed } = Vue

  const KEY = 'lab5-mes-session'

  const session = reactive({
    user: null
  })

  /**
   * 恢复上次登录。必须等数据层 load() 之后调用——
   * 本文件比 60-app.js 先执行，那时 state.user 还是空的，按 id 找不到人。
   */
  session.restore = () => {
    if (session.user) return session.user
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      const id = Number(raw)
      const u = MES.db.state.user.find((x) => x.id === id)
      if (u) {
        session.user = u
        return u
      }
    } catch (e) { /* ignore */ }
    return null
  }
  session.restore()

  Object.defineProperty(session, 'users', {
    get: () => MES.db.state.user
  })

  session.roleNameOf = (u) => MES.db.nameOf('role', u.roleId)
  session.roleName = computed(() => (session.user ? MES.db.nameOf('role', session.user.roleId) : ''))
  session.roleCode = computed(() => {
    if (!session.user) return ''
    return MES.db.nameOf('role', session.user.roleId, 'code')
  })

  /** 当前角色可访问的页面集合；系统管理员返回 ['*'] */
  session.perms = computed(() => {
    const u = session.user
    if (!u) return []
    const role = MES.db.state.role.find((r) => Number(r.id) === Number(u.roleId))
    if (!role) return []
    if (role.code === 'R01') return ['*']
    const raw = role.perms
    if (Array.isArray(raw)) return raw
    try {
      const arr = JSON.parse(raw || '[]')
      return Array.isArray(arr) ? arr : []
    } catch (e) { return [] }
  })
  session.can = (perm) => {
    /* reactive 会把 computed 拆包成数组本身 */
    const list = session.perms || []
    return list.indexOf('*') >= 0 || list.indexOf(perm) >= 0
  }

  session.setUser = (u) => {
    session.user = u
    try { localStorage.setItem(KEY, String(u.id)) } catch (e) { /* ignore */ }
  }

  session.login = async (account, password) => {
    const u = await MES.api.login(account, password)
    session.setUser(u)
    return u
  }

  session.logout = () => {
    if (MES.rest && MES.rest.active) {
      MES.rest.logout().catch((e) => console.warn('[MES] 注销请求失败：' + e.message))
    }
    session.user = null
    try { localStorage.removeItem(KEY) } catch (e) { /* ignore */ }
  }

  MES.session = session
})(window.MES)
