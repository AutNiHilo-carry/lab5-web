/* 应用入口：路由 + 挂载 */
;(function (MES) {
  const { createApp } = Vue
  const { createRouter, createWebHashHistory } = VueRouter

  /* 有本地存储就读它，没有就用内置数据 */
  if (!MES.db.load()) {
    MES.db.reset()
  }
  /* 数据就绪后再恢复登录状态：25-session 执行时用户表还是空的 */
  if (MES.session && MES.session.restore) MES.session.restore()

  const v = MES.views

  const routes = [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', component: v.Login, meta: { public: true, title: '登录' } },
    { path: '/dashboard', component: v.Dashboard, meta: { title: '生产总览', perm: 'dashboard' } },
    { path: '/base/factory', component: v.FactoryPage, meta: { perm: 'base/factory' } },
    { path: '/base/partner', component: v.PartnerPage, meta: { perm: 'base/partner' } },
    { path: '/base/warehouse', component: v.WarehousePage, meta: { perm: 'base/warehouse' } },
    { path: '/base/user', component: v.UserPage, meta: { perm: 'base/user' } },
    { path: '/base/perm', component: v.RolePermPage, meta: { perm: 'base/perm' } },
    { path: '/base/equipment', component: v.EquipmentPage, meta: { perm: 'base/equipment' } },
    { path: '/base/workstation', component: v.WorkstationPage, meta: { perm: 'base/workstation' } },
    { path: '/base/tooling', component: v.ToolingPage, meta: { perm: 'base/tooling' } },
    { path: '/base/unit', component: v.UnitPage, meta: { perm: 'base/unit' } },
    { path: '/base/item', component: v.ItemPage, meta: { perm: 'base/item' } },
    { path: '/tech/bom', component: v.BomPage, meta: { perm: 'tech/bom' } },
    { path: '/tech/routing', component: v.RoutingPage, meta: { perm: 'tech/routing' } },
    { path: '/prod/order', component: v.OrderListPage, meta: { perm: 'prod/order' } },
    { path: '/prod/order/:id', component: v.OrderDetailPage, meta: { perm: 'prod/order' } },
    { path: '/prod/wip', component: v.WipPage, meta: { perm: 'prod/wip' } },
    { path: '/prod/task', component: v.TaskListPage, meta: { perm: 'prod/task' } },
    { path: '/prod/report', component: v.ReportListPage, meta: { perm: 'prod/report' } },
    { path: '/prod/progress', component: v.ProgressPage, meta: { perm: 'prod/progress' } },
    { path: '/wms/doc', component: v.DocListPage, meta: { perm: 'wms/doc' } },
    { path: '/wms/stock', component: v.StockPage, meta: { perm: 'wms/stock' } },
    { path: '/wms/flow', component: v.FlowPage, meta: { perm: 'wms/flow' } },
    { path: '/about', component: v.AboutPage, meta: { perm: 'about' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
  ]

  const router = createRouter({ history: createWebHashHistory(), routes })
  /* 供事件回调里跳转用：useRouter() 只能在 setup 内调用，到这里取实例 */
  MES.router = router

  router.beforeEach((to) => {
    if (to.meta.public) return true
    if (!MES.session.user) return '/login'
    if (to.meta.perm && !MES.session.can(to.meta.perm)) {
      MES.msg('没有该模块的权限', 'warning')
      const first = MES.firstAllowedPath ? MES.firstAllowedPath(MES.session) : '/dashboard'
      return to.path === first ? false : first
    }
    return true
  })

  const App = {
    name: 'App',
    template: `
      <router-view v-if="$route.path === '/login'"></router-view>
      <main-layout v-else></main-layout>`
  }

  const app = createApp(App)

  app.component('MainLayout', MES.MainLayout)
  app.component('PageHead', MES.ui.PageHead)
  app.component('StatusTag', MES.ui.StatusTag)
  app.component('CrudPage', MES.ui.CrudPage)

  app.use(ElementPlus, { locale: window.ElementPlusLocaleZhCn })
  app.use(router)

  /* 注册全部 Element Plus 图标 */
  Object.entries(MES.icons).forEach(([name, comp]) => app.component(name, comp))

  app.config.globalProperties.MES = MES
  app.config.globalProperties.state = MES.db.state

  app.config.warnHandler = () => {}

  app.mount('#app')
})(window.MES)
