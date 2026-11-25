/* 通用 UI 组件 */
;(function (MES) {
  const { ref, computed, reactive, watch, h } = Vue

  // 页面标题
  const PageHead = {
    name: 'PageHead',
    props: { title: String, desc: String },
    template: `
      <div class="page-head">
        <h2>{{ title }}</h2>
        <p v-if="desc">{{ desc }}</p>
        <div style="flex:1"></div>
        <slot></slot>
      </div>`
  }

  // 状态标签
  const StatusTag = {
    name: 'StatusTag',
    props: { value: String, size: { type: String, default: 'small' } },
    setup(props) {
      return { type: computed(() => MES.tagType(props.value)) }
    },
    template: `<el-tag v-if="value" :type="type" :size="size" effect="light">{{ value }}</el-tag>
               <span v-else class="muted">-</span>`
  }

  // 通用单表 CRUD 页
  const CrudPage = {
    name: 'CrudPage',
    components: { PageHead, StatusTag },
    props: {
      cfg: { type: Object, required: true },
      rows: { type: Array, required: true }
    },
    setup(props) {
      const kw = ref('')
      const filterVal = ref('')
      const page = ref(1)
      const size = ref(10)
      const dialog = ref(false)
      const isNew = ref(true)
      const form = reactive({})
      const formRef = ref(null)

      const columns = computed(() => props.cfg.columns || [])
      const fields = computed(() => {
        const f = props.cfg.fields
        return typeof f === 'function' ? f() : f || []
      })

      // 选项允许写成 ['供应商', '客户'] 这类字符串，统一转成 { label, value }
      const norm = (list) => (list || []).map((o) => (typeof o === 'string' ? { label: o, value: o } : o))

      function optionsOf(field) {
        const o = typeof field.options === 'function' ? field.options() : field.options
        return norm(o)
      }

      const filterOptions = computed(() => {
        const f = props.cfg.filter
        if (!f) return []
        return norm(typeof f.options === 'function' ? f.options() : f.options)
      })

      const filtered = computed(() => {
        let list = props.rows || []
        const k = kw.value.trim().toLowerCase()
        if (k) {
          const keys = props.cfg.searchKeys || ['name']
          list = list.filter((r) =>
            keys.some((key) => String(r[key] === undefined ? '' : r[key]).toLowerCase().indexOf(k) >= 0))
        }
        if (props.cfg.filter && filterVal.value !== '' && filterVal.value !== null && filterVal.value !== undefined) {
          list = list.filter((r) => r[props.cfg.filter.prop] === filterVal.value)
        }
        return list
      })

      const paged = computed(() => {
        if (props.cfg.noPage) return filtered.value
        const start = (page.value - 1) * size.value
        return filtered.value.slice(start, start + size.value)
      })

      watch(filtered, () => { page.value = 1 })

      function text(col, row) {
        if (col.display) {
          const v = col.display(row)
          return v === undefined || v === '' ? '-' : v
        }
        const v = row[col.prop]
        if (v === undefined || v === null || v === '') return '-'
        if (col.type === 'num') return MES.num(v)
        return v
      }

      function tagOf(col, row) {
        const v = row[col.prop]
        if (col.tagType) return col.tagType(row)
        if (col.tagMap) return col.tagMap[v] || 'info'
        return MES.tagType(v)
      }

      function openCreate() {
        isNew.value = true
        Object.keys(form).forEach((k) => delete form[k])
        fields.value.forEach((f) => {
          form[f.prop] = f.default !== undefined
            ? (typeof f.default === 'function' ? f.default() : f.default)
            : (f.type === 'number' ? 0 : '')
        })
        dialog.value = true
      }

      function openEdit(row) {
        isNew.value = false
        Object.keys(form).forEach((k) => delete form[k])
        fields.value.forEach((f) => { form[f.prop] = row[f.prop] })
        form.__id = row.id
        dialog.value = true
      }

      async function submit() {
        try {
          if (formRef.value) {
            await formRef.value.validate()
          }
        } catch (e) {
          return
        }
        const data = {}
        fields.value.forEach((f) => {
          if (form[f.prop] !== undefined) data[f.prop] = form[f.prop]
        })
        try {
          if (props.cfg.beforeSave) {
            const r = props.cfg.beforeSave(data, isNew.value, form.__id)
            if (r === false) return
          }
          if (isNew.value) {
            await MES.api.createRow(props.cfg.table, data)
            MES.msg('新增成功')
          } else {
            await MES.api.updateRow(props.cfg.table, form.__id, data)
            MES.msg('修改成功')
          }
          dialog.value = false
          if (props.cfg.afterSave) props.cfg.afterSave()
        } catch (e) {
          MES.err(e)
        }
      }

      async function remove(row) {
        try {
          await MES.confirm('确认删除该条记录吗？删除后不可恢复。')
          await MES.api.removeRow(props.cfg.table, row.id, props.cfg.guard)
          MES.msg('已删除')
        } catch (e) {
          if (e !== 'cancel') MES.err(e)
        }
      }

      return {
        kw, filterVal, page, size, dialog, isNew, form, formRef,
        columns, fields, optionsOf, filterOptions, filtered, paged, text, tagOf,
        openCreate, openEdit, submit, remove
      }
    },
    template: `
      <div>
        <page-head v-if="cfg.title" :title="cfg.title" :desc="cfg.desc">
          <slot name="head-extra"></slot>
          <el-button v-if="!cfg.readonly" type="primary" :icon="'Plus'" @click="openCreate">新增</el-button>        </page-head>

        <div class="panel">
          <div v-if="cfg.showToolbar !== false" class="toolbar">
            <el-input v-model="kw" :placeholder="cfg.searchPlaceholder || '按编号或名称搜索'" clearable
                      style="width: 260px" :prefix-icon="'Search'"></el-input>
            <el-select v-if="cfg.filter" v-model="filterVal" clearable :placeholder="cfg.filter.label"
                       style="width: 170px">
              <el-option v-for="o in filterOptions" :key="o.value" :label="o.label" :value="o.value"></el-option>
            </el-select>
            <slot name="toolbar"></slot>
            <div class="spacer"></div>
            <span class="muted">共 {{ filtered.length }} 条</span>
          </div>

          <el-table :data="paged" size="default" stripe border :row-class-name="cfg.rowClass">
            <el-table-column type="index" label="#" width="56" align="center" :index="(i) => (page - 1) * size + i + 1"></el-table-column>
            <el-table-column v-for="c in columns" :key="c.prop"
                             :label="c.label" :prop="c.prop" :width="c.width" :min-width="c.minWidth || 110"
                             :align="c.align || 'left'" :fixed="c.fixed">
              <template #default="scope">
                <slot v-if="c.slot" :name="c.slot" :row="scope.row"></slot>
                <template v-else-if="c.type === 'tag'">
                  <el-tag :type="tagOf(c, scope.row)" size="small" effect="light">{{ text(c, scope.row) }}</el-tag>
                </template>
                <template v-else-if="c.type === 'progress'">
                  <div style="display:flex;align-items:center;gap:8px">
                    <el-progress :percentage="Number(scope.row[c.prop]) || 0" :stroke-width="8"
                                 :color="c.color || '#2b6cf6'" style="flex:1"></el-progress>
                  </div>
                </template>
                <span v-else :class="{ num: c.type === 'num' }">{{ text(c, scope.row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" :width="cfg.actionsWidth || 160" fixed="right" align="center">
              <template #default="scope">
                <slot name="actions" :row="scope.row">
                  <el-button v-if="!cfg.readonly" link type="primary" @click="openEdit(scope.row)">编辑</el-button>
                  <el-button v-if="!cfg.readonly" link type="danger" @click="remove(scope.row)">删除</el-button>
                </slot>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="!cfg.noPage" style="display:flex;justify-content:flex-end;margin-top:14px">
            <el-pagination background layout="total, sizes, prev, pager, next" :total="filtered.length"
                           v-model:current-page="page" v-model:page-size="size"
                           :page-sizes="[10, 20, 50]"></el-pagination>
          </div>
        </div>

        <el-dialog v-model="dialog" :title="(isNew ? '新增' : '编辑') + (cfg.title || '')" width="560px" destroy-on-close>
          <el-form ref="formRef" :model="form" label-width="110px">
            <el-form-item v-for="f in fields" :key="f.prop" :label="f.label"
                          :rules="f.required ? [{ required: true, message: '请填写' + f.label, trigger: 'blur' }] : []">
              <el-input v-if="!f.type || f.type === 'input'" v-model="form[f.prop]" clearable
                        :placeholder="f.placeholder || '请输入' + f.label"></el-input>
              <el-input v-else-if="f.type === 'textarea'" type="textarea" :rows="2" v-model="form[f.prop]"></el-input>
              <el-input-number v-else-if="f.type === 'number'" v-model="form[f.prop]" :min="f.min ?? 0"
                               :step="f.step || 1" :precision="f.precision" style="width:100%"></el-input-number>
              <el-select v-else-if="f.type === 'select'" v-model="form[f.prop]" clearable style="width:100%">
                <el-option v-for="o in optionsOf(f)" :key="o.value" :label="o.label" :value="o.value"></el-option>
              </el-select>
              <el-date-picker v-else-if="f.type === 'date'" v-model="form[f.prop]" type="date"
                              value-format="YYYY-MM-DD" style="width:100%"></el-date-picker>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="dialog = false">取消</el-button>
            <el-button type="primary" @click="submit">保存</el-button>
          </template>
        </el-dialog>
      </div>`
  }

  MES.ui = { PageHead, StatusTag, CrudPage }
})(window.MES)
