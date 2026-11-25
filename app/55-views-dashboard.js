/* 生产总览 + 系统说明 */
;(function (MES) {
  const { ref, computed } = Vue
  const db = MES.db
  const state = db.state
  const PageHead = MES.ui.PageHead
  const StatusTag = MES.ui.StatusTag
  const router = () => MES.router

  const Dashboard = {
    name: 'DashboardView',
    components: { PageHead, StatusTag },
    setup() {
      const stats = computed(() => {
        const running = state.workOrder.filter((o) => o.status === '生产中').length
        const waiting = state.workOrder.filter((o) => o.status === '已下达').length
        const draft = state.workOrder.filter((o) => o.status === '草稿').length
        const finished = state.workOrder.filter((o) => o.status === '已完工').length
        const warn = state.stockBalance.filter((b) => {
          const it = db.byId('item', b.itemId)
          return it && it.safetyStock > 0 && b.qty < it.safetyStock
        })
        const pendingDocs = state.stockDoc.filter((d) => d.status === '草稿').length
        const output = state.orderTask
          .filter((t) => t.seq === 1)
          .reduce((s, t) => s + t.equipDoneQty, 0)
        return { running, waiting, draft, finished, warn, pendingDocs, output }
      })


      const warnRows = computed(() =>
        state.stockBalance.map((b) => ({ ...b, item: db.byId('item', b.itemId) }))
          .filter((b) => b.item && b.item.safetyStock > 0 && b.qty < b.item.safetyStock)
          .sort((a, b) => a.qty / a.item.safetyStock - b.qty / b.item.safetyStock)
          .slice(0, 6))

      const pendingRows = computed(() => {
        const list = []
        state.workOrder.filter((o) => o.status === '草稿').forEach((o) =>
          list.push({ type: '工单', text: `工单 ${o.no} 待审核下达`, path: '/prod/order/' + o.id, time: o.createTime }))
        state.stockDoc.filter((d) => d.status === '草稿').forEach((d) =>
          list.push({ type: '单据', text: `单据 ${d.no}（${d.docType}）待确认`, path: '/wms/doc', time: d.createTime }))
        return list.sort((a, b) => (a.time < b.time ? 1 : -1)).slice(0, 6)
      })

      const recentReports = computed(() =>
        state.workReport.slice().sort((a, b) => b.id - a.id).slice(0, 6).map((r) => ({
          ...r,
          orderNo: db.nameOf('workOrder', r.orderId, 'no'),
          process: (db.byId('orderTask', r.taskId) || {}).processName || '-'
        })))

      /* 近 7 天合格产出（按报工日期汇总） */
      const weekOutput = computed(() => {
        const days = []
        const today = new Date()
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today)
          d.setDate(d.getDate() - i)
          const key = MES.fmtDate(d)
          const qty = state.workReport
            .filter((r) => String(r.reportTime || '').slice(0, 10) === key)
            .reduce((s, r) => s + Number(r.qualQty || 0), 0)
          days.push({ key, label: key.slice(5), qty })
        }
        return days
      })
      const weekMax = computed(() => Math.max(1, ...weekOutput.value.map((d) => d.qty)))

      /* 工序在制分布：上道合格 − 本道已处理，按工序汇总（只算在制工单） */
      const processLoad = computed(() => {
        const map = new Map()
        state.workOrder
          .filter((o) => ['已下达', '生产中'].indexOf(o.status) >= 0)
          .forEach((o) => {
            const tasks = state.orderTask
              .filter((t) => t.orderId === o.id)
              .sort((a, b) => a.seq - b.seq)
            tasks.forEach((t, i) => {
              const prev = i === 0 ? Number(o.planQty) : Number(tasks[i - 1].equipDoneQty)
              const wip = Math.max(0, prev - Number(t.equipDoneQty) - Number(t.scrapQty))
              map.set(t.processName, (map.get(t.processName) || 0) + wip)
            })
          })
        return [...map.entries()]
          .map(([name, qty]) => ({ name, qty }))
          .filter((x) => x.qty > 0)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 6)
      })
      const processMax = computed(() => Math.max(1, ...processLoad.value.map((p) => p.qty)))

      return {
        stats, warnRows, pendingRows, recentReports,
        weekOutput, weekMax, processLoad, processMax,
        itemLabel: db.itemLabel, nameOf: db.nameOf,
        go: (p) => router().push(p),
        ic: (n) => MES.iconOf(n)
      }
    },
    template: `
      <div>
        <page-head title="生产总览" desc="无人机整机生产的关键指标与待处理事项"></page-head>

        <div class="stat-grid">
          <div class="stat-card blue">
            <div class="label">生产中工单</div>
            <div class="value">{{ stats.running }}<span class="unit">张</span></div>
            <div class="foot">另有 {{ stats.waiting }} 张已下达未开工</div>
            <div class="icon"><el-icon><component :is="ic('Operation')"></component></el-icon></div>
          </div>
          <div class="stat-card green">
            <div class="label">累计合格产出</div>
            <div class="value">{{ stats.output }}<span class="unit">台</span></div>
            <div class="foot">首道工序合格数合计</div>
            <div class="icon"><el-icon><component :is="ic('Finished')"></component></el-icon></div>
          </div>
          <div class="stat-card orange">
            <div class="label">待办事项</div>
            <div class="value">{{ stats.draft + stats.pendingDocs }}<span class="unit">项</span></div>
            <div class="foot">草稿工单 {{ stats.draft }} · 待确认单据 {{ stats.pendingDocs }}</div>
            <div class="icon"><el-icon><component :is="ic('Bell')"></component></el-icon></div>
          </div>
          <div class="stat-card red">
            <div class="label">库存预警</div>
            <div class="value">{{ stats.warn.length }}<span class="unit">项</span></div>
            <div class="foot">低于安全库存，需及时采购</div>
            <div class="icon"><el-icon><component :is="ic('Warning')"></component></el-icon></div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns: 1.15fr 1fr;gap:14px;margin-top:14px" class="dash-row">
          <div class="panel">
            <div class="panel-title">近 7 天合格产出</div>
            <div class="bar-chart">
              <div v-for="d in weekOutput" :key="d.key" class="bar-col">
                <div class="bar-val">{{ d.qty || '' }}</div>
                <div class="bar-area"><div class="bar" :style="{ height: (d.qty / weekMax * 100) + '%' }"></div></div>
                <div class="bar-date">{{ d.label }}</div>
              </div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-title">工序在制分布（在制工单）</div>
            <div v-for="p in processLoad" :key="p.name" class="hbar-row">
              <span class="hbar-name">{{ p.name }}</span>
              <div class="hbar-track"><div class="hbar-fill" :style="{ width: (p.qty / processMax * 100) + '%' }"></div></div>
              <span class="hbar-val">{{ p.qty }}</span>
            </div>
            <el-empty v-if="!processLoad.length" description="没有在制品" :image-size="56"></el-empty>
          </div>
        </div>

        <div style="display:grid;grid-template-columns: 1fr 1fr;gap:14px;margin-top:14px" class="dash-row">
          <div class="panel">
            <div class="panel-title">待办事项</div>
            <div v-for="(p, i) in pendingRows" :key="i" class="todo-item" @click="go(p.path)"
                 style="display:flex;align-items:center;gap:10px;padding:9px 8px;border-bottom:1px dashed #eef2f7;cursor:pointer">
              <el-tag size="small" :type="p.type === '工单' ? 'warning' : 'primary'" effect="light">{{ p.type }}</el-tag>
              <span style="flex:1">{{ p.text }}</span>
              <el-icon class="muted"><component :is="ic('ArrowRight')"></component></el-icon>
            </div>
            <el-empty v-if="!pendingRows.length" description="没有待处理事项" :image-size="70"></el-empty>
          </div>

          <div class="panel">
            <div class="panel-title">库存预警</div>
            <el-table :data="warnRows" size="small" border>
              <el-table-column label="物料" min-width="180">
                <template #default="{ row }">{{ row.item.code }} {{ row.item.name }}</template>
              </el-table-column>
              <el-table-column label="余额" width="80" align="right">
                <template #default="{ row }"><b style="color:#f04438">{{ row.qty }}</b></template>
              </el-table-column>
              <el-table-column label="安全库存" width="90" align="right">
                <template #default="{ row }">{{ row.item.safetyStock }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!warnRows.length" description="库存充足" :image-size="70"></el-empty>
          </div>
        </div>

        <div style="margin-top:14px">
          <div class="panel">
            <div class="panel-title">最近报工</div>
            <el-table :data="recentReports" size="small" border>
              <el-table-column prop="orderNo" label="工单" width="180"></el-table-column>
              <el-table-column prop="process" label="工序" min-width="140"></el-table-column>
              <el-table-column prop="qualQty" label="合格" width="90" align="right"></el-table-column>
              <el-table-column prop="scrapQty" label="报废" width="90" align="right"></el-table-column>
              <el-table-column label="时间" width="180">
                <template #default="{ row }">{{ row.reportTime.slice(5, 16) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>`
  }

  // 系统说明
  const AboutPage = {
    name: 'AboutPage',
    components: { PageHead },
    setup() {
      return { TABLES: MES.TABLES, state }
    },
    template: `
      <div>
        <page-head title="系统说明" desc="Lab5 生产订单与物流管理系统 · 前端演示版"></page-head>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="panel">
            <div class="panel-title">业务流程</div>
            <ol style="line-height:2;color:#4b5563;margin:0;padding-left:20px">
              <li>计划员创建工单（草稿状态）。</li>
              <li>审核下达时，把 BOM 的单件用量乘以计划数量，生成工单物料需求；
                  把工艺路线的工序复制成工单的工序任务。</li>
              <li>派工时在工序任务上补充设备、工位、工装、负责人和计划时间。</li>
              <li>操作员按工序报工，填写合格数与报废数，工序任务自动累计。</li>
              <li>仓储按单据办理采购入库、生产领料、生产退料、成品入库和销售出库，
                  确认单据后库存余额随之变化。</li>
            </ol>
          </div>

          <div class="panel">
            <div class="panel-title">关键规则</div>
            <ul style="line-height:2;color:#4b5563;margin:0;padding-left:20px">
              <li>草稿单据不改变库存，确认后才生效。</li>
              <li>出库时库存不足不允许确认。</li>
              <li>退料数量不能超过已领且未退的数量。</li>
              <li>成品入库不能超过最后一道工序的合格数量。</li>
              <li>同一张单据重复确认只生效一次。</li>
              <li>报工数量不超过上一道工序移交的合格数。</li>
            </ul>
          </div>

          <div class="panel">
            <div class="panel-title">数据表</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <el-tag v-for="t in TABLES" :key="t" size="small" effect="plain" style="font-family:Consolas,monospace">
                {{ t }} ({{ state[t].length }})
              </el-tag>
            </div>
          </div>

        </div>
      </div>`
  }

  Object.assign(MES.views, { Dashboard, AboutPage })
})(window.MES)

