/* 基础资料页面 */
;(function (MES) {
  const { computed, ref, watch } = Vue
  const db = MES.db
  const state = db.state
  const CrudPage = MES.ui.CrudPage
  const PageHead = MES.ui.PageHead

  const opt = (arr, valueKey = 'id', labelKey = 'name') =>
    arr.map((r) => ({ value: r[valueKey], label: r[labelKey] }))

  // 工厂与车间
  const FactoryPage = {
    name: 'FactoryPage',
    components: { CrudPage },
    setup() {
      const tab = Vue.ref('factory')

      const factoryCfg = {
        table: 'factory',
        title: '工厂',
        desc: '工厂下设车间与仓库，生产资源按车间管理',
        searchKeys: ['code', 'name', 'leader'],
        columns: [
          { prop: 'code', label: '工厂编号', width: 110 },
          { prop: 'name', label: '工厂名称', minWidth: 180 },
          { prop: 'leader', label: '负责人', width: 100 },
          { prop: 'address', label: '地址', minWidth: 220 },
          { prop: 'contact', label: '联系电话', width: 150 },
          { prop: 'remark', label: '备注', minWidth: 160 }
        ],
        fields: [
          { prop: 'code', label: '工厂编号', required: true },
          { prop: 'name', label: '工厂名称', required: true },
          { prop: 'leader', label: '负责人' },
          { prop: 'address', label: '地址' },
          { prop: 'contact', label: '联系电话' },
          { prop: 'remark', label: '备注', type: 'textarea' }
        ],
        guard: (row) => (state.workshop.some((w) => w.factoryId === row.id) ? '该工厂下还有车间，不能删除' : '')
      }

      const workshopCfg = {
        table: 'workshop',
        title: '车间',
        desc: '设备、工位、工装归属于车间',
        searchKeys: ['code', 'name', 'leader'],
        filter: {
          prop: 'factoryId',
          label: '所属工厂',
          options: () => opt(state.factory)
        },
        columns: [
          { prop: 'code', label: '车间编号', width: 110 },
          { prop: 'name', label: '车间名称', minWidth: 160 },
          { prop: 'factoryId', label: '所属工厂', minWidth: 180, display: (r) => db.nameOf('factory', r.factoryId) },
          { prop: 'leader', label: '车间主任', width: 110 },
          { prop: 'remark', label: '职责说明', minWidth: 220 }
        ],
        fields: [
          { prop: 'code', label: '车间编号', required: true },
          { prop: 'name', label: '车间名称', required: true },
          { prop: 'factoryId', label: '所属工厂', type: 'select', options: () => opt(state.factory), required: true },
          { prop: 'leader', label: '车间主任' },
          { prop: 'remark', label: '职责说明', type: 'textarea' }
        ],
        guard: (row) => (state.equipment.some((e) => e.workshopId === row.id) ? '该车间下还有设备，不能删除' : '')
      }

      const departmentCfg = {
        table: 'department',
        title: '部门',
        desc: '部门与车间平级，同属工厂；用户可归属部门或车间',
        searchKeys: ['code', 'name', 'leader'],
        filter: {
          prop: 'factoryId',
          label: '所属工厂',
          options: () => opt(state.factory)
        },
        columns: [
          { prop: 'code', label: '部门编号', width: 110 },
          { prop: 'name', label: '部门名称', minWidth: 160 },
          { prop: 'factoryId', label: '所属工厂', minWidth: 180, display: (r) => db.nameOf('factory', r.factoryId) },
          { prop: 'leader', label: '部门负责人', width: 120 },
          { prop: 'remark', label: '职责说明', minWidth: 220 }
        ],
        fields: [
          { prop: 'code', label: '部门编号', required: true },
          { prop: 'name', label: '部门名称', required: true },
          { prop: 'factoryId', label: '所属工厂', type: 'select', options: () => opt(state.factory), required: true },
          { prop: 'leader', label: '部门负责人' },
          { prop: 'remark', label: '职责说明', type: 'textarea' }
        ],
        guard: (row) => (state.user.some((u) => u.departmentId === row.id) ? '该部门下还有人员，不能删除' : '')
      }

      return {
        tab, factoryCfg, workshopCfg, departmentCfg,
        factoryRows: computed(() => state.factory),
        workshopRows: computed(() => state.workshop),
        departmentRows: computed(() => state.department)
      }
    },
    template: `
      <div>
        <el-tabs v-model="tab">
          <el-tab-pane label="工厂" name="factory">
            <crud-page :cfg="factoryCfg" :rows="factoryRows"></crud-page>
          </el-tab-pane>
          <el-tab-pane label="车间" name="workshop">
            <crud-page :cfg="workshopCfg" :rows="workshopRows"></crud-page>
          </el-tab-pane>
          <el-tab-pane label="部门" name="department">
            <crud-page :cfg="departmentCfg" :rows="departmentRows"></crud-page>
          </el-tab-pane>
        </el-tabs>
      </div>`
  }

  // 仓库
  const WarehousePage = {
    name: 'WarehousePage',
    components: { CrudPage },
    setup() {
      const cfg = {
        table: 'warehouse',
        title: '仓库管理',
        desc: '仓库归属工厂，按类型区分原料库 / 半成品库 / 成品库（在库物料在"库存余额"页查看）',
        searchKeys: ['code', 'name', 'leader'],
        filter: { prop: 'type', label: '仓库类型', options: ['原料库', '半成品库', '成品库', '其他'] },
        columns: [
          { prop: 'code', label: '仓库编号', width: 110 },
          { prop: 'name', label: '仓库名称', minWidth: 150 },
          { prop: 'type', label: '仓库类型', width: 120, type: 'tag' },
          { prop: 'factoryId', label: '所属工厂', minWidth: 180, display: (r) => db.nameOf('factory', r.factoryId) },
          { prop: 'leader', label: '仓管员', width: 110 },
          { prop: 'remark', label: '备注', minWidth: 180 }
        ],
        fields: [
          { prop: 'code', label: '仓库编号', required: true },
          { prop: 'name', label: '仓库名称', required: true },
          { prop: 'type', label: '仓库类型', type: 'select', options: ['原料库', '半成品库', '成品库', '其他'], required: true },
          { prop: 'factoryId', label: '所属工厂', type: 'select', options: () => opt(state.factory), required: true },
          { prop: 'leader', label: '仓管员' },
          { prop: 'remark', label: '备注', type: 'textarea' }
        ]
      }
      return { cfg, rows: computed(() => state.warehouse) }
    },
    template: `<crud-page :cfg="cfg" :rows="rows"></crud-page>`
  }

  // 用户与角色
  const UserPage = {
    name: 'UserPage',
    components: { CrudPage },
    setup() {
      const tab = Vue.ref('user')
      const userCfg = {
        table: 'user',
        title: '用户',
        desc: '用户通过角色区分操作范围',
        searchKeys: ['account', 'name', 'phone'],
        filter: { prop: 'roleId', label: '角色', options: () => opt(state.role) },
        columns: [
          { prop: 'account', label: '登录账号', width: 140 },
          { prop: 'name', label: '姓名', width: 110 },
          { prop: 'roleId', label: '角色', width: 130, display: (r) => db.nameOf('role', r.roleId) },
          { prop: 'workshopId', label: '所属车间', minWidth: 150, display: (r) => (r.workshopId ? db.nameOf('workshop', r.workshopId) : '—') },
          { prop: 'phone', label: '手机号', width: 140 },
          { prop: 'status', label: '状态', width: 90, type: 'tag' }
        ],
        fields: [
          { prop: 'account', label: '登录账号', required: true },
          { prop: 'name', label: '姓名', required: true },
          { prop: 'password', label: '密码', default: '123456' },
          { prop: 'roleId', label: '角色', type: 'select', options: () => opt(state.role), required: true },
          { prop: 'workshopId', label: '所属车间', type: 'select', options: () => opt(state.workshop) },
          { prop: 'phone', label: '手机号' },
          { prop: 'status', label: '状态', type: 'select', options: ['启用', '停用'], required: true }
        ]
      }

      const roleCfg = {
        table: 'role',
        title: '角色',
        desc: '角色决定用户可以执行的操作范围',
        searchKeys: ['code', 'name'],
        columns: [
          { prop: 'code', label: '角色编号', width: 110 },
          { prop: 'name', label: '角色名称', width: 160 },
          { prop: 'remark', label: '权限说明', minWidth: 240 },
          {
            prop: 'users', label: '用户数', width: 100, type: 'num',
            display: (r) => state.user.filter((u) => u.roleId === r.id).length
          }
        ],
        fields: [
          { prop: 'code', label: '角色编号', required: true },
          { prop: 'name', label: '角色名称', required: true },
          { prop: 'remark', label: '权限说明', type: 'textarea' }
        ]
      }

      return {
        tab, userCfg, roleCfg,
        userRows: computed(() => state.user),
        roleRows: computed(() => state.role)
      }
    },
    template: `
      <el-tabs v-model="tab">
        <el-tab-pane label="用户" name="user"><crud-page :cfg="userCfg" :rows="userRows"></crud-page></el-tab-pane>
        <el-tab-pane label="角色" name="role"><crud-page :cfg="roleCfg" :rows="roleRows"></crud-page></el-tab-pane>
      </el-tabs>`
  }

  // 设备 / 工位 / 工装
  function makeResourcePage(name, table, optsCfg) {
    return {
      name,
      components: { CrudPage },
      setup() {
        const cfg = Object.assign({
          table,
          searchKeys: ['code', 'name', 'model'],
          filter: { prop: 'workshopId', label: '所属车间', options: () => opt(state.workshop) },
          columns: [
            { prop: 'code', label: '编号', width: 110 },
            { prop: 'name', label: '名称', minWidth: 160 },
            { prop: 'workshopId', label: '所属车间', minWidth: 150, display: (r) => db.nameOf('workshop', r.workshopId) },
            { prop: 'model', label: '型号/规格', width: 140 },
            { prop: 'remark', label: '备注', minWidth: 180 }
          ],
          fields: [
            { prop: 'code', label: '编号', required: true },
            { prop: 'name', label: '名称', required: true },
            { prop: 'workshopId', label: '所属车间', type: 'select', options: () => opt(state.workshop), required: true },
            { prop: 'model', label: '型号/规格' },
            { prop: 'remark', label: '备注', type: 'textarea' }
          ]
        }, optsCfg || {})
        return { cfg, rows: computed(() => state[table]) }
      },
      template: `<crud-page :cfg="cfg" :rows="rows"></crud-page>`
    }
  }

  const EquipmentPage = makeResourcePage('EquipmentPage', 'equipment', {
    title: '设备管理',
    desc: '设备归属于车间，工序任务派工时选择具体设备',
    columns: [
      { prop: 'code', label: '设备编号', width: 110 },
      { prop: 'name', label: '设备名称', minWidth: 150 },
      { prop: 'model', label: '型号', width: 130 },
      { prop: 'workshopId', label: '所属车间', minWidth: 150, display: (r) => db.nameOf('workshop', r.workshopId) },
      { prop: 'status', label: '状态', width: 100, type: 'tag' },
      {
        prop: 'tasks', label: '在用工序', width: 110, type: 'num',
        display: (r) => state.orderTask.filter((t) => t.equipmentId === r.id && t.status !== '已完成' && t.status !== '已取消').length
      }
    ],
    fields: [
      { prop: 'code', label: '设备编号', required: true },
      { prop: 'name', label: '设备名称', required: true },
      { prop: 'model', label: '型号' },
      { prop: 'workshopId', label: '所属车间', type: 'select', options: () => opt(state.workshop), required: true },
      { prop: 'status', label: '状态', type: 'select', options: ['正常', '检修', '停用'], required: true },
      { prop: 'remark', label: '备注', type: 'textarea' }
    ]
  })

  const WorkstationPage = makeResourcePage('WorkstationPage', 'workstation', {
    title: '工位管理',
    desc: '工位归属于车间，派工时指定工序所在工位',
    columns: [
      { prop: 'code', label: '工位编号', width: 110 },
      { prop: 'name', label: '工位名称', minWidth: 150 },
      { prop: 'workshopId', label: '所属车间', minWidth: 150, display: (r) => db.nameOf('workshop', r.workshopId) },
      { prop: 'location', label: '位置', minWidth: 140 },
      { prop: 'remark', label: '备注', minWidth: 160 }
    ],
    fields: [
      { prop: 'code', label: '工位编号', required: true },
      { prop: 'name', label: '工位名称', required: true },
      { prop: 'workshopId', label: '所属车间', type: 'select', options: () => opt(state.workshop), required: true },
      { prop: 'location', label: '位置' },
      { prop: 'remark', label: '备注', type: 'textarea' }
    ]
  })

  const ToolingPage = makeResourcePage('ToolingPage', 'tooling', {
    title: '工装管理',
    desc: '工装（夹具、治具）归属于车间',
    columns: [
      { prop: 'code', label: '工装编号', width: 110 },
      { prop: 'name', label: '工装名称', minWidth: 160 },
      { prop: 'workshopId', label: '所属车间', minWidth: 150, display: (r) => db.nameOf('workshop', r.workshopId) },
      { prop: 'model', label: '型号', width: 130 },
      { prop: 'remark', label: '备注', minWidth: 160 }
    ],
    fields: [
      { prop: 'code', label: '工装编号', required: true },
      { prop: 'name', label: '工装名称', required: true },
      { prop: 'workshopId', label: '所属车间', type: 'select', options: () => opt(state.workshop), required: true },
      { prop: 'model', label: '型号' },
      { prop: 'remark', label: '备注', type: 'textarea' }
    ]
  })

  // 计量单位
  const UnitPage = {
    name: 'UnitPage',
    components: { CrudPage },
    setup() {
      const cfg = {
        table: 'unit',
        title: '计量单位',
        desc: '产品物料引用计量单位',
        searchKeys: ['code', 'name'],
        columns: [
          { prop: 'code', label: '单位编号', width: 130 },
          { prop: 'name', label: '单位名称', width: 160 },
          { prop: 'remark', label: '备注', minWidth: 200 },
          {
            prop: 'used', label: '使用物料数', width: 130, type: 'num',
            display: (r) => state.item.filter((i) => i.unitId === r.id).length
          }
        ],
        fields: [
          { prop: 'code', label: '单位编号', required: true },
          { prop: 'name', label: '单位名称', required: true },
          { prop: 'remark', label: '备注' }
        ],
        guard: (row) => (state.item.some((i) => i.unitId === row.id) ? '该单位已被物料引用，不能删除' : '')
      }
      return { cfg, rows: computed(() => state.unit) }
    },
    template: `<crud-page :cfg="cfg" :rows="rows"></crud-page>`
  }

  // 产品物料
  const ItemPage = {
    name: 'ItemPage',
    components: { CrudPage },
    setup() {
      const cfg = {
        table: 'item',
        title: '产品物料',
        desc: '成品与原材料统一保存在一张表中，通过类别区分',
        searchKeys: ['code', 'name', 'spec', 'subCategory'],
        filter: { prop: 'category', label: '物料类别', options: ['成品', '半成品', '原材料'] },
        columns: [
          { prop: 'code', label: '物料编号', width: 120 },
          { prop: 'name', label: '物料名称', minWidth: 190 },
          { prop: 'category', label: '类别', width: 100, type: 'tag' },
          { prop: 'subCategory', label: '细分类别', width: 110 },
          { prop: 'spec', label: '规格', minWidth: 140 },
          { prop: 'unitId', label: '单位', width: 80, display: (r) => db.nameOf('unit', r.unitId) },
          { prop: 'safetyStock', label: '安全库存', width: 110, type: 'num', align: 'right' },
          { prop: 'refPrice', label: '参考单价', width: 110, align: 'right', display: (r) => MES.money(r.refPrice) },
          {
            prop: 'total', label: '当前库存', width: 110, align: 'right',
            display: (r) => MES.num(state.stockBalance.filter((b) => b.itemId === r.id).reduce((s, b) => s + b.qty, 0))
          },
          {
            prop: 'bom', label: 'BOM', width: 90, align: 'center',
            display: (r) => (state.bom.some((b) => b.itemId === r.id && b.status === '启用') ? '已维护' : '未维护')
          },
          { prop: 'remark', label: '备注', minWidth: 140 }
        ],
        fields: [
          { prop: 'code', label: '物料编号', required: true },
          { prop: 'name', label: '物料名称', required: true },
          { prop: 'category', label: '类别', type: 'select', options: ['成品', '半成品', '原材料'], required: true },
          { prop: 'subCategory', label: '细分类别', placeholder: '可自由填写，如 整机 / 结构件 / 电子件' },
          { prop: 'unitId', label: '计量单位', type: 'select', options: () => opt(state.unit), required: true },
          { prop: 'spec', label: '规格型号' },
          { prop: 'safetyStock', label: '安全库存', type: 'number' },
          { prop: 'refPrice', label: '参考单价', type: 'number', placeholder: '不含税，建单时默认带出' },
          { prop: 'remark', label: '备注', type: 'textarea' }
        ]
      }
      return { cfg, rows: computed(() => state.item) }
    },
    template: `<crud-page :cfg="cfg" :rows="rows"></crud-page>`
  }

  // 供应商 / 客户
  const PartnerPage = {
    name: 'PartnerPage',
    components: { CrudPage },
    setup() {
      const cfg = {
        table: 'partner',
        title: '供应商与客户',
        desc: '供应商与客户存在同一张表中，用"类型"区分：供应商负责来料，客户对应销售出库',
        searchKeys: ['code', 'name', 'contact', 'phone'],
        filter: { prop: 'partnerType', label: '类型', options: ['供应商', '客户'] },
        columns: [
          { prop: 'code', label: '编号', width: 120 },
          { prop: 'name', label: '单位名称', minWidth: 220 },
          { prop: 'partnerType', label: '类型', width: 100, type: 'tag' },
          { prop: 'contact', label: '联系人', width: 100 },
          { prop: 'phone', label: '联系电话', width: 150 },
          { prop: 'address', label: '地址', minWidth: 220 },
          { prop: 'remark', label: '备注', minWidth: 160 }
        ],
        fields: [
          { prop: 'code', label: '编号', required: true },
          { prop: 'name', label: '单位名称', required: true },
          { prop: 'partnerType', label: '类型', type: 'select', options: ['供应商', '客户'], required: true },
          { prop: 'contact', label: '联系人' },
          { prop: 'phone', label: '联系电话' },
          { prop: 'address', label: '地址' },
          { prop: 'remark', label: '备注', type: 'textarea' }
        ]
      }
      return { cfg, rows: computed(() => state.partner) }
    },
    template: `<crud-page :cfg="cfg" :rows="rows"></crud-page>`
  }


  // 角色权限：给每个角色勾选能访问的页面（只有系统管理员可配置）
  const RolePermPage = {
    name: 'RolePermPage',
    components: { PageHead },
    setup() {
      const session = MES.session
      const roleId = ref(3)
      const checked = ref([])
      const saving = ref(false)
      const isAdmin = computed(() => session.roleCode === 'R01')

      const roles = computed(() => state.role.map((r) => ({
        value: r.id,
        label: r.name + (r.code === 'R01' ? '（全部权限）' : ''),
        isAdmin: r.code === 'R01'
      })))

      /** 按菜单分组生成勾选项 */
      const groups = computed(() => {
        const out = []
        MES.MENUS.forEach((m) => {
          if (m.children) {
            out.push({ title: m.title, items: m.children.map((c) => ({ perm: c.perm, title: c.title })) })
          } else {
            out.push({ title: '', items: [{ perm: m.perm, title: m.title }] })
          }
        })
        return out
      })

      function load() {
        const role = state.role.find((r) => Number(r.id) === Number(roleId.value))
        if (!role) { checked.value = []; return }
        if (role.code === 'R01') { checked.value = ['*']; return }
        let arr = role.perms
        if (typeof arr === 'string') {
          try { arr = JSON.parse(arr) } catch (e) { arr = [] }
        }
        checked.value = Array.isArray(arr) ? arr.slice() : []
      }
      watch(roleId, load)
      load()

      const currentIsAdmin = computed(() => {
        const role = state.role.find((r) => Number(r.id) === Number(roleId.value))
        return !!role && role.code === 'R01'
      })

      async function save() {
        if (!isAdmin.value || currentIsAdmin.value) return
        saving.value = true
        try {
          await MES.api.updateRow('role', roleId.value, { perms: JSON.stringify(checked.value) })
          MES.msg('权限已保存，重新登录或刷新后生效')
        } catch (e) { MES.err(e) } finally { saving.value = false }
      }

      return { roles, roleId, checked, groups, save, saving, isAdmin, currentIsAdmin, state }
    },
    template: `
      <div>
        <page-head title="角色权限" desc="给每个角色勾选可访问的页面；系统管理员固定拥有全部权限"></page-head>

        <div class="panel">
          <el-alert v-if="!isAdmin" type="warning" :closable="false" show-icon
                    title="只有系统管理员可以配置角色权限"></el-alert>

          <div class="toolbar" style="margin-top:12px">
            <span class="muted">角色</span>
            <el-select v-model="roleId" style="width:260px">
              <el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value"></el-option>
            </el-select>
            <div class="spacer"></div>
            <span class="muted">已选 {{ currentIsAdmin ? '全部' : checked.length }} 项</span>
            <el-button type="primary" :loading="saving" :disabled="!isAdmin || currentIsAdmin" @click="save">保存</el-button>
          </div>

          <el-alert v-if="currentIsAdmin" type="success" :closable="false" show-icon style="margin-bottom:12px"
                    title="系统管理员默认拥有全部页面权限，无需配置"></el-alert>

          <div v-for="g in groups" :key="g.title || g.items[0].perm" style="margin-bottom:14px">
            <div v-if="g.title" style="font-weight:600;margin-bottom:6px">{{ g.title }}</div>
            <el-checkbox-group v-model="checked" :disabled="!isAdmin || currentIsAdmin">
              <el-checkbox v-for="it in g.items" :key="it.perm" :label="it.perm">{{ it.title }}</el-checkbox>
            </el-checkbox-group>
          </div>
        </div>
      </div>`
  }

  Object.assign(MES.views, {
    FactoryPage, WarehousePage, UserPage, EquipmentPage,
    WorkstationPage, ToolingPage, UnitPage, ItemPage, PartnerPage, RolePermPage
  })
})(window.MES)
