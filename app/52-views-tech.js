/* 工艺管理：物料清单 BOM、工艺路线 */
;(function (MES) {
  const { ref, computed, reactive } = Vue
  const db = MES.db
  const state = db.state
  const PageHead = MES.ui.PageHead

  // 物料清单 BOM
  const BomPage = {
    name: 'BomPage',
    components: { PageHead },
    setup() {
      const kw = ref('')
      const drawer = ref(false)
      const current = ref(null)
      const editing = ref(null)
      const editForm = reactive({ bomId: null, itemId: '', qtyPerUnit: 1 })

      const list = computed(() => {
        const k = kw.value.trim().toLowerCase()
        return state.bom.filter((b) => {
          if (!k) return true
          const p = db.byId('item', b.itemId)
          return (b.no + ' ' + (p ? p.code + p.name : '')).toLowerCase().indexOf(k) >= 0
        })
      })

      const details = computed(() => {
        if (!current.value) return []
        return state.bomDetail.filter((d) => d.bomId === current.value.id)
      })

      function openDetail(row) {
        current.value = row
        drawer.value = true
      }

      const materialOptions = computed(() =>
        state.item.filter((i) => i.category !== '成品').map((i) => ({
          value: i.id, label: `${i.code} ${i.name}（${db.nameOf('unit', i.unitId)}）`
        })))

      const productOptions = computed(() =>
        state.item.filter((i) => i.category !== '原材料').map((i) => ({
          value: i.id, label: `${i.code} ${i.name}`
        })))

      async function addLine() {
        if (!editForm.itemId) { MES.msg('请选择物料', 'warning'); return }
        if (!editForm.qtyPerUnit || editForm.qtyPerUnit <= 0) { MES.msg('单件用量必须大于 0', 'warning'); return }
        if (details.value.some((d) => d.itemId === editForm.itemId && d.id !== editForm.id)) {
          MES.msg('该物料已在清单中，请直接修改用量', 'warning'); return
        }
        try {
          const payload = { bomId: current.value.id, itemId: editForm.itemId, qtyPerUnit: Number(editForm.qtyPerUnit) }
          if (editForm.id) await MES.api.updateRow('bomDetail', editForm.id, payload)
          else await MES.api.createRow('bomDetail', payload)
          resetForm()
          MES.msg('已保存')
        } catch (e) { MES.err(e) }
      }

      function editLine(row) {
        editing.value = row.id
        Object.assign(editForm, { id: row.id, bomId: row.bomId, itemId: row.itemId, qtyPerUnit: row.qtyPerUnit })
      }

      function resetForm() {
        editing.value = null
        Object.assign(editForm, { id: null, bomId: current.value ? current.value.id : null, itemId: '', qtyPerUnit: 1 })
      }

      async function removeLine(row) {
        try {
          await MES.confirm('确认删除该行清单明细吗？')
          await MES.api.removeRow('bomDetail', row.id)
          MES.msg('已删除')
        } catch (e) { if (e !== 'cancel') MES.err(e) }
      }

      /* 新建 BOM 主表 */
      const newBom = reactive({ no: '', itemId: '', routingId: null, version: 'V1.0', status: '启用', remark: '' })
      const createDialog = ref(false)

      const routingOptions = computed(() =>
        state.routing.filter((r) => r.status === '启用').map((r) => ({ value: r.id, label: `${r.no} ${r.name || ''}` })))

      function openCreate() {
        Object.assign(newBom, { no: '', itemId: '', routingId: null, version: 'V1.0', status: '启用', remark: '' })
        createDialog.value = true
      }

      async function submitCreate() {
        if (!newBom.no || !newBom.itemId) { MES.msg('请填写清单编号并选择产品', 'warning'); return }
        if (!newBom.routingId) { MES.msg('请选择该产品使用的工艺路线', 'warning'); return }
        try {
          const row = await MES.api.createRow('bom', { ...newBom })
          createDialog.value = false
          MES.msg('清单已创建，请继续维护明细')
          openDetail(row)
        } catch (e) { MES.err(e) }
      }

      async function removeBom(row) {
        try {
          await MES.confirm(`确认删除物料清单 ${row.no} 吗？`)
          await MES.api.removeRow('bom', row.id)
          state.bomDetail = state.bomDetail.filter((d) => d.bomId !== row.id)
          db.save()
          MES.msg('已删除')
        } catch (e) { if (e !== 'cancel') MES.err(e) }
      }

      const routingLabel = (bom) => {
        const r = state.routing.find((x) => x.id === bom.routingId)
        return r ? `${r.no}${r.name ? ' ' + r.name : ''}` : '未指定'
      }

      return {
        kw, list, drawer, current, details, materialOptions, productOptions,
        editForm, editing, addLine, editLine, resetForm, removeLine,
        newBom, createDialog, openCreate, submitCreate, removeBom, openDetail,
        routingOptions, routingLabel,
        itemLabel: db.itemLabel, nameOf: db.nameOf
      }
    },
    template: `
      <div>
        <page-head title="物料清单 BOM" desc="清单主表保存产品、并指定该产品的工艺路线；明细保存原材料与单件用量">
          <el-button type="primary" :icon="'Plus'" @click="openCreate">新建清单</el-button>
        </page-head>

        <div class="panel">
          <div class="toolbar">
            <el-input v-model="kw" placeholder="按清单编号或产品搜索" clearable style="width:260px"
                      :prefix-icon="'Search'"></el-input>
            <div class="spacer"></div>
            <span class="muted">共 {{ list.length }} 份清单</span>
          </div>
          <el-table :data="list" border stripe>
            <el-table-column type="index" label="#" width="56" align="center"></el-table-column>
            <el-table-column prop="no" label="清单编号" width="180"></el-table-column>
            <el-table-column label="产品" min-width="200">
              <template #default="{ row }">{{ itemLabel(row.itemId) }}</template>
            </el-table-column>
            <el-table-column label="工艺路线" min-width="200">
              <template #default="{ row }">
                <span :class="{ muted: !row.routingId }">{{ routingLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="version" label="版本" width="90"></el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small" effect="light">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="物料项数" width="110" align="right">
              <template #default="{ row }">{{ state.bomDetail.filter(d => d.bomId === row.id).length }}</template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="180"></el-table-column>
            <el-table-column label="操作" width="180" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row)">维护明细</el-button>
                <el-button link type="danger" @click="removeBom(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-drawer v-model="drawer" :title="current ? '物料清单明细 · ' + current.no : ''" size="62%">
          <div v-if="current">
            <el-descriptions :column="3" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="清单编号">{{ current.no }}</el-descriptions-item>
              <el-descriptions-item label="产品">{{ itemLabel(current.itemId) }}</el-descriptions-item>
              <el-descriptions-item label="版本">{{ current.version }}</el-descriptions-item>
              <el-descriptions-item label="工艺路线" :span="3">{{ routingLabel(current) }}</el-descriptions-item>
            </el-descriptions>

            <div class="panel" style="background:#fafcff">
              <div style="font-weight:600;margin-bottom:10px">新增 / 修改明细</div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                <el-select v-model="editForm.itemId" filterable placeholder="选择原材料" style="width:300px">
                  <el-option v-for="o in materialOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
                </el-select>
                <el-input-number v-model="editForm.qtyPerUnit" :min="0.01" :step="1" :precision="2"
                                 style="width:150px"></el-input-number>
                <span class="muted">单件用量</span>
                <el-button type="primary" @click="addLine">{{ editForm.id ? '保存修改' : '添加' }}</el-button>
                <el-button v-if="editForm.id" @click="resetForm">取消</el-button>
              </div>
            </div>

            <el-table :data="details" border stripe style="margin-top:14px">
              <el-table-column type="index" label="#" width="56" align="center"></el-table-column>
              <el-table-column label="物料编号" width="130">
                <template #default="{ row }">{{ nameOf('item', row.itemId, 'code') }}</template>
              </el-table-column>
              <el-table-column label="物料名称" min-width="180">
                <template #default="{ row }">{{ nameOf('item', row.itemId) }}</template>
              </el-table-column>
              <el-table-column label="单位" width="80">
                <template #default="{ row }">
                  {{ nameOf('unit', state.item.find(i => i.id === row.itemId)?.unitId) }}
                </template>
              </el-table-column>
              <el-table-column label="单件用量" width="120" align="right">
                <template #default="{ row }">{{ row.qtyPerUnit }}</template>
              </el-table-column>
              <el-table-column label="生产 10 台需求" width="140" align="right">
                <template #default="{ row }">{{ (row.qtyPerUnit * 10).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="150" align="center">
                <template #default="{ row }">
                  <el-button link type="primary" @click="editLine(row)">修改</el-button>
                  <el-button link type="danger" @click="removeLine(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-drawer>

        <el-dialog v-model="createDialog" title="新建物料清单" width="520px">
          <el-form label-width="100px">
            <el-form-item label="清单编号" required>
              <el-input v-model="newBom.no" placeholder="如 BOM-FG001-02"></el-input>
            </el-form-item>
            <el-form-item label="产品" required>
              <el-select v-model="newBom.itemId" filterable style="width:100%">
                <el-option v-for="o in productOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="工艺路线" required>
              <el-select v-model="newBom.routingId" filterable style="width:100%"
                         placeholder="选择该产品使用的工艺路线（工艺路线本身不绑定产品）">
                <el-option v-for="o in routingOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="版本"><el-input v-model="newBom.version"></el-input></el-form-item>
            <el-form-item label="状态">
              <el-select v-model="newBom.status" style="width:100%">
                <el-option label="启用" value="启用"></el-option>
                <el-option label="停用" value="停用"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="备注"><el-input v-model="newBom.remark" type="textarea"></el-input></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="createDialog = false">取消</el-button>
            <el-button type="primary" @click="submitCreate">确定</el-button>
          </template>
        </el-dialog>
      </div>`
  }

  // 工艺路线
  const RoutingPage = {
    name: 'RoutingPage',
    components: { PageHead },
    setup() {
      const drawer = ref(false)
      const current = ref(null)
      const editForm = reactive({ id: null, routingId: null, seq: 1, processName: '', equipmentType: '', workstationId: null, stdMinutes: 30 })

      const details = computed(() => {
        if (!current.value) return []
        return state.routingDetail.filter((d) => d.routingId === current.value.id).sort((a, b) => a.seq - b.seq)
      })

      /** 设备要求下拉项：设备管理里的名称 + 历史路线用过的值，去重；仍允许自定义输入 */
      const equipmentTypeOptions = computed(() => {
        const set = new Set(['无'])
        state.equipment.forEach((e) => { if (e.name) set.add(e.name) })
        state.routingDetail.forEach((d) => { if (d.equipmentType && d.equipmentType !== '无') set.add(d.equipmentType) })
        if (editForm.equipmentType) set.add(editForm.equipmentType)
        return [...set]
      })

      function openDetail(row) {
        current.value = row
        drawer.value = true
        resetForm()
      }

      function resetForm() {
        const nextSeq = (details.value.length ? Math.max(...details.value.map((d) => d.seq)) : 0) + 1
        Object.assign(editForm, {
          id: null, routingId: current.value ? current.value.id : null,
          seq: nextSeq, processName: '', equipmentType: '', workstationId: null, stdMinutes: 30
        })
      }

      function editLine(row) {
        Object.assign(editForm, { ...row })
      }

      async function saveLine() {
        if (!editForm.processName) { MES.msg('请填写工序名称', 'warning'); return }
        if (details.value.some((d) => d.seq === editForm.seq && d.id !== editForm.id)) {
          MES.msg('工序顺序不能重复', 'warning'); return
        }
        try {
          const payload = {
            routingId: current.value.id, seq: Number(editForm.seq), processName: editForm.processName,
            equipmentType: editForm.equipmentType, workstationId: editForm.workstationId || null,
            stdMinutes: Number(editForm.stdMinutes) || 0
          }
          if (editForm.id) await MES.api.updateRow('routingDetail', editForm.id, payload)
          else await MES.api.createRow('routingDetail', payload)
          resetForm()
          MES.msg('已保存')
        } catch (e) { MES.err(e) }
      }

      async function removeLine(row) {
        try {
          await MES.confirm('确认删除该工序吗？')
          await MES.api.removeRow('routingDetail', row.id)
          MES.msg('已删除')
        } catch (e) { if (e !== 'cancel') MES.err(e) }
      }

      const newRouting = reactive({ no: '', name: '', version: 'V1.0', status: '启用', remark: '' })
      const createDialog = ref(false)
      const editingRoutingId = ref(null)
      const savingRouting = ref(false)
      const deletingRoutingId = ref(null)

      function openCreate() {
        editingRoutingId.value = null
        Object.assign(newRouting, { no: '', name: '', version: 'V1.0', status: '启用', remark: '' })
        createDialog.value = true
      }

      function openEdit(row) {
        editingRoutingId.value = row.id
        Object.assign(newRouting, {
          no: row.no, name: row.name, version: row.version || '',
          status: row.status, remark: row.remark || ''
        })
        createDialog.value = true
      }

      async function submitCreate() {
        if (savingRouting.value) return
        const payload = { ...newRouting, no: newRouting.no.trim(), name: newRouting.name.trim() }
        if (!payload.no) { MES.msg('请填写路线编号', 'warning'); return }
        if (!payload.name) { MES.msg('请填写路线名称', 'warning'); return }
        const id = editingRoutingId.value
        if (state.routing.some((r) => r.no === payload.no && r.id !== id)) {
          MES.msg('路线编号已存在，请换一个编号', 'warning'); return
        }
        savingRouting.value = true
        try {
          const row = id !== null
            ? await MES.api.updateRow('routing', id, payload)
            : await MES.api.createRow('routing', payload)
          createDialog.value = false
          if (id !== null) {
            if (current.value && current.value.id === id) current.value = row
            MES.msg('工艺路线已更新')
          } else {
            MES.msg('工艺路线已创建，请维护工序')
            openDetail(row)
          }
        } catch (e) { MES.err(e) }
        finally { savingRouting.value = false }
      }

      async function removeRouting(row) {
        if (deletingRoutingId.value !== null) return
        const guard = (route) => {
          if (state.bom.some((b) => b.routingId === route.id)) {
            return '该工艺路线已被 BOM 引用，不能删除'
          }
          if (state.routingDetail.some((d) => d.routingId === route.id)) {
            return '请先在“维护工序”中删除该路线下的工序，再删除路线'
          }
          return ''
        }
        const reason = guard(row)
        if (reason) { MES.msg(reason, 'warning'); return }
        deletingRoutingId.value = row.id
        try {
          await MES.confirm(`确认删除工艺路线 ${row.no} ${row.name || ''} 吗？`)
          await MES.api.removeRow('routing', row.id, guard)
          if (current.value && current.value.id === row.id) {
            drawer.value = false
            current.value = null
            resetForm()
          }
          if (editingRoutingId.value === row.id) {
            createDialog.value = false
            editingRoutingId.value = null
          }
          MES.msg('工艺路线已删除')
        } catch (e) { if (e !== 'cancel' && e !== 'close') MES.err(e) }
        finally { deletingRoutingId.value = null }
      }

      /* 哪条路线被哪些产品的 BOM 使用（路线不绑定产品，关系由 BOM 决定） */
      const usedBy = (routingId) =>
        state.bom.filter((b) => b.routingId === routingId)
          .map((b) => db.itemLabel(b.itemId))
          .join('、')

      return {
        state, drawer, current, details, editForm, saveLine, editLine, removeLine, resetForm, openDetail,
        newRouting, createDialog, editingRoutingId, savingRouting, deletingRoutingId,
        openCreate, openEdit, submitCreate, removeRouting, usedBy, equipmentTypeOptions,
        totalMinutes: computed(() => details.value.reduce((s, d) => s + (d.stdMinutes || 0), 0))
      }
    },
    template: `
      <div>
        <page-head title="工艺路线" desc="路线只维护工序、顺序与设备要求，不绑定产品；由产品 BOM 指定使用哪条路线">
          <el-button type="primary" :icon="'Plus'" @click="openCreate">新建路线</el-button>
        </page-head>

        <div class="panel">
          <el-table :data="state.routing" border stripe>
            <el-table-column type="index" label="#" width="56" align="center"></el-table-column>
            <el-table-column prop="no" label="路线编号" width="160"></el-table-column>
            <el-table-column prop="name" label="路线名称" min-width="200"></el-table-column>
            <el-table-column label="使用该路线的产品" min-width="240">
              <template #default="{ row }">
                <span :class="{ muted: !usedBy(row.id) }">{{ usedBy(row.id) || '尚未被 BOM 引用' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="version" label="版本" width="90"></el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small" effect="light">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="工序数" width="100" align="right">
              <template #default="{ row }">{{ state.routingDetail.filter(d => d.routingId === row.id).length }}</template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="180"></el-table-column>
            <el-table-column label="操作" width="230" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                <el-button link type="primary" @click="openDetail(row)">维护工序</el-button>
                <el-button link type="danger" :loading="deletingRoutingId === row.id"
                           :disabled="deletingRoutingId !== null" @click="removeRouting(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-drawer v-model="drawer" :title="current ? '工艺路线 · ' + current.no : ''" size="62%">
          <div v-if="current">
            <el-descriptions :column="3" border size="small" style="margin-bottom:16px">
              <el-descriptions-item label="路线编号">{{ current.no }}</el-descriptions-item>
              <el-descriptions-item label="路线名称">{{ current.name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="标准总工时">{{ totalMinutes }} 分钟 / 台</el-descriptions-item>
              <el-descriptions-item label="被 BOM 引用" :span="3">{{ usedBy(current.id) || '尚未被任何 BOM 引用' }}</el-descriptions-item>
            </el-descriptions>

            <div class="panel" style="background:#fafcff">
              <div style="font-weight:600;margin-bottom:10px">新增 / 修改工序</div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                <span class="muted">顺序</span>
                <el-input-number v-model="editForm.seq" :min="1" style="width:100px"></el-input-number>
                <el-input v-model="editForm.processName" placeholder="工序名称" style="width:170px"></el-input>
                <el-select v-model="editForm.equipmentType" filterable allow-create default-first-option
                           clearable placeholder="设备要求" style="width:170px">
                  <el-option v-for="t in equipmentTypeOptions" :key="t" :label="t" :value="t"></el-option>
                </el-select>
                <el-select v-model="editForm.workstationId" placeholder="默认工位" clearable style="width:150px">
                  <el-option v-for="w in state.workstation" :key="w.id" :label="w.name" :value="w.id"></el-option>
                </el-select>
                <el-input-number v-model="editForm.stdMinutes" :min="0" style="width:130px"></el-input-number>
                <span class="muted">标准工时(分)</span>
                <el-button type="primary" @click="saveLine">{{ editForm.id ? '保存' : '添加' }}</el-button>
                <el-button v-if="editForm.id" @click="resetForm">取消</el-button>
              </div>
            </div>

            <el-table :data="details" border stripe style="margin-top:14px">
              <el-table-column prop="seq" label="顺序" width="70" align="center"></el-table-column>
              <el-table-column prop="processName" label="工序名称" min-width="150"></el-table-column>
              <el-table-column prop="equipmentType" label="设备要求" min-width="130"></el-table-column>
              <el-table-column label="默认工位" width="130">
                <template #default="{ row }">{{ row.workstationId ? nameOf('workstation', row.workstationId) : '-' }}</template>
              </el-table-column>
              <el-table-column prop="stdMinutes" label="标准工时(分)" width="130" align="right"></el-table-column>
              <el-table-column label="操作" width="150" align="center">
                <template #default="{ row }">
                  <el-button link type="primary" @click="editLine(row)">修改</el-button>
                  <el-button link type="danger" @click="removeLine(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-drawer>

        <el-dialog v-model="createDialog" :title="editingRoutingId !== null ? '编辑工艺路线' : '新建工艺路线'" width="520px"
                   :close-on-click-modal="!savingRouting" :close-on-press-escape="!savingRouting" :show-close="!savingRouting">
          <el-form label-width="100px" :disabled="savingRouting">
            <el-form-item label="路线编号" required>
              <el-input v-model="newRouting.no" placeholder="如 RT-X4-02"></el-input>
            </el-form-item>
            <el-form-item label="路线名称" required>
              <el-input v-model="newRouting.name" placeholder="如 四旋翼总装标准路线"></el-input>
            </el-form-item>
            <el-form-item label="版本"><el-input v-model="newRouting.version"></el-input></el-form-item>
            <el-form-item label="状态" required>
              <el-select v-model="newRouting.status" style="width:100%">
                <el-option label="启用" value="启用"></el-option>
                <el-option label="停用" value="停用"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="备注"><el-input v-model="newRouting.remark" type="textarea"></el-input></el-form-item>
          </el-form>
          <template #footer>
            <el-button :disabled="savingRouting" @click="createDialog = false">取消</el-button>
            <el-button type="primary" :loading="savingRouting" @click="submitCreate">{{ editingRoutingId !== null ? '保存' : '确定' }}</el-button>
          </template>
        </el-dialog>
      </div>`
  }

  Object.assign(MES.views, { BomPage, RoutingPage })
})(window.MES)
