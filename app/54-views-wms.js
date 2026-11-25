/* 仓储管理：库存单据、库存余额、出入库流水 */
;(function (MES) {
  const { ref, reactive, computed, watch } = Vue
  const db = MES.db
  const state = db.state
  const PageHead = MES.ui.PageHead
  const StatusTag = MES.ui.StatusTag

  const DOC_TYPES = ['采购入库', '生产领料', '生产退料', '成品入库', '销售出库']
  const IN_TYPES = ['采购入库', '生产退料', '成品入库']

  // 库存单据
  const DocListPage = {
    name: 'DocListPage',
    components: { PageHead, StatusTag },
    setup() {
      const typeFilter = ref('')
      const statusFilter = ref('')
      const drawer = ref(false)
      const current = ref(null)
      const createDialog = ref(false)
      const form = reactive({ docType: '采购入库', warehouseId: null, orderId: null, partnerId: null, amount: 0, remark: '', lines: [] })

      const rows = computed(() =>
        state.stockDoc.filter((d) => {
          if (typeFilter.value && d.docType !== typeFilter.value) return false
          if (statusFilter.value && d.status !== statusFilter.value) return false
          return true
        }).slice().sort((a, b) => b.id - a.id))

      const lines = computed(() => (current.value ? state.stockDocDetail.filter((l) => l.docId === current.value.id) : []))

      const itemOptions = computed(() =>
        state.item.map((i) => ({ value: i.id, label: `${i.code} ${i.name}` })))

      const orderOptions = computed(() =>
        state.workOrder.filter((o) => o.status !== '草稿').map((o) => ({
          value: o.id, label: `${o.no} · ${db.itemLabel(o.itemId)}`
        })))

      /** 采购入库选供应商、销售出库选客户，其他类型不需要往来单位 */
      const partnerTypeOf = computed(() => (form.docType === '采购入库' ? '供应商' : (form.docType === '销售出库' ? '客户' : '')))
      const partnerOptions = computed(() => (partnerTypeOf.value
        ? state.partner
          .filter((p) => p.partnerType === partnerTypeOf.value)
          .map((p) => ({ value: p.id, label: p.code + ' ' + p.name }))
        : []))

      /* ---- 金额 ---- */
      /** 只有采购入库 / 销售出库填总金额 */
      const moneyDocType = computed(() => ['采购入库', '销售出库'].indexOf(form.docType) >= 0)
      function amountOfDoc(row) {
        if (!row) return 0
        return Number(row.amount || 0)
      }

      /* 换业务类型时清掉不属于新类型的往来单位 / 关联工单 / 金额，避免带错值提交 */
      watch(() => form.docType, () => {
        form.partnerId = null
        form.amount = 0
        if (['生产领料', '生产退料', '成品入库'].indexOf(form.docType) < 0) form.orderId = null
      })

      const saving = ref(false)
      const confirmingId = ref(null)

      function openCreate() {
        Object.assign(form, { docType: '采购入库', warehouseId: state.warehouse[0] ? state.warehouse[0].id : null, orderId: null, partnerId: null, remark: '', amount: 0, lines: [{ itemId: null, qty: 1 }] })
        createDialog.value = true
      }

      function addLine() { form.lines.push({ itemId: null, qty: 1 }) }
      function removeLine(i) { form.lines.splice(i, 1) }

      async function submitCreate() {
        if (saving.value) return
        saving.value = true
        try {
          const doc = await MES.api.createDoc({ ...form, creatorId: MES.session.user.id })
          createDialog.value = false
          MES.msg(`单据 ${doc.no} 已保存为草稿`)
        } catch (e) { MES.err(e) } finally { saving.value = false }
      }

      /** 出库类单据的缺口：单据数量 − 当前结存 */
      function shortagesOf(doc) {
        if (['生产领料', '销售出库'].indexOf(doc.docType) < 0) return []
        return state.stockDocDetail
          .filter((l) => l.docId === doc.id)
          .map((l) => ({
            itemId: l.itemId,
            qty: +(l.qty - db.balanceOf(doc.warehouseId, l.itemId)).toFixed(3)
          }))
          .filter((l) => l.qty > 0)
      }

      async function confirmDoc(doc) {
        if (confirmingId.value) return
        try {
          await MES.confirm(`确认单据 ${doc.no} 后会立即增减库存余额，确定吗？`, '确认单据')
          confirmingId.value = doc.id
          await MES.api.confirmDoc(doc.id)
          MES.msg('单据已确认，库存已更新')
        } catch (e) {
          if (e === 'cancel') return
          const msg = String((e && e.message) || e)
          if (msg.indexOf('库存不足') < 0) { MES.err(e); return }
          /* 缺料不是死路：按缺口直接生成采购入库草稿，省得手填一堆明细 */
          const lack = shortagesOf(doc)
          if (!lack.length) { MES.err(e); return }
          try {
            await MES.confirm(`这张单还缺 ${lack.length} 种物料，是否按缺口生成采购入库草稿？`, '一键补料')
          } catch (x) { return }
          /* 同一张单的缺口只补一次，避免连点生成多张补料草稿 */
          const mark = '按单据 ' + doc.no + ' 的缺口'
          const dupFix = state.stockDoc.find((d) => d.docType === '采购入库' && d.status === '草稿' &&
            d.warehouseId === doc.warehouseId && String(d.remark || '').indexOf(mark) >= 0)
          if (dupFix) {
            MES.msg(`已经生成过补料草稿 ${dupFix.no}，请先确认或删除它`, 'warning')
            return
          }
          try {
            const fix = await MES.api.createDoc({
              docType: '采购入库',
              warehouseId: doc.warehouseId,
              lines: lack,
              remark: '按单据 ' + doc.no + ' 的缺口自动生成',
              creatorId: MES.session.user.id
            })
            MES.msg(`已生成补料草稿 ${fix.no}，确认它以后再回来确认 ${doc.no}`)
          } catch (e2) { MES.err(e2) }
        } finally { confirmingId.value = null }
      }

      async function removeDoc(doc) {
        try {
          await MES.confirm(`确认删除草稿单据 ${doc.no} 吗？`)
          await MES.api.deleteDoc(doc.id)
          MES.msg('已删除')
        } catch (e) { if (e !== 'cancel') MES.err(e) }
      }

      function openDetail(doc) { current.value = doc; drawer.value = true }

      const needOrder = computed(() => ['生产领料', '生产退料', '成品入库'].indexOf(form.docType) >= 0)

      /** 预览：确认后库存是否充足 */
      function stockHint(line) {
        if (!line.itemId || !form.warehouseId) return ''
        const b = db.balanceOf(form.warehouseId, line.itemId)
        return `当前库存 ${b}`
      }

      return {
        rows, typeFilter, statusFilter, drawer, current, lines, createDialog, form,
        itemOptions, orderOptions, openCreate, addLine, removeLine, submitCreate,
        confirmDoc, removeDoc, openDetail, needOrder, stockHint, saving, confirmingId,
        moneyDocType, amountOfDoc,
        partnerTypeOf, partnerOptions, DOC_TYPES, IN_TYPES,
        state, nameOf: db.nameOf, itemLabel: db.itemLabel,
        orderLabel: (id) => {
          const o = id ? db.byId('workOrder', id) : null
          return o ? o.no + (o.name ? ' · ' + o.name : '') : ''
        },
        totalOf: (doc) => state.stockDocDetail.filter((l) => l.docId === doc.id).length,
        briefOf: (doc) => state.stockDocDetail.filter((l) => l.docId === doc.id)
          .map((l) => `${db.nameOf('item', l.itemId, 'code')}×${l.qty}`).join('，')
      }
    },
    template: `
      <div>
        <page-head title="库存单据" desc="采购、领料、退料、成品出入库共用一套单据，通过业务类型区分">
          <el-button type="primary" :icon="'Plus'" @click="openCreate">新建单据</el-button>
        </page-head>

        <div class="panel">
          <div class="toolbar">
            <el-select v-model="typeFilter" clearable placeholder="业务类型" style="width:150px">
              <el-option v-for="t in DOC_TYPES" :key="t" :label="t" :value="t"></el-option>
            </el-select>
            <el-select v-model="statusFilter" clearable placeholder="单据状态" style="width:140px">
              <el-option label="草稿" value="草稿"></el-option>
              <el-option label="已确认" value="已确认"></el-option>
            </el-select>
            <div class="spacer"></div>
            <span class="muted">共 {{ rows.length }} 张单据</span>
          </div>

          <el-table :data="rows" border stripe>
            <el-table-column prop="no" label="单据编号" width="180">
              <template #default="{ row }">
                <el-link type="primary" @click="openDetail(row)">{{ row.no }}</el-link>
              </template>
            </el-table-column>
            <el-table-column label="业务类型" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="MES.docTagType(row.docType)" effect="light">{{ row.docType }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="仓库" width="140">
              <template #default="{ row }">{{ nameOf('warehouse', row.warehouseId) }}</template>
            </el-table-column>
            <el-table-column label="往来单位" width="210" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.partnerName || row.partnerId">{{ row.partnerName || nameOf('partner', row.partnerId) }}</span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="关联工单" width="270" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.orderId">{{ orderLabel(row.orderId) }}</span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="明细" min-width="240">
              <template #default="{ row }">{{ briefOf(row) || '—' }}</template>
            </el-table-column>
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }">{{ amountOfDoc(row) > 0 ? MES.money(amountOfDoc(row)) : '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><status-tag :value="row.status"></status-tag></template>
            </el-table-column>
            <el-table-column prop="createTime" label="创建时间" width="180"></el-table-column>
            <el-table-column label="操作" width="190" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row)">明细</el-button>
                <el-button v-if="row.status === '草稿'" link type="success" :loading="confirmingId === row.id" @click="confirmDoc(row)">确认</el-button>
                <el-button v-if="row.status === '草稿'" link type="danger" @click="removeDoc(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-drawer v-model="drawer" :title="current ? '单据明细 · ' + current.no : ''" size="52%">
          <div v-if="current">
            <el-descriptions :column="2" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="单据编号">{{ current.no }}</el-descriptions-item>
              <el-descriptions-item label="业务类型">{{ current.docType }}</el-descriptions-item>
              <el-descriptions-item label="仓库">{{ nameOf('warehouse', current.warehouseId) }}</el-descriptions-item>
            <el-descriptions-item label="往来单位">{{ current.partnerName || (current.partnerId ? nameOf('partner', current.partnerId) : '—') }}</el-descriptions-item>
              <el-descriptions-item label="关联工单">{{ current.orderId ? orderLabel(current.orderId) : '—' }}</el-descriptions-item>
              <el-descriptions-item label="状态"><status-tag :value="current.status"></status-tag></el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ current.createTime }}</el-descriptions-item>
              <el-descriptions-item label="确认时间">{{ current.confirmTime || '—' }}</el-descriptions-item>
              <el-descriptions-item label="总金额">{{ amountOfDoc(current) > 0 ? MES.money(amountOfDoc(current)) : '—' }}</el-descriptions-item>
              <el-descriptions-item label="备注">{{ current.remark || '—' }}</el-descriptions-item>
            </el-descriptions>
            <el-table :data="lines" border stripe>
              <el-table-column type="index" label="#" width="56" align="center"></el-table-column>
              <el-table-column label="物料编号" width="130">
                <template #default="{ row }">{{ nameOf('item', row.itemId, 'code') }}</template>
              </el-table-column>
              <el-table-column label="物料名称" min-width="180">
                <template #default="{ row }">{{ nameOf('item', row.itemId) }}</template>
              </el-table-column>
              <el-table-column prop="qty" label="数量" width="100" align="right"></el-table-column>
              <el-table-column label="方向" width="90" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="IN_TYPES.includes(current.docType) ? 'success' : 'danger'" effect="plain">
                    {{ IN_TYPES.includes(current.docType) ? '入库' : '出库' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="current.status === '草稿'" style="margin-top:16px">
              <el-button type="success" :loading="confirmingId === current.id" @click="confirmDoc(current)">确认单据（更新库存）</el-button>
            </div>
          </div>
        </el-drawer>

        <el-dialog v-model="createDialog" title="新建库存单据" width="680px">
          <el-form label-width="100px">
            <el-form-item label="业务类型" required>
              <el-radio-group v-model="form.docType">
                <el-radio-button v-for="t in DOC_TYPES" :key="t" :label="t"></el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="仓库" required>
              <el-select v-model="form.warehouseId" style="width:100%">
                <el-option v-for="w in state.warehouse" :key="w.id" :label="w.code + ' ' + w.name + '（' + w.type + '）'" :value="w.id"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item v-if="needOrder" label="关联工单" required>
              <el-select v-model="form.orderId" filterable style="width:100%">
                <el-option v-for="o in orderOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item v-if="partnerTypeOf" :label="partnerTypeOf">
              <el-select v-model="form.partnerId" filterable clearable style="width:100%"
                         :placeholder="'选择' + partnerTypeOf">
                <el-option v-for="p in partnerOptions" :key="p.value" :label="p.label" :value="p.value"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="明细" required>
              <div style="width:100%">
                <div v-for="(l, i) in form.lines" :key="i" style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                  <el-select v-model="l.itemId" filterable placeholder="选择物料" style="flex:1">
                    <el-option v-for="o in itemOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
                  </el-select>
                  <el-input-number v-model="l.qty" :min="0.01" style="width:140px"></el-input-number>
                  <span class="muted" style="width:110px;font-size:12px">{{ stockHint(l) }}</span>
                  <el-button link type="danger" @click="removeLine(i)" :disabled="form.lines.length === 1">删除</el-button>
                </div>
                <el-button size="small" @click="addLine">+ 添加一行</el-button>
              </div>
            </el-form-item>
            <el-form-item v-if="moneyDocType" label="总金额">
              <el-input-number v-model="form.amount" :min="0" :precision="2" :controls="false"
                               placeholder="选填，不含税" style="width:220px"></el-input-number>
              <span class="muted" style="margin-left:10px;font-size:12px">只采购入库、销售出库填写</span>
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" :rows="2"></el-input>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="createDialog = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="submitCreate">保存为草稿</el-button>
          </template>
        </el-dialog>
      </div>`
  }

  // 库存余额
  const StockPage = {
    name: 'StockPage',
    components: { PageHead },
    setup() {
      const whFilter = ref('')
      const kw = ref('')

      /* 库存不设初值：每行都是"入库合计(+) − 出库合计(−)"的汇总结果 */
      const rows = computed(() => {
        const k = kw.value.trim().toLowerCase()
        return MES.api.stockRows()
          .filter((r) => !whFilter.value || r.warehouseId === whFilter.value)
          .filter((r) => {
            if (!k) return true
            return (r.itemCode + r.itemName).toLowerCase().indexOf(k) >= 0
          })
          .sort((a, b) => (b.warn ? 1 : 0) - (a.warn ? 1 : 0) || a.warehouseId - b.warehouseId)
      })

      const warnCount = computed(() => rows.value.filter((r) => r.warn).length)

      /* 合计行：全仓库入库总量、出库总量、结存总量 */
      const totals = computed(() =>
        rows.value.reduce((s, r) => {
          s.inQty += r.inQty; s.outQty += r.outQty; s.qty += r.qty
          return s
        }, { inQty: 0, outQty: 0, qty: 0 }))

      return { rows, whFilter, kw, warnCount, totals, state, nameOf: db.nameOf }
    },
    template: `
      <div>
        <page-head title="库存余额" desc="库存只由已确认的出入库单据累积：显示每项物料累计入库(+)、累计出库(−)与当前结存，不允许手工设初值"></page-head>
        <div class="panel">
          <div class="toolbar">
            <el-select v-model="whFilter" clearable placeholder="全部仓库" style="width:200px">
              <el-option v-for="w in state.warehouse" :key="w.id" :label="w.code + ' ' + w.name" :value="w.id"></el-option>
            </el-select>
            <el-input v-model="kw" placeholder="按物料搜索" clearable style="width:240px" :prefix-icon="'Search'"></el-input>
            <div class="spacer"></div>
            <el-tag v-if="warnCount" type="danger" effect="light">低于安全库存 {{ warnCount }} 项</el-tag>
            <span class="muted">共 {{ rows.length }} 条余额</span>
          </div>
          <el-table :data="rows" border stripe :row-class-name="({ row }) => row.warn ? 'warn-row' : ''">
            <el-table-column label="仓库" width="150">
              <template #default="{ row }">{{ nameOf('warehouse', row.warehouseId) }}</template>
            </el-table-column>
            <el-table-column label="物料编号" width="130">
              <template #default="{ row }">{{ row.itemCode }}</template>
            </el-table-column>
            <el-table-column label="物料名称" min-width="200">
              <template #default="{ row }">{{ row.itemName }}</template>
            </el-table-column>
            <el-table-column label="类别" width="100">
              <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.category }}</el-tag></template>
            </el-table-column>
            <el-table-column label="单位" width="80">
              <template #default="{ row }">{{ row.unitName }}</template>
            </el-table-column>
            <el-table-column label="累计入库 (+)" width="130" align="right">
              <template #default="{ row }"><span style="color:#12b76a">+{{ MES.num(row.inQty) }}</span></template>
            </el-table-column>
            <el-table-column label="累计出库 (−)" width="130" align="right">
              <template #default="{ row }"><span style="color:#f04438">−{{ MES.num(row.outQty) }}</span></template>
            </el-table-column>
            <el-table-column prop="qty" label="当前结存" width="120" align="right">
              <template #default="{ row }">
                <b :style="{ color: row.warn ? '#f04438' : '#1f2733' }">{{ MES.num(row.qty) }}</b>
              </template>
            </el-table-column>
            <el-table-column label="安全库存" width="110" align="right">
              <template #default="{ row }">{{ row.safetyStock ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="库存状态" width="120" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.warn ? 'danger' : 'success'" effect="light">
                  {{ row.warn ? '需补货' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="流水" width="90" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="$router.push('/wms/flow')">明细</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="muted" style="margin-top:10px">
            合计：入库 +{{ MES.num(totals.inQty) }} ｜ 出库 −{{ MES.num(totals.outQty) }} ｜ 结存 {{ MES.num(totals.qty) }}
            （结存 = 入库 − 出库，全部来自已确认单据）
          </div>
        </div>
      </div>`
  }

  // 出入库流水
  const FlowPage = {
    name: 'FlowPage',
    components: { PageHead },
    setup() {
      const whFilter = ref('')
      const typeFilter = ref('')
      const kw = ref('')
      const rows = computed(() => {
        let list = state.stockFlow
          .filter((f) => !whFilter.value || f.warehouseId === whFilter.value)
          .filter((f) => !typeFilter.value || f.docType === typeFilter.value)
          .slice().sort((a, b) => b.id - a.id)
        const k = kw.value.trim().toLowerCase()
        if (k) {
          list = list.filter((f) => {
            const text = (f.docType || '') + ' ' +
              (db.nameOf('item', f.itemId, 'code') || '') + ' ' + (db.nameOf('item', f.itemId) || '') + ' ' +
              (db.nameOf('stockDoc', f.docId, 'no') || '')
            return text.toLowerCase().indexOf(k) >= 0
          })
        }
        return list
      })
      return {
        rows, whFilter, typeFilter, kw, state, DOC_TYPES, nameOf: db.nameOf,
        docNoOf: (id) => db.nameOf('stockDoc', id, 'no')
      }
    },
    template: `
      <div>
        <page-head title="出入库流水" desc="每次单据确认都会写入一条流水，可追溯库存变化原因"></page-head>
        <div class="panel">
          <div class="toolbar">
            <el-select v-model="whFilter" clearable placeholder="全部仓库" style="width:200px">
              <el-option v-for="w in state.warehouse" :key="w.id" :label="w.code + ' ' + w.name" :value="w.id"></el-option>
            </el-select>
            <el-select v-model="typeFilter" clearable placeholder="全部业务类型" style="width:170px">
              <el-option v-for="t in DOC_TYPES" :key="t" :label="t" :value="t"></el-option>
            </el-select>
            <el-input v-model="kw" clearable placeholder="按单据号 / 物料搜索" style="width:230px"
                      :prefix-icon="'Search'"></el-input>
            <div class="spacer"></div>
            <span class="muted">共 {{ rows.length }} 条流水</span>
          </div>
          <el-table :data="rows" border stripe>
            <el-table-column prop="time" label="时间" width="180"></el-table-column>
            <el-table-column label="仓库" width="140">
              <template #default="{ row }">{{ nameOf('warehouse', row.warehouseId) }}</template>
            </el-table-column>
            <el-table-column label="物料" min-width="200">
              <template #default="{ row }">{{ nameOf('item', row.itemId, 'code') }} {{ nameOf('item', row.itemId) }}</template>
            </el-table-column>
            <el-table-column label="业务类型" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="MES.docTagType(row.docType)" effect="light">{{ row.docType }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="变动数量" width="120" align="right">
              <template #default="{ row }">
                <b :style="{ color: row.changeQty >= 0 ? '#12b76a' : '#f04438' }">
                  {{ row.changeQty >= 0 ? '+' : '' }}{{ row.changeQty }}
                </b>
              </template>
            </el-table-column>
            <el-table-column prop="balanceAfter" label="变动后余额" width="120" align="right"></el-table-column>
            <el-table-column label="来源单据" width="180">
              <template #default="{ row }">{{ row.docId ? docNoOf(row.docId) : '—' }}</template>
            </el-table-column>
          </el-table>
        </div>
      </div>`
  }

  Object.assign(MES.views, { DocListPage, StockPage, FlowPage })
})(window.MES)




