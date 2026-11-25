/* 布局：侧边菜单 + 顶部栏 */
;(function (MES) {
  const { computed, ref } = Vue

  const MENUS = [
    { path: '/dashboard', title: '生产总览', icon: 'DataBoard', perm: 'dashboard' },
    {
      title: '基础资料', icon: 'Files', children: [
        { path: '/base/factory', title: '工厂与车间', perm: 'base/factory' },
        { path: '/base/partner', title: '供应商与客户', perm: 'base/partner' },
        { path: '/base/warehouse', title: '仓库管理', perm: 'base/warehouse' },
        { path: '/base/user', title: '用户与角色', perm: 'base/user' },
        { path: '/base/perm', title: '角色权限', perm: 'base/perm' },
        { path: '/base/equipment', title: '设备管理', perm: 'base/equipment' },
        { path: '/base/workstation', title: '工位管理', perm: 'base/workstation' },
        { path: '/base/tooling', title: '工装管理', perm: 'base/tooling' },
        { path: '/base/unit', title: '计量单位', perm: 'base/unit' },
        { path: '/base/item', title: '产品物料', perm: 'base/item' }
      ]
    },
    {
      title: '工艺管理', icon: 'SetUp', children: [
        { path: '/tech/bom', title: '物料清单 BOM', perm: 'tech/bom' },
        { path: '/tech/routing', title: '工艺路线', perm: 'tech/routing' }
      ]
    },
    {
      title: '生产管理', icon: 'Operation', children: [
        { path: '/prod/order', title: '生产工单', perm: 'prod/order' },
        { path: '/prod/wip', title: '工单进度', perm: 'prod/wip' },
        { path: '/prod/task', title: '工序任务', perm: 'prod/task' },
        { path: '/prod/report', title: '报工记录', perm: 'prod/report' },
        { path: '/prod/progress', title: '生产进度', perm: 'prod/progress' }
      ]
    },
    {
      title: '仓储管理', icon: 'Box', children: [
        { path: '/wms/doc', title: '库存单据', perm: 'wms/doc' },
        { path: '/wms/stock', title: '库存余额', perm: 'wms/stock' },
        { path: '/wms/flow', title: '出入库流水', perm: 'wms/flow' }
      ]
    },
    { path: '/about', title: '系统说明', icon: 'InfoFilled', perm: 'about' }
  ]

  MES.MENUS = MENUS

  /** 按当前角色过滤菜单：没有权限的菜单直接不显示 */
  function visibleMenusFor(session) {
    return MENUS
      .map((m) => (m.children
        ? Object.assign({}, m, { children: m.children.filter((c) => session.can(c.perm)) })
        : m))
      .filter((m) => (m.children ? m.children.length > 0 : session.can(m.perm)))
  }
  MES.visibleMenusFor = visibleMenusFor
  MES.firstAllowedPath = (session) => {
    const list = visibleMenusFor(session)
    if (!list.length) return '/login'
    const first = list[0]
    return first.children ? first.children[0].path : first.path
  }

  const MainLayout = {
    name: 'MainLayout',
    setup() {
      const route = VueRouter.useRoute()
      const router = VueRouter.useRouter()
      const session = MES.session
      const collapsed = ref(false)

      const currentTitle = computed(() => {
        for (const m of MENUS) {
          if (m.path === route.path) return m.title
          if (m.children) {
            const hit = m.children.find((c) => c.path === route.path)
            if (hit) return hit.title
          }
        }
        return route.meta && route.meta.title ? route.meta.title : ''
      })

      const currentGroup = computed(() => {
        for (const m of MENUS) {
          if (m.children && m.children.some((c) => c.path === route.path)) return m.title
        }
        return ''
      })

      function onSelect(path) {
        if (path !== route.path) router.push(path)
      }

      const visibleMenus = computed(() => visibleMenusFor(session))

      const ic = (name) => MES.iconOf(name)

      /** 右上角菜单：换操作人、重置数据、退出 */
      async function onUserCommand(cmd) {
        if (cmd === 'logout') {
          session.logout()
          router.push('/login')
        } else if (cmd === 'reset') {
          /* 真库模式下没有“重置”这回事：清空数据必须重跑 db 脚本，这里只说清楚 */
          if (MES.rest && MES.rest.active) {
            MES.msg('当前连接真数据库，不能一键重置；如需恢复初始数据请重跑 db/01～04', 'warning')
            return
          }
          try {
            await MES.confirm('将清空当前所有修改，恢复为初始演示数据，确定继续吗？', '重置演示数据')
            await MES.api.resetDemoData()
            MES.msg('演示数据已重置')
            router.push('/dashboard')
          } catch (e) {
            if (e !== 'cancel') MES.err(e)
          }
        } else if (String(cmd).indexOf('switch:') === 0) {
          const id = Number(String(cmd).slice(7))
          const u = MES.db.state.user.find((x) => x.id === id)
          if (!u) return
          try {
            /* 真库模式：让后端换发该用户的凭证，否则后续写操作还记在原用户名下 */
            if (MES.rest && MES.rest.active && typeof MES.api.switchUser === 'function') {
              await MES.api.switchUser(id)
            }
            const fresh = MES.db.state.user.find((x) => Number(x.id) === id) || u
            session.setUser(fresh)
            MES.msg('已切换为 ' + fresh.name + '（' + MES.db.nameOf('role', fresh.roleId) + '）')
            router.push('/dashboard')
          } catch (e) {
            MES.err(e)
          }
        }
      }

      const userOptions = computed(() => MES.db.state.user.map((u) => ({
        id: u.id, name: u.name, account: u.account, role: MES.db.nameOf('role', u.roleId)
      })))

      return {
        MENUS, visibleMenus, collapsed, currentTitle, currentGroup, onSelect, ic, session,
        onUserCommand, userOptions, router
      }
    },
    template: `
      <div class="app-shell">
        <aside class="app-aside" :class="{ collapsed }">
          <div class="brand">
            <div class="brand-logo">M</div>
            <div class="brand-text" v-show="!collapsed">
              <b>生产订单与物流管理系统</b>
              <span>MANUFACTURING · LOGISTICS</span>
            </div>
          </div>
          <div class="app-menu">
            <el-menu :default-active="$route.path" :collapse="collapsed" :collapse-transition="false"
                     unique-opened @select="onSelect">
              <template v-for="m in visibleMenus" :key="m.path || m.title">
                <el-sub-menu v-if="m.children" :index="m.title">
                  <template #title>
                    <el-icon><component :is="ic(m.icon)"></component></el-icon>
                    <span>{{ m.title }}</span>
                  </template>
                  <el-menu-item v-for="c in m.children" :key="c.path" :index="c.path">{{ c.title }}</el-menu-item>
                </el-sub-menu>
                <el-menu-item v-else :index="m.path">
                  <el-icon><component :is="ic(m.icon)"></component></el-icon>
                  <template #title>{{ m.title }}</template>
                </el-menu-item>
              </template>
            </el-menu>
          </div>
        </aside>

        <div class="app-main">
          <header class="app-header">
            <el-icon style="cursor:pointer;font-size:18px" @click="collapsed = !collapsed">
              <component :is="ic(collapsed ? 'Expand' : 'Fold')"></component>
            </el-icon>
            <div class="header-title">
              {{ currentTitle }}
              <small v-if="currentGroup">/ {{ currentGroup }}</small>
            </div>
            <div class="header-spacer"></div>
            <el-tag size="small" type="info" effect="plain">{{ session.roleName }}</el-tag>
            <el-dropdown trigger="click" @command="onUserCommand">
              <span class="header-user">
                <el-avatar :size="28" style="background:#2b6cf6">{{ session.user ? session.user.name.slice(0,1) : '?' }}</el-avatar>
                <span>{{ session.user ? session.user.name : '' }}</span>
                <el-icon><component :is="ic('ArrowDown')"></component></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item disabled>切换当前操作人（演示用）</el-dropdown-item>
                  <el-dropdown-item v-for="u in userOptions" :key="u.id" :command="'switch:' + u.id">
                    {{ u.name }} · {{ u.role }}（{{ u.account }}）
                  </el-dropdown-item>
                  <el-dropdown-item divided command="reset">重置演示数据</el-dropdown-item>
                  <el-dropdown-item command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </header>

          <div class="app-body">
            <router-view v-slot="{ Component }">
              <component :is="Component" :key="$route.fullPath"></component>
            </router-view>
          </div>
        </div>
      </div>`
  }

  MES.MainLayout = MainLayout
})(window.MES)
