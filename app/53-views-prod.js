/* 生产管理：工单、工序任务、报工记录、生产进度 */
;(function (MES) {
  const { ref, reactive, computed, watch } = Vue
  const router = () => MES.router
  const db = MES.db
  const state = db.state
  const PageHead = MES.ui.PageHead
  const StatusTag = MES.ui.StatusTag

  const orderOf = (task) => db.byId('workOrder', task.orderId)
  const itemOf = (order) => db.byId('item', order.itemId)
  const tasksOf = (orderId) => state.orderTask.filter((t) => t.orderId === orderId).sort((a, b) => a.seq - b.seq)

  /** 工单整体进度：按各工序合格数的加权推进 */
  function orderProgress(order) {
    const tasks = tasksOf(order.id)
    if (!tasks.length) return 0
    const done = tasks.reduce((s, t) => s + Math.min(t.equipDoneQty, order.planQty), 0)
    return Math.round((done / (tasks.length * order.planQty)) * 100)
  }

  /** 工序任务状态文案：待开始但上道还没移交合格品时，显示“等待前置” */
  function taskStateText(task) {
    if (!task) return ''
    if (task.status !== '待开始') return task.status
    const order = orderOf(task)
    const list = state.orderTask
      .filter((t) => t.orderId === task.orderId)
      .sort((a, b) => a.seq - b.seq)
    const idx = list.findIndex((t) => t.id === task.id)
    const prev = idx <= 0
      ? (order ? Number(order.planQty) : 0)
      : Number(list[idx - 1].equipDoneQty)
    const canReport = prev - Number(task.equipDoneQty) - Number(task.scrapQty)
    return canReport > 0 ? '待开始' : '等待前置'
  }

  /** 下一道工序的负责人：报工即移交，默认由他接收 */
  function nextOwnerOf(task) {
    if (!task) return null
    const next = state.orderTask.find(
      (t) => t.orderId === task.orderId && Number(t.seq) === Number(task.seq) + 1)
    return next ? (next.ownerId || null) : null
  }

  /** 工单欠料：需求 − 已领 + 已退 */
  function shortageOf(orderId) {
    return state.orderMaterial
      .filter((m) => m.orderId === orderId)
      .map((m) => ({
        ...m,
        lackQty: Number(m.reqQty) - Number(m.pickedQty) + Number(m.returnedQty)
      }))
      .filter((m) => m.lackQty > 0)
  }

  // 生产工单列表
  const OrderListPage = {
    name: 'OrderListPage',
    components: { PageHead, StatusTag },
    setup() {
      const kw = ref('')
      const statusFilter = ref('')
      const page = ref(1)
      const size = ref(10)
      const dialog = ref(false)
      const creating = ref(false)
      const busyId = ref(null)
      const form = reactive({ name: '', itemId: '', planQty: 10, factoryId: 1, workshopId: 2, planStart: '', planEnd: '', priority: '中', remark: '' })

      const rows = computed(() => {
        const k = kw.value.trim().toLowerCase()
        return state.workOrder.filter((o) => {
          if (statusFilter.value && o.status !== statusFilter.value) return false
          if (!k) return true
          const it = itemOf(o)
          const fac = db.nameOf('factory', o.factoryId)
          return (o.no + ' ' + (o.name || '') + ' ' + fac + ' ' + (it ? it.code + it.name : ''))
            .toLowerCase().indexOf(k) >= 0
        }).slice().sort((a, b) => b.id - a.id)
      })
      const paged = computed(() => rows.value.slice((page.value - 1) * size.value, page.value * size.value))

      const productOptions = computed(() =>
        state.item.filter((i) => i.category !== '原材料').map((i) => ({ value: i.id, label: `${i.code} ${i.name}` })))

      const factoryOptions = computed(() =>
        state.factory.map((f) => ({ value: f.id, label: `${f.code} ${f.name}` })))

      const workshopOptions = computed(() =>
        state.workshop
          .filter((w) => !form.factoryId || w.factoryId === form.factoryId)
          .map((w) => ({ value: w.id, label: `${w.code} ${w.name}` })))

      function onFactoryChange() {
        if (!workshopOptions.value.some((w) => w.value === form.workshopId)) {
          form.workshopId = workshopOptions.value.length ? workshopOptions.value[0].value : null
        }
      }

      function openCreate() {
        Object.assign(form, {
          name: '', itemId: '', planQty: 10, factoryId: 1, workshopId: 2,
          planStart: MES.dateAgo(-1), planEnd: MES.dateAgo(-7), priority: '中', remark: ''
        })
        dialog.value = true
      }

      async function submitCreate() {
        if (creating.value) return
        creating.value = true
        try {
          const order = await MES.api.createOrder({ ...form, creatorId: MES.session.user.id })
          dialog.value = false
          MES.msg(`工单 ${order.no} 已创建（草稿），请审核下达`)
          router().push('/prod/order/' + order.id)
        } catch (e) { MES.err(e) } finally { creating.value = false }
      }

      async function audit(row) {
        if (busyId.value) return
        try {
          await MES.confirm(`审核通过后将按 BOM 与工艺路线生成物料需求和工序任务，确定下达 ${row.no} 吗？`, '审核下达')
          busyId.value = row.id
          await MES.api.auditOrder(row.id)
          MES.msg('工单已下达')
        } catch (e) { if (e !== 'cancel') MES.err(e) } finally { busyId.value = null }
      }

      async function close(row) {
        if (busyId.value) return
        try {
          await MES.confirm(`关闭后这张工单不能再派工、报工，也不能重新打开；未完成的工序会就此终止。确定关闭 ${row.no} 吗？`, '关闭工单')
          busyId.value = row.id
          await MES.api.closeOrder(row.id)
          MES.msg('工单已关闭')
        } catch (e) { if (e !== 'cancel') MES.err(e) } finally { busyId.value = null }
      }

      async function remove(row) {
        try {
          await MES.confirm(`确认删除草稿工单 ${row.no} 吗？`)
          await MES.api.deleteOrder(row.id)
          MES.msg('已删除')
        } catch (e) { if (e !== 'cancel') MES.err(e) }
      }

      function goDetail(row) { router().push('/prod/order/' + row.id) }

      return {
        kw, statusFilter, page, size, rows, paged, dialog, form, productOptions,
        factoryOptions, workshopOptions, onFactoryChange,
        openCreate, submitCreate, creating, audit, close, busyId, remove, goDetail,
        itemLabel: db.itemLabel, orderProgress,
        nameOf: db.nameOf
      }
    },
    template: `
      <div>
        <page-head title="生产工单" desc="计划员建单后审核下达，系统按 BOM 与工艺路线生成物料需求和工序任务">
          <el-button type="primary" :icon="'Plus'" @click="openCreate">新建工单</el-button>
        </page-head>

        <div class="panel">
          <div class="toolbar">
            <el-input v-model="kw" placeholder="按工单号或产品搜索" clearable style="width:260px" :prefix-icon="'Search'"></el-input>
            <el-select v-model="statusFilter" clearable placeholder="工单状态" style="width:150px">
              <el-option v-for="s in ['草稿','已下达','生产中','已完工','已关闭']" :key="s" :label="s" :value="s"></el-option>
            </el-select>
            <div class="spacer"></div>
            <span class="muted">共 {{ rows.length }} 张工单</span>
          </div>

          <el-table :data="paged" border stripe>
            <el-table-column prop="no" label="工单号" width="170">
              <template #default="{ row }">
                <el-link type="primary" @click="goDetail(row)">{{ row.no }}</el-link>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="工单名称" min-width="170" show-overflow-tooltip></el-table-column>
            <el-table-column label="产品" min-width="200">
              <template #default="{ row }">{{ itemLabel(row.itemId) }}</template>
            </el-table-column>
            <el-table-column prop="planQty" label="计划数量" width="100" align="right"></el-table-column>
            <el-table-column label="负责工厂" width="150">
              <template #default="{ row }">{{ nameOf('factory', row.factoryId) }}</template>
            </el-table-column>
            <el-table-column label="主要车间" width="130">
              <template #default="{ row }">{{ nameOf('workshop', row.workshopId) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><status-tag :value="row.status"></status-tag></template>
            </el-table-column>
            <el-table-column label="进度" width="160">
              <template #default="{ row }">
                <el-progress :percentage="orderProgress(row)" :stroke-width="8"
                             :color="row.status === '已完工' ? '#12b76a' : '#2b6cf6'"></el-progress>
              </template>
            </el-table-column>
            <el-table-column prop="planStart" label="计划开工" width="120"></el-table-column>
            <el-table-column prop="planEnd" label="计划完工" width="120"></el-table-column>
            <el-table-column label="优先级" width="90" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.priority === '高' ? 'danger' : (row.priority === '低' ? 'info' : 'warning')" effect="plain">{{ row.priority }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="230" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="goDetail(row)">详情</el-button>
                <el-button v-if="row.status === '草稿'" link type="success" :loading="busyId === row.id" @click="audit(row)">审核下达</el-button>
                <el-button v-if="row.status === '草稿'" link type="danger" @click="remove(row)">删除</el-button>
                <el-button v-if="['已下达','生产中'].includes(row.status)" link type="warning" :loading="busyId === row.id" @click="close(row)">关闭</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div style="display:flex;justify-content:flex-end;margin-top:14px">
            <el-pagination background layout="total, prev, pager, next" :total="rows.length"
                           v-model:current-page="page" v-model:page-size="size" :page-sizes="[10,20,50]"></el-pagination>
          </div>
        </div>

        <el-dialog v-model="dialog" title="新建生产工单" width="560px">
          <el-form label-width="110px">
            <el-form-item label="工单名称" required>
              <el-input v-model="form.name" placeholder="如 X4 巡检机首批生产，便于现场识别" maxlength="80"></el-input>
            </el-form-item>
            <el-form-item label="生产产品" required>
              <el-select v-model="form.itemId" filterable style="width:100%" placeholder="请选择产品">
                <el-option v-for="o in productOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="计划数量" required>
              <el-input-number v-model="form.planQty" :min="1" style="width:100%"></el-input-number>
            </el-form-item>
            <el-form-item label="负责工厂" required>
              <el-select v-model="form.factoryId" style="width:100%" @change="onFactoryChange">
                <el-option v-for="f in factoryOptions" :key="f.value" :label="f.label" :value="f.value"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="主要车间">
              <el-select v-model="form.workshopId" style="width:100%">
                <el-option v-for="w in workshopOptions" :key="w.value" :label="w.label" :value="w.value"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="计划开工">
              <el-date-picker v-model="form.planStart" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
            </el-form-item>
            <el-form-item label="计划完工">
              <el-date-picker v-model="form.planEnd" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
            </el-form-item>
            <el-form-item label="优先级">
              <el-radio-group v-model="form.priority">
                <el-radio-button label="高"></el-radio-button>
                <el-radio-button label="中"></el-radio-button>
                <el-radio-button label="低"></el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2"></el-input>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="dialog = false">取消</el-button>
            <el-button type="primary" :loading="creating" @click="submitCreate">创建工单</el-button>
          </template>
        </el-dialog>
      </div>`
  }

  // 工单详情
  const OrderDetailPage = {
    name: 'OrderDetailPage',
    components: { StatusTag, PageHead },
    setup() {
      const route = VueRouter.useRoute()
      const r = VueRouter.useRouter()
      const tab = ref('material')
      const reportDialog = ref(false)
      const assignDialog = ref(false)
      const currentTask = ref(null)
      const reportForm = reactive({ qualQty: 0, scrapQty: 0, receiverId: null, remark: '' })
      const assignForm = reactive({ equipmentId: null, workstationId: null, toolingId: null, ownerId: null, planStart: '', planEnd: '' })
      const busy = ref(false)
      const submitting = ref(false)
      const assigning = ref(false)

      /** 报工弹窗：合格 + 报废 合计不能超过可报工数量 */
      const reportTotal = computed(() => (Number(reportForm.qualQty) || 0) + (Number(reportForm.scrapQty) || 0))

      const order = computed(() => db.byId('workOrder', Number(route.params.id)))
      const tasks = computed(() => (order.value ? tasksOf(order.value.id) : []))
      const materials = computed(() => (order.value ? state.orderMaterial.filter((m) => m.orderId === order.value.id) : []))
      const reports = computed(() => (order.value ? state.workReport.filter((x) => x.orderId === order.value.id).slice().sort((a, b) => b.id - a.id) : []))
      const docs = computed(() => (order.value ? state.stockDoc.filter((d) => d.orderId === order.value.id) : []))

      const lastTask = computed(() => (tasks.value.length ? tasks.value[tasks.value.length - 1] : null))
      const waitInbound = computed(() => (lastTask.value ? +(lastTask.value.equipDoneQty - lastTask.value.inboundQty).toFixed(2) : 0))

      const stepIndex = computed(() => {
        if (!order.value) return 0
        const map = { 草稿: 0, 已下达: 1, 生产中: 2, 已完工: 3, 已关闭: 2 }
        return map[order.value.status] ?? 0
      })

      function openReport(task) {
        const lack = shortageOf(task.orderId)
        if (lack.length) { MES.msg('还有 ' + lack.length + ' 项物料未领齐，请先确认领料单再报工', 'warning'); return }
        currentTask.value = task
        Object.assign(reportForm, { qualQty: MES.api.taskAvailable(task), scrapQty: 0, receiverId: nextOwnerOf(task), remark: '' })
        reportDialog.value = true
      }

      const available = computed(() => (currentTask.value ? MES.api.taskAvailable(currentTask.value) : 0))
      const reportOver = computed(() => reportTotal.value > available.value)

      async function submitReport() {
        if (submitting.value || reportOver.value || reportTotal.value <= 0) return
        submitting.value = true
        try {
          await MES.api.addReport({
            taskId: currentTask.value.id,
            qualQty: reportForm.qualQty,
            scrapQty: reportForm.scrapQty,
            receiverId: reportForm.receiverId,
            reporterId: MES.session.user.id,
            remark: reportForm.remark
          })
          reportDialog.value = false
          MES.msg('报工成功')
        } catch (e) { MES.err(e) } finally { submitting.value = false }
      }

      function openAssign(task) {
        /* 详情页任务行是展示视图（字段不全），用完整任务回填 */
        const full = state.orderTask.find((t) => t.id === task.id) || task
        currentTask.value = full
        Object.assign(assignForm, {
          equipmentId: full.equipmentId, workstationId: full.workstationId, toolingId: full.toolingId,
          ownerId: full.ownerId, planStart: full.planStart, planEnd: full.planEnd
        })
        assignDialog.value = true
      }

      async function submitAssign() {
        if (assigning.value) return
        assigning.value = true
        try {
          await MES.api.assignTask(currentTask.value.id, { ...assignForm })
          assignDialog.value = false
          MES.msg('派工已完成')
        } catch (e) { MES.err(e) } finally { assigning.value = false }
      }

      async function audit() {
        if (busy.value) return
        try {
          await MES.confirm('审核后将按 BOM 与工艺路线生成物料需求和工序任务，确定下达吗？', '审核下达')
          busy.value = true
          await MES.api.auditOrder(order.value.id)
          MES.msg('工单已下达')
        } catch (e) { if (e !== 'cancel') MES.err(e) } finally { busy.value = false }
      }

      /** 同一工单已经有未确认的同类草稿单时，不再重复生成 */
      function existingDraft(docType) {
        return state.stockDoc.find((d) =>
          d.docType === docType && d.status === '草稿' && d.orderId === order.value.id)
      }

      async function inbound() {
        if (busy.value) return
        try {
          const dup = existingDraft('成品入库')
          if (dup) {
            MES.msg(`这张工单已有未确认的成品入库草稿 ${dup.no}，请先确认或删除它`, 'warning')
            return
          }
          busy.value = true
          const doc = await MES.api.createInboundDocForOrder(order.value.id, MES.session.user.id)
          MES.msg(`已生成成品入库单 ${doc.no}（草稿），请到"库存单据"确认`)
          r.push('/wms/doc')
        } catch (e) { MES.err(e) } finally { busy.value = false }
      }

      const taskStat = computed(() => {
        const total = tasks.value.length
        const done = tasks.value.filter((t) => t.status === '已完成').length
        return { total, done }
      })

      // 物料需求：一键生成领料草稿单
      async function createPickDoc() {
        if (busy.value) return
        try {
          /* 已领用要等确认才回写，草稿期间欠料仍全额；不拦一下就会重复生成 */
          const dup = existingDraft('生产领料')
          if (dup) {
            MES.msg(`这张工单已有未确认的领料草稿 ${dup.no}，请先确认或删除它`, 'warning')
            return
          }
          const wh = state.warehouse.find((w) => w.type === '原料库') || state.warehouse[0]
          const lines = materials.value
            .map((m) => ({ itemId: m.itemId, qty: +(m.reqQty - m.pickedQty + m.returnedQty).toFixed(3) }))
            .filter((l) => l.qty > 0)
          if (!lines.length) throw new Error('当前没有欠料，无需领料')
          busy.value = true
          const doc = await MES.api.createDoc({
            docType: '生产领料', warehouseId: wh.id, orderId: order.value.id,
            remark: '工单 ' + order.value.no + ' 自动生成领料单',
            lines, creatorId: MES.session.user.id
          })
          MES.msg('已生成领料单 ' + doc.no + '（草稿），请到"库存单据"确认')
          r.push('/wms/doc')
        } catch (e) { MES.err(e) } finally { busy.value = false }
      }

      const shortQty = computed(() =>
        materials.value.reduce((s, m) => s + Math.max(0, m.reqQty - m.pickedQty + m.returnedQty), 0))

      return {
        order, tasks, materials, reports, docs, tab, stepIndex, lastTask, waitInbound, taskStat,
        reportDialog, reportForm, openReport, submitReport, available, currentTask,
        reportTotal, reportOver, busy, submitting, assigning,
        assignDialog, assignForm, openAssign, submitAssign,
        audit, inbound, createPickDoc, shortQty, taskStateText,
        state,
        back: () => r.push('/prod/order'),
        itemLabel: db.itemLabel, nameOf: db.nameOf, itemById: (id) => db.byId('item', id),
        userOf: (id) => db.nameOf('user', id)
      }
    },
    template: `
      <div v-if="order">
        <page-head :title="'工单 ' + order.no + (order.name ? ' · ' + order.name : '')" :desc="itemLabel(order.itemId) + ' ｜ 负责工厂：' + nameOf('factory', order.factoryId)">
          <el-button @click="back">返回列表</el-button>
          <el-button v-if="order.status === '草稿'" type="success" :loading="busy" @click="audit">审核下达</el-button>
          <el-button v-if="['已下达','生产中'].includes(order.status)" type="primary" :loading="busy" :disabled="waitInbound <= 0"
                     @click="inbound">生成成品入库单（待入库 {{ waitInbound }}）</el-button>
        </page-head>

        <div class="panel" style="margin-bottom:14px">
          <div class="steps-bar" style="margin-bottom:16px">
            <template v-for="(s, i) in ['建单（草稿）','审核下达','派工与报工','成品入库完工']" :key="s">
              <div class="step" :class="{ done: i < stepIndex, active: i === stepIndex }">
                <span class="dot"></span>{{ s }}
              </div>
              <div v-if="i < 3" class="step-line"></div>
            </template>
          </div>
          <el-descriptions :column="4" border size="small">
            <el-descriptions-item label="工单号">{{ order.no }}</el-descriptions-item>
            <el-descriptions-item label="工单名称">{{ order.name || '—' }}</el-descriptions-item>
            <el-descriptions-item label="生产产品">{{ itemLabel(order.itemId) }}</el-descriptions-item>
            <el-descriptions-item label="计划数量">{{ order.planQty }}</el-descriptions-item>
            <el-descriptions-item label="工单状态"><status-tag :value="order.status"></status-tag></el-descriptions-item>
            <el-descriptions-item label="负责工厂">{{ nameOf('factory', order.factoryId) }}</el-descriptions-item>
            <el-descriptions-item label="主要车间">{{ nameOf('workshop', order.workshopId) }}</el-descriptions-item>
            <el-descriptions-item label="创建人">{{ order.creatorName || userOf(order.creatorId) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ order.createTime }}</el-descriptions-item>
            <el-descriptions-item label="下达时间">{{ order.auditTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="计划开工">{{ order.planStart || '—' }}</el-descriptions-item>
            <el-descriptions-item label="计划完工">{{ order.planEnd || '—' }}</el-descriptions-item>
            <el-descriptions-item label="工序完成">{{ taskStat.done }} / {{ taskStat.total }}</el-descriptions-item>
            <el-descriptions-item label="备注">{{ order.remark || '—' }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="panel">
          <el-tabs v-model="tab">
            <el-tab-pane label="工序任务" name="task">
              <el-alert v-if="order.status === '草稿'" type="info" :closable="false" show-icon
                        title="草稿状态还没有生成工序任务，请先点右上角「审核下达」" style="margin-bottom:12px"></el-alert>
              <el-table :data="tasks" border stripe>
                <el-table-column prop="seq" label="顺序" width="66" align="center"></el-table-column>
                <el-table-column prop="processName" label="工序名称" min-width="130"></el-table-column>
                <el-table-column label="设备要求" width="120">
                  <template #default="{ row }">{{ row.equipmentType || '-' }}</template>
                </el-table-column>
                <el-table-column label="设备" width="130">
                  <template #default="{ row }">{{ row.equipmentId ? nameOf('equipment', row.equipmentId) : '未派工' }}</template>
                </el-table-column>
                <el-table-column label="工位" width="120">
                  <template #default="{ row }">{{ row.workstationId ? nameOf('workstation', row.workstationId) : '-' }}</template>
                </el-table-column>
                <el-table-column label="负责人" width="100">
                  <template #default="{ row }">{{ row.ownerId ? nameOf('user', row.ownerId) : '-' }}</template>
                </el-table-column>
                <el-table-column prop="planQty" label="投入数" width="90" align="right"></el-table-column>
                <el-table-column label="已合格" width="90" align="right">
                  <template #default="{ row }"><b style="color:#12b76a">{{ row.equipDoneQty }}</b></template>
                </el-table-column>
                <el-table-column label="报废" width="80" align="right">
                  <template #default="{ row }"><span style="color:#f04438">{{ row.scrapQty }}</span></template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                  <template #default="{ row }"><status-tag :value="taskStateText(row)"></status-tag></template>
                </el-table-column>
                <el-table-column label="操作" width="160" fixed="right" align="center">
                  <template #default="{ row }">
                    <el-button v-if="row.status !== '已完成' && row.status !== '已取消'" link type="primary"
                               @click="openAssign(row)">派工</el-button>
                    <el-button v-if="row.status !== '已完成' && row.status !== '已取消' && order.status !== '草稿'"
                               link type="success" @click="openReport(row)">报工</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="物料需求" name="material">
              <div style="display:flex;align-items:center;margin-bottom:12px;gap:12px">
                <el-alert type="info" :closable="false" show-icon style="flex:1"
                          title="审核工单时按 BOM 把单件用量复制成本次需求数量，之后修改 BOM 不影响已下达的工单"></el-alert>
                <el-button type="primary" plain :loading="busy" @click="createPickDoc" :disabled="shortQty <= 0">
                  一键生成领料单
                </el-button>
              </div>
              <el-table :data="materials" border stripe>
                <el-table-column label="物料编号" width="130">
                  <template #default="{ row }">{{ nameOf('item', row.itemId, 'code') }}</template>
                </el-table-column>
                <el-table-column label="物料名称" min-width="200">
                  <template #default="{ row }">{{ nameOf('item', row.itemId) }}</template>
                </el-table-column>
                <el-table-column label="单位" width="80">
                  <template #default="{ row }">{{ nameOf('unit', itemById(row.itemId)?.unitId) }}</template>
                </el-table-column>
                <el-table-column label="需求数量" width="120" align="right">
                  <template #default="{ row }">{{ row.reqQty }}</template>
                </el-table-column>
                <el-table-column label="已领用" width="110" align="right">
                  <template #default="{ row }">{{ row.pickedQty }}</template>
                </el-table-column>
                <el-table-column label="已退回" width="110" align="right">
                  <template #default="{ row }">{{ row.returnedQty }}</template>
                </el-table-column>
                <el-table-column label="欠料" width="110" align="right">
                  <template #default="{ row }">
                    <span :style="{ color: (row.reqQty - row.pickedQty + row.returnedQty) > 0 ? '#f04438' : '#12b76a' }">
                      {{ (row.reqQty - row.pickedQty + row.returnedQty).toFixed(2) }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="报工记录" name="report">
              <el-table :data="reports" border stripe>
                <el-table-column prop="reportTime" label="报工时间" width="180"></el-table-column>
                <el-table-column label="工序" min-width="140">
                  <template #default="{ row }">{{ (tasks.find(t => t.id === row.taskId) || {}).processName || '-' }}</template>
                </el-table-column>
                <el-table-column label="报工人" width="110">
                  <template #default="{ row }">{{ userOf(row.reporterId) }}</template>
                </el-table-column>
                <el-table-column label="接收人" width="110">
                  <template #default="{ row }">{{ row.receiverName || (row.receiverId ? userOf(row.receiverId) : '—') }}</template>
                </el-table-column>
                <el-table-column prop="qualQty" label="合格数" width="100" align="right"></el-table-column>
                <el-table-column prop="scrapQty" label="报废数" width="100" align="right"></el-table-column>
                <el-table-column prop="remark" label="备注" min-width="180"></el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="关联单据" name="doc">
              <el-table :data="docs" border stripe>
                <el-table-column prop="no" label="单据编号" width="180"></el-table-column>
                <el-table-column label="业务类型" width="120">
                  <template #default="{ row }">
                    <el-tag size="small" :type="MES.docTagType(row.docType)" effect="light">{{ row.docType }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="仓库" width="140">
                  <template #default="{ row }">{{ nameOf('warehouse', row.warehouseId) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                  <template #default="{ row }"><status-tag :value="row.status"></status-tag></template>
                </el-table-column>
                <el-table-column prop="createTime" label="创建时间" width="180"></el-table-column>
                <el-table-column label="明细" min-width="240">
                  <template #default="{ row }">
                    <span v-for="l in state.stockDocDetail.filter(d => d.docId === row.id)" :key="l.id" style="margin-right:10px">
                      {{ nameOf('item', l.itemId, 'code') }} × {{ l.qty }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </div>

        <el-dialog v-model="reportDialog" title="工序报工" width="520px">
          <div v-if="currentTask">
            <el-descriptions :column="2" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="工序">{{ currentTask.processName }}</el-descriptions-item>
              <el-descriptions-item label="负责人">{{ currentTask.ownerId ? nameOf('user', currentTask.ownerId) : '未指派' }}</el-descriptions-item>
              <el-descriptions-item label="累计合格">{{ currentTask.equipDoneQty }}</el-descriptions-item>
              <el-descriptions-item label="可报工数量">{{ available }}</el-descriptions-item>
            </el-descriptions>
            <el-form label-width="100px">
              <el-form-item label="本次合格数">
                <el-input-number v-model="reportForm.qualQty" :min="0" :max="available" style="width:100%"></el-input-number>
              </el-form-item>
              <el-form-item label="本次报废数">
                <el-input-number v-model="reportForm.scrapQty" :min="0" :max="available" style="width:100%"></el-input-number>
              </el-form-item>
              <div class="muted" style="margin:-10px 0 12px 100px">
                合格 + 报废 合计
                <b :style="{ color: reportOver ? '#f04438' : '#12b76a' }">{{ reportTotal }}</b>
                ，可报工 {{ available }}
              </div>
              <el-form-item label="接收人（下道）">
                <el-select v-model="reportForm.receiverId" clearable filterable style="width:100%"
                           placeholder="报工即移交，可指定下道接收人">
                  <el-option v-for="u in state.user" :key="u.id" :label="u.name" :value="u.id"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="备注">
                <el-input v-model="reportForm.remark" type="textarea" :rows="2" placeholder="如报废原因"></el-input>
              </el-form-item>
            </el-form>
          </div>
          <template #footer>
            <el-button @click="reportDialog = false">取消</el-button>
            <el-button type="primary" :loading="submitting" :disabled="reportOver || reportTotal <= 0" @click="submitReport">提交报工</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="assignDialog" title="工序派工" width="520px">
          <el-form label-width="100px">
            <el-form-item label="设备">
              <el-select v-model="assignForm.equipmentId" clearable style="width:100%">
                <el-option v-for="e in state.equipment" :key="e.id" :label="e.code + ' ' + e.name" :value="e.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="工位">
              <el-select v-model="assignForm.workstationId" clearable style="width:100%">
                <el-option v-for="w in state.workstation" :key="w.id" :label="w.code + ' ' + w.name" :value="w.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="工装">
              <el-select v-model="assignForm.toolingId" clearable style="width:100%">
                <el-option v-for="t in state.tooling" :key="t.id" :label="t.code + ' ' + t.name" :value="t.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="负责人">
              <el-select v-model="assignForm.ownerId" clearable style="width:100%">
                <el-option v-for="u in state.user.filter(u => u.roleId === 3)" :key="u.id" :label="u.name" :value="u.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="计划开始">
              <el-date-picker v-model="assignForm.planStart" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
            </el-form-item>
            <el-form-item label="计划结束">
              <el-date-picker v-model="assignForm.planEnd" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="assignDialog = false">取消</el-button>
            <el-button type="primary" :loading="assigning" @click="submitAssign">保存派工</el-button>
          </template>
        </el-dialog>
      </div>
      <el-empty v-else description="工单不存在"></el-empty>`
  }

  // 工序任务（全局）
  const TaskListPage = {
    name: 'TaskListPage',
    components: { PageHead, StatusTag },
    setup() {
      const r = VueRouter.useRouter()
      const filter = ref('未完成')
      const orderFilter = ref('')
      const kw = ref('')
      const reportDialog = ref(false)
      const currentTask = ref(null)
      const reportForm = reactive({ qualQty: 0, scrapQty: 0, receiverId: null, remark: '' })

      /* 工单下拉：草稿还没有工序任务，不用列出来；新工单排前面 */
      const orderOptions = computed(() =>
        state.workOrder
          .filter((o) => o.status !== '草稿')
          .slice()
          .sort((a, b) => b.id - a.id)
          .map((o) => ({ value: o.id, label: `${o.no}${o.name ? ' · ' + o.name : ''}` })))

      const rows = computed(() => {
        let list = state.orderTask.slice().sort((a, b) => a.orderId - b.orderId || a.seq - b.seq)
        if (filter.value === '未完成') list = list.filter((t) => ['待开始', '进行中'].indexOf(t.status) >= 0)
        if (filter.value === '已完成') list = list.filter((t) => t.status === '已完成')
        if (orderFilter.value) list = list.filter((t) => t.orderId === orderFilter.value)
        const k = kw.value.trim().toLowerCase()
        if (k) {
          list = list.filter((t) => {
            const o = orderOf(t)
            return ((o ? o.no + ' ' + (o.name || '') : '') + ' ' + (t.processName || ''))
              .toLowerCase().indexOf(k) >= 0
          })
        }
        return list
      })

      const available = computed(() => (currentTask.value ? MES.api.taskAvailable(currentTask.value) : 0))
      const reportTotal = computed(() => (Number(reportForm.qualQty) || 0) + (Number(reportForm.scrapQty) || 0))
      const reportOver = computed(() => reportTotal.value > available.value)
      const submitting = ref(false)
      const assignDialog = ref(false)
      const assignForm = reactive({ equipmentId: null, workstationId: null, toolingId: null, ownerId: null, planStart: '', planEnd: '' })
      const assigning = ref(false)

      function openAssign(task) {
        /* 详情页任务行是展示视图（字段不全），用完整任务回填 */
        const full = state.orderTask.find((t) => t.id === task.id) || task
        currentTask.value = full
        Object.assign(assignForm, {
          equipmentId: full.equipmentId, workstationId: full.workstationId, toolingId: full.toolingId,
          ownerId: full.ownerId, planStart: full.planStart, planEnd: full.planEnd
        })
        assignDialog.value = true
      }

      async function submitAssign() {
        if (assigning.value) return
        assigning.value = true
        try {
          await MES.api.assignTask(currentTask.value.id, { ...assignForm })
          assignDialog.value = false
          MES.msg('派工已完成')
        } catch (e) { MES.err(e) } finally { assigning.value = false }
      }

      function openReport(task) {
        const lack = shortageOf(task.orderId)
        if (lack.length) { MES.msg('还有 ' + lack.length + ' 项物料未领齐，请先确认领料单再报工', 'warning'); return }
        currentTask.value = task
        Object.assign(reportForm, { qualQty: Math.max(available.value, 0), scrapQty: 0, receiverId: nextOwnerOf(task), remark: '' })
        reportDialog.value = true
      }

      async function submitReport() {
        if (submitting.value || reportOver.value || reportTotal.value <= 0) return
        submitting.value = true
        try {
          await MES.api.addReport({
            taskId: currentTask.value.id, qualQty: reportForm.qualQty,
            scrapQty: reportForm.scrapQty, receiverId: reportForm.receiverId,
            reporterId: MES.session.user.id, remark: reportForm.remark
          })
          reportDialog.value = false
          MES.msg('报工成功')
        } catch (e) { MES.err(e) } finally { submitting.value = false }
      }

      return {
        rows, filter, orderFilter, kw, orderOptions, reportDialog, currentTask, reportForm,
        openReport, submitReport, available, reportTotal, reportOver, submitting,
        assignDialog, assignForm, openAssign, submitAssign, assigning, taskStateText,
        state, orderOf, itemLabel: db.itemLabel, nameOf: db.nameOf,
        go: (id) => r.push('/prod/order/' + id)
      }
    },
    template: `
      <div>
        <page-head title="工序任务" desc="派工信息保存在工序任务中，报工记录保留每一次结果"></page-head>
        <div class="panel">
          <div class="toolbar">
            <el-radio-group v-model="filter">
              <el-radio-button label="未完成"></el-radio-button>
              <el-radio-button label="已完成"></el-radio-button>
              <el-radio-button label="全部"></el-radio-button>
            </el-radio-group>
            <el-select v-model="orderFilter" clearable filterable placeholder="全部工单" style="width: 260px">
              <el-option v-for="o in orderOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
            </el-select>
            <el-input v-model="kw" clearable placeholder="按工单号或工序搜索" style="width: 220px"
                      :prefix-icon="'Search'"></el-input>
            <div class="spacer"></div>
            <span class="muted">共 {{ rows.length }} 道工序任务</span>
          </div>
          <el-table :data="rows" border stripe>
            <el-table-column label="工单号" width="170">
              <template #default="{ row }">
                <el-link type="primary" @click="go(row.orderId)">{{ orderOf(row)?.no }}</el-link>
              </template>
            </el-table-column>
            <el-table-column label="产品" min-width="180">
              <template #default="{ row }">{{ itemLabel(orderOf(row)?.itemId) }}</template>
            </el-table-column>
            <el-table-column prop="seq" label="顺序" width="70" align="center"></el-table-column>
            <el-table-column prop="processName" label="工序" width="130"></el-table-column>
            <el-table-column label="设备" width="130">
              <template #default="{ row }">{{ row.equipmentId ? nameOf('equipment', row.equipmentId) : '—' }}</template>
            </el-table-column>
            <el-table-column label="负责人" width="100">
              <template #default="{ row }">{{ row.ownerId ? nameOf('user', row.ownerId) : '—' }}</template>
            </el-table-column>
            <el-table-column prop="equipDoneQty" label="已合格" width="90" align="right"></el-table-column>
            <el-table-column prop="scrapQty" label="报废" width="80" align="right"></el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><status-tag :value="taskStateText(row)"></status-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="center" fixed="right">
              <template #default="{ row }">
                <el-button v-if="['待开始','进行中'].includes(row.status)" link type="primary" @click="openAssign(row)">派工</el-button>
                <el-button v-if="['待开始','进行中'].includes(row.status)" link type="success" @click="openReport(row)">报工</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-dialog v-model="reportDialog" title="工序报工" width="500px">
          <div v-if="currentTask">
            <el-descriptions :column="2" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="工单">{{ orderOf(currentTask)?.no }}</el-descriptions-item>
              <el-descriptions-item label="工序">{{ currentTask.processName }}</el-descriptions-item>
              <el-descriptions-item label="累计合格">{{ currentTask.equipDoneQty }}</el-descriptions-item>
              <el-descriptions-item label="可报工数量">{{ available }}</el-descriptions-item>
            </el-descriptions>
            <el-form label-width="100px">
              <el-form-item label="本次合格数">
                <el-input-number v-model="reportForm.qualQty" :min="0" :max="available" style="width:100%"></el-input-number>
              </el-form-item>
              <el-form-item label="本次报废数">
                <el-input-number v-model="reportForm.scrapQty" :min="0" :max="available" style="width:100%"></el-input-number>
              </el-form-item>
              <div class="muted" style="margin:-10px 0 12px 100px">
                合格 + 报废 合计
                <b :style="{ color: reportOver ? '#f04438' : '#12b76a' }">{{ reportTotal }}</b>
                ，可报工 {{ available }}
              </div>
              <el-form-item label="接收人（下道）">
                <el-select v-model="reportForm.receiverId" clearable filterable style="width:100%"
                           placeholder="报工即移交，可指定下道接收人">
                  <el-option v-for="u in state.user" :key="u.id" :label="u.name" :value="u.id"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="备注"><el-input v-model="reportForm.remark" type="textarea" :rows="2"></el-input></el-form-item>
            </el-form>
          </div>
          <template #footer>
            <el-button @click="reportDialog = false">取消</el-button>
            <el-button type="primary" :loading="submitting" :disabled="reportOver || reportTotal <= 0" @click="submitReport">提交报工</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="assignDialog" title="工序派工" width="520px">
          <el-form label-width="100px">
            <el-form-item label="设备">
              <el-select v-model="assignForm.equipmentId" clearable style="width:100%">
                <el-option v-for="e in state.equipment" :key="e.id" :label="e.code + ' ' + e.name" :value="e.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="工位">
              <el-select v-model="assignForm.workstationId" clearable style="width:100%">
                <el-option v-for="w in state.workstation" :key="w.id" :label="w.code + ' ' + w.name" :value="w.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="工装">
              <el-select v-model="assignForm.toolingId" clearable style="width:100%">
                <el-option v-for="t in state.tooling" :key="t.id" :label="t.code + ' ' + t.name" :value="t.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="负责人">
              <el-select v-model="assignForm.ownerId" clearable style="width:100%">
                <el-option v-for="u in state.user.filter(u => u.roleId === 3)" :key="u.id" :label="u.name" :value="u.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="计划开始">
              <el-date-picker v-model="assignForm.planStart" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
            </el-form-item>
            <el-form-item label="计划结束">
              <el-date-picker v-model="assignForm.planEnd" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="assignDialog = false">取消</el-button>
            <el-button type="primary" :loading="assigning" @click="submitAssign">保存派工</el-button>
          </template>
        </el-dialog>
      </div>`
  }

  // 报工记录
  const ReportListPage = {
    name: 'ReportListPage',
    components: { PageHead },
    setup() {
      const orderFilter = ref('')
      const kw = ref('')

      /* 有报工记录的工单才列出来，新的排前面 */
      const orderOptions = computed(() => {
        const ids = new Set(state.workReport.map((r) => r.orderId))
        return state.workOrder
          .filter((o) => ids.has(o.id))
          .slice()
          .sort((a, b) => b.id - a.id)
          .map((o) => ({ value: o.id, label: `${o.no}${o.name ? ' · ' + o.name : ''}` }))
      })

      /* 选中的工单若已无报工记录，自动回到全部工单，避免下拉显示空值 */
      watch(orderOptions, (list) => {
        if (orderFilter.value && !list.some((o) => o.value === orderFilter.value)) orderFilter.value = ''
      })

      const rows = computed(() => {
        let list = state.workReport.slice().sort((a, b) => b.id - a.id)
        if (orderFilter.value) list = list.filter((r) => r.orderId === orderFilter.value)
        const k = kw.value.trim().toLowerCase()
        if (k) {
          list = list.filter((r) => {
            const o = orderOf({ orderId: r.orderId })
            const t = db.byId('orderTask', r.taskId)
            const text = (o ? o.no + ' ' + (o.name || '') : '') + ' ' + ((t && t.processName) || '') +
              ' ' + db.nameOf('user', r.reporterId)
            return text.toLowerCase().indexOf(k) >= 0
          })
        }
        return list
      })

      async function remove(row) {
        try {
          await MES.confirm('删除该报工记录会同时回滚工序累计数量，确定吗？')
          await MES.api.removeReport(row.id)
          MES.msg('已删除')
        } catch (e) { if (e !== 'cancel') MES.err(e) }
      }
      return {
        rows, orderFilter, kw, orderOptions, state, remove,
        nameOf: db.nameOf, orderOf, taskOf: (id) => db.byId('orderTask', id)
      }
    },
    template: `
      <div>
        <page-head title="报工记录" desc="每次报工都保留合格数与报废数，工序任务中显示累计完成情况"></page-head>
        <div class="panel">
          <div class="toolbar">
            <el-select v-model="orderFilter" clearable filterable placeholder="全部工单" style="width: 280px">
              <el-option v-for="o in orderOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
            </el-select>
            <el-input v-model="kw" clearable placeholder="按工单号 / 工序 / 报工人搜索" style="width: 260px"
                      :prefix-icon="'Search'"></el-input>
            <div class="spacer"></div>
            <span class="muted">共 {{ rows.length }} 条报工记录</span>
          </div>
          <el-table :data="rows" border stripe>
            <el-table-column prop="reportTime" label="报工时间" width="180"></el-table-column>
            <el-table-column label="工单号" width="170">
              <template #default="{ row }">{{ orderOf({ orderId: row.orderId })?.no }}</template>
            </el-table-column>
            <el-table-column label="工序" width="140">
              <template #default="{ row }">{{ taskOf(row.taskId)?.processName || '-' }}</template>
            </el-table-column>
            <el-table-column label="报工人" width="110">
              <template #default="{ row }">{{ nameOf('user', row.reporterId) }}</template>
            </el-table-column>
            <el-table-column label="接收人" width="110">
              <template #default="{ row }">{{ row.receiverName || (row.receiverId ? nameOf('user', row.receiverId) : '—') }}</template>
            </el-table-column>
            <el-table-column prop="qualQty" label="合格数" width="100" align="right"></el-table-column>
            <el-table-column prop="scrapQty" label="报废数" width="100" align="right"></el-table-column>
            <el-table-column prop="remark" label="备注" min-width="200"></el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button link type="danger" @click="remove(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>`
  }

  // 生产进度
  const ProgressPage = {
    name: 'ProgressPage',
    components: { PageHead, StatusTag },
    setup() {
      const orderId = ref(null)
      const orders = computed(() => state.workOrder.filter((o) => ['已下达', '生产中', '已完工'].indexOf(o.status) >= 0).slice().reverse())
      watch(orders, (v) => { if (!orderId.value && v.length) orderId.value = v[0].id }, { immediate: true })

      const current = computed(() => (orderId.value ? db.byId('workOrder', orderId.value) : null))
      const tasks = computed(() => (current.value ? tasksOf(current.value.id) : []))

      /** 在制品计算：前道合格 - 本道已处理 = 待处理；末道合格 - 已入库 = 待入库 */
      const wipRows = computed(() =>
        tasks.value.map((t, i) => {
          const prev = i === 0 ? null : tasks.value[i - 1]
          const input = prev ? prev.equipDoneQty : current.value.planQty
          const processed = t.equipDoneQty + t.scrapQty
          const isLast = i === tasks.value.length - 1
          return {
            ...t,
            inputQty: input,
            processed,
            waiting: +(input - processed).toFixed(2),
            waitInbound: isLast ? +(t.equipDoneQty - t.inboundQty).toFixed(2) : null
          }
        }))

      const summary = computed(() => {
        if (!current.value) return null
        const first = tasks.value[0]
        const last = tasks.value[tasks.value.length - 1]
        return {
          input: current.value.planQty,
          finished: last ? last.equipDoneQty : 0,
          scrap: tasks.value.reduce((s, t) => s + t.scrapQty, 0),
          inbound: last ? last.inboundQty : 0
        }
      })

      return { orderId, orders, current, wipRows, summary, taskStateText, itemLabel: db.itemLabel, nameOf: db.nameOf, orderProgress }
    },
    template: `
      <div>
        <page-head title="生产进度" desc="按工序数量计算在制品：前道合格数减去本道已处理数"></page-head>

        <div class="panel">
          <div class="toolbar">
            <span class="muted">选择工单</span>
            <el-select v-model="orderId" style="width:340px">
              <el-option v-for="o in orders" :key="o.id" :label="o.no + ' · ' + itemLabel(o.itemId)" :value="o.id"></el-option>
            </el-select>
            <div class="spacer"></div>
            <span class="muted">进度 {{ current ? orderProgress(current) : 0 }}%</span>
          </div>

          <template v-if="current">
            <div class="stat-grid" style="margin-bottom:16px">
              <div class="stat-card blue">
                <div class="label">计划投入</div>
                <div class="value">{{ summary.input }}<span class="unit">台</span></div>
                <div class="foot">工单 {{ current.no }}</div>
              </div>
              <div class="stat-card green">
                <div class="label">末道工序合格</div>
                <div class="value">{{ summary.finished }}<span class="unit">台</span></div>
                <div class="foot">可直接入库的成品数</div>
              </div>
              <div class="stat-card orange">
                <div class="label">累计报废</div>
                <div class="value">{{ summary.scrap }}<span class="unit">台</span></div>
                <div class="foot">各工序报废合计</div>
              </div>
              <div class="stat-card purple">
                <div class="label">已入库</div>
                <div class="value">{{ summary.inbound }}<span class="unit">台</span></div>
                <div class="foot">成品入库单已确认数量</div>
              </div>
            </div>

            <el-table :data="wipRows" border stripe>
              <el-table-column prop="seq" label="顺序" width="66" align="center"></el-table-column>
              <el-table-column prop="processName" label="工序" min-width="130"></el-table-column>
              <el-table-column label="投入数（上道合格）" width="160" align="right">
                <template #default="{ row }">{{ row.inputQty }}</template>
              </el-table-column>
              <el-table-column label="本道已处理" width="120" align="right">
                <template #default="{ row }">{{ row.processed }}</template>
              </el-table-column>
              <el-table-column label="在制待处理" width="130" align="right">
                <template #default="{ row }">
                  <span :style="{ color: row.waiting > 0 ? '#f79009' : '#12b76a', fontWeight: 600 }">{{ row.waiting }}</span>
                </template>
              </el-table-column>
              <el-table-column label="合格" width="90" align="right">
                <template #default="{ row }">{{ row.equipDoneQty }}</template>
              </el-table-column>
              <el-table-column label="报废" width="90" align="right">
                <template #default="{ row }"><span style="color:#f04438">{{ row.scrapQty }}</span></template>
              </el-table-column>
              <el-table-column label="待入库" width="110" align="right">
                <template #default="{ row }">
                  <span v-if="row.waitInbound !== null">{{ row.waitInbound }}</span>
                  <span v-else class="muted">—</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><status-tag :value="taskStateText(row)"></status-tag></template>
              </el-table-column>
            </el-table>
          </template>
          <el-empty v-else description="暂无可查看的工单"></el-empty>
        </div>
      </div>`
  }

  // 工单进度（在制工单按工序步骤展示，分页）
  const WipPage = {
    name: 'WipPage',
    components: { PageHead },
    setup() {
      const page = ref(1)
      const pageSize = ref(5)

      const all = computed(() =>
        state.workOrder
          .filter((o) => ['生产中', '已下达'].indexOf(o.status) >= 0)
          .map((o) => {
            const steps = state.orderTask
              .filter((t) => t.orderId === o.id)
              .sort((a, b) => a.seq - b.seq)
              .map((t) => ({
                id: t.id,
                seq: t.seq,
                name: t.processName,
                status: t.status,
                qty: t.equipDoneQty,
                cls: t.status === '已完成' ? 'done' : (t.status === '进行中' ? 'doing' : 'wait')
              }))
            steps.forEach((s, i) => {
              s.linkDone = i > 0 && steps[i - 1].status === '已完成' && s.status === '已完成'
            })
            const doneCount = steps.filter((s) => s.status === '已完成').length
            return { ...o, steps, doneCount }
          })
          .sort((a, b) => {
            if (b.doneCount !== a.doneCount) return b.doneCount - a.doneCount
            if (a.status !== b.status) return a.status === '生产中' ? -1 : 1
            return b.id - a.id
          }))

      const rows = computed(() => {
        const start = (page.value - 1) * pageSize.value
        return all.value.slice(start, start + pageSize.value)
      })

      const stats = computed(() => ({
        total: all.value.length,
        doing: all.value.filter((o) => o.status === '生产中').length,
        waiting: all.value.filter((o) => o.status === '已下达').length,
        pages: Math.max(1, Math.ceil(all.value.length / pageSize.value))
      }))

      /* 数据刷新后总数可能变少：页码越界时回到最后一页，避免出现空白页 */
      watch(stats, (s) => { if (page.value > s.pages) page.value = s.pages })

      return {
        page, pageSize, total: computed(() => all.value.length), rows, stats, state,
        itemLabel: db.itemLabel,
        go: (p) => MES.router.push(p),
        onPage: (p) => { page.value = p }
      }
    },
    template: `
      <div>
        <page-head title="工单进度" desc="在制工单按工序步骤展示：绿色已完成、橙色进行中、灰色待开始或等待前置"></page-head>

        <div class="panel">
          <div class="toolbar">
            <span class="muted">在制工单</span>
            <b>{{ stats.total }}</b>
            <span class="muted">张（生产中 {{ stats.doing }} · 已下达未开工 {{ stats.waiting }}）</span>
            <div class="spacer"></div>
            <span class="muted">第 {{ page }} / {{ stats.pages }} 页</span>
          </div>

          <div v-for="o in rows" :key="o.id" class="wo-flow">
            <div class="wo-flow-head">
              <el-link type="primary" @click="go('/prod/order/' + o.id)">{{ o.no }}</el-link>
              <span class="muted">{{ o.name }}</span>
              <span class="muted">{{ itemLabel(o.itemId) }} · {{ o.planQty }} 台</span>
              <el-tag size="small" :type="o.status === '生产中' ? 'primary' : 'warning'" effect="light">{{ o.status }}</el-tag>
              <div class="spacer"></div>
              <span class="muted">已完成 {{ o.doneCount }}/{{ o.steps.length }} 道工序</span>
            </div>
            <div class="wo-steps">
              <span v-for="(s, i) in o.steps" :key="s.id" class="wo-item">
                <span v-if="i" class="wo-conn" :class="s.linkDone ? 'done' : ''"></span>
                <span class="wo-step" :class="s.cls">
                  <span class="wo-dot"></span>
                  <span class="wo-name">{{ s.name }}</span>
                  <span class="wo-qty">{{ s.status === '待开始' ? '—' : s.qty }}</span>
                </span>
              </span>
            </div>
          </div>

          <el-empty v-if="!total" description="暂无在制工单" :image-size="80"></el-empty>

          <div v-if="total > pageSize" style="display:flex;justify-content:center;margin-top:16px">
            <el-pagination background layout="prev, pager, next, total" :total="total"
                           :page-size="pageSize" :current-page="page" @current-change="onPage"></el-pagination>
          </div>
        </div>
      </div>`
  }

  Object.assign(MES.views, { OrderListPage, OrderDetailPage, TaskListPage, ReportListPage, ProgressPage, WipPage })
})(window.MES)







