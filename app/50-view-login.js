/* 登录页 */
;(function (MES) {
  const { ref, onMounted } = Vue

  const demos = [
    { account: 'admin', label: '张明 · 系统管理员' },
    { account: 'planner', label: '李彦 · 计划员' },
    { account: 'op_assembly', label: '王强 · 操作员（总装）' },
    { account: 'warehouse', label: '陈静 · 仓管员' }
  ]

  const Login = {
    name: 'LoginView',
    setup() {
      const router = VueRouter.useRouter()
      const account = ref('planner')
      const password = ref('123456')
      const loading = ref(false)

      async function submit() {
        if (!account.value) {
          MES.msg('请输入账号', 'warning')
          return
        }
        loading.value = true
        try {
          // 密码由 MES.api.login 校验（本地版和接后端版都一样）
          const u = await MES.session.login(account.value, password.value)
          MES.msg(`欢迎回来，${u.name}`)
          router.push('/dashboard')
        } catch (e) {
          MES.err(e)
        } finally {
          loading.value = false
        }
      }

      function pick(a) {
        account.value = a
        password.value = '123456'
      }

      return { demos, account, password, loading, submit, pick }
    },
    template: `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-left">
            <span class="badge">工业互联网 · Lab5</span>
            <h1>生产订单与<br/>物流管理系统</h1>
            <p>围绕无人机生产工单，完成建单、派工、领料、报工和成品入库，<br/>并提供库存、生产进度与历史记录查询。</p>
            <ul>
              <li>· 基础资料：工厂 / 车间 / 仓库 / 用户 / 设备 / 工位 / 工装</li>
              <li>· 工艺管理：物料清单 BOM、工艺路线</li>
              <li>· 生产管理：工单下达、派工、工序报工、在制品跟踪</li>
              <li>· 仓储管理：单据确认与实时库存余额</li>
            </ul>
            <div class="foot">Manufacturing Execution &amp;amp; Logistics System</div>
          </div>
          <div class="login-right">
            <h2>账号登录</h2>
            <div class="sub">请选择演示角色进入系统（初始密码均为 123456）</div>
            <el-form label-position="top" @submit.prevent="submit">
              <el-form-item label="账号">
                <el-input v-model="account" size="large" :prefix-icon="'User'" placeholder="请输入账号"></el-input>
              </el-form-item>
              <el-form-item label="密码">
                <el-input v-model="password" size="large" type="password" show-password
                          :prefix-icon="'Lock'" placeholder="请输入密码" @keyup.enter="submit"></el-input>
              </el-form-item>
              <el-button type="primary" size="large" style="width:100%;margin-top:6px"
                         :loading="loading" @click="submit">登 录</el-button>
            </el-form>
            <div class="account-chips" style="margin-top:22px">
              <span class="muted" style="font-size:12px;line-height:26px">快速选择：</span>
              <span class="account-chip" v-for="d in demos" :key="d.account" @click="pick(d.account)">{{ d.label }}</span>
            </div>
          </div>
        </div>
      </div>`
  }

  MES.views = MES.views || {}
  MES.views.Login = Login
})(window.MES)
