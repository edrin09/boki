(function(vue, vueRouter, elementPlus, iconsVue, axios2, pinia) {
  "use strict";
  const TOKEN_KEY = "financial_token";
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }
  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
      this.name = "ApiError";
    }
  }
  const service = axios2.create({
    baseURL: "/api",
    timeout: 3e4
  });
  service.interceptors.request.use(
    (config) => {
      const token = getToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
  service.interceptors.response.use(
    ((response) => {
      const res = response.data;
      if (res === void 0 || res === null || typeof res.code === "undefined") {
        return response;
      }
      if (res.code !== 0) {
        elementPlus.ElMessage.error(res.message || "请求失败");
        return Promise.reject(new ApiError(res.message, response.status, res.code));
      }
      return res;
    }),
    (error) => {
      const status = error?.response?.status;
      const body = error?.response?.data;
      if (status === 423) {
        window.dispatchEvent(new Event("vault:locked"));
        return Promise.reject(new ApiError(body?.message || "数据已锁定，请先解锁", 423, body?.code));
      }
      if (status === 401) {
        clearToken();
        return Promise.reject(new ApiError(body?.message || "登录已过期，请重新登录", 401));
      }
      if (!status && /timeout/i.test(error?.message ?? "")) {
        const message2 = "请求超时，请稍后重试";
        elementPlus.ElMessage.error(message2);
        return Promise.reject(new ApiError(message2, 0));
      }
      const message = body?.message ?? (status ? `请求失败（HTTP ${status}）` : error?.message || "网络异常，请检查后端服务");
      elementPlus.ElMessage.error(message);
      return Promise.reject(new ApiError(message, status ?? 0, body?.code));
    }
  );
  async function get(url, params) {
    const res = await service.get(url, { params });
    return res.data;
  }
  async function post(url, data, config) {
    const res = await service.post(url, data, config);
    return res.data;
  }
  async function put(url, data, config) {
    const res = await service.put(url, data, config);
    return res.data;
  }
  async function del(url, config) {
    const res = await service.delete(url, config);
    return res.data;
  }
  const authApi = {
    login: (data) => post("/auth/login", data),
    profile: () => get("/auth/profile"),
    /** 可管理的公司列表 */
    companies: () => get("/auth/companies"),
    /** 切换公司：返回带新 companyId 的令牌 */
    switchCompany: (companyId) => post("/auth/switch-company", { companyId }),
    logout: () => post("/auth/logout"),
    changePassword: (data) => post("/auth/change-password", data)
  };
  const companyApi = {
    /** 内核建账入口：仅当系统还没有任何记账公司时可用（零插件也能建账套） */
    bootstrap: (data) => post("/companies/bootstrap", data),
    /** 我可管理的公司（multi-company 插件） */
    mine: () => get("/companies"),
    detail: (id) => get(`/companies/${id}`),
    create: (data) => post("/companies", data),
    update: (id, data) => put(`/companies/${id}`, data),
    /** 删除公司；force=true 时连同全部业务数据一并删除（不可恢复，需前端二次确认） */
    remove: (id, force = false) => del(`/companies/${id}${force ? "?force=true" : ""}`),
    addMembers: (id, userIds) => post(`/companies/${id}/members`, { userIds }),
    setMembers: (id, data) => put(`/companies/${id}/members`, data),
    removeMember: (id, userId) => del(`/companies/${id}/members/${encodeURIComponent(userId)}`)
  };
  const userApi = {
    list: (params) => get("/users", params),
    options: () => get("/users/options"),
    detail: (id) => get(`/users/${id}`),
    create: (data) => post("/users", data),
    update: (id, data) => put(`/users/${id}`, data),
    updateStatus: (id, status) => put(`/users/${id}/status`, { status }),
    assignRoles: (id, roleIds) => put(`/users/${id}/roles`, { roleIds }),
    resetPassword: (id, password) => post(`/users/${id}/reset-password`, { password }),
    remove: (id) => del(`/users/${id}`)
  };
  const roleApi = {
    list: () => get("/roles"),
    options: () => get("/roles/options"),
    detail: (id) => get(`/roles/${id}`),
    create: (data) => post("/roles", data),
    update: (id, data) => put(`/roles/${id}`, data),
    assignPermissions: (id, permissionIds) => put(`/roles/${id}/permissions`, { permissionIds }),
    remove: (id) => del(`/roles/${id}`)
  };
  const accountApi = {
    list: (params) => get("/accounts", params),
    tree: (params) => get("/accounts/tree", params),
    options: () => get("/accounts/options"),
    detail: (id) => get(`/accounts/${id}`),
    create: (data) => post("/accounts", data),
    update: (id, data) => put(`/accounts/${id}`, data),
    updateStatus: (id, status) => put(`/accounts/${id}/status`, { status }),
    remove: (id) => del(`/accounts/${id}`)
  };
  const partnerApi = {
    list: (params) => get("/partners", params),
    options: (type) => get("/partners/options", { type }),
    detail: (id) => get(`/partners/${id}`),
    create: (data) => post("/partners", data),
    batchCreate: (items) => post("/partners/batch", { items }),
    update: (id, data) => put(`/partners/${id}`, data),
    remove: (id) => del(`/partners/${id}`)
  };
  const bankApi = {
    list: (params) => get("/banks", params),
    options: (type) => get("/banks/options", { type }),
    detail: (id) => get(`/banks/${id}`),
    create: (data) => post("/banks", data),
    update: (id, data) => put(`/banks/${id}`, data),
    remove: (id) => del(`/banks/${id}`)
  };
  const departmentApi = {
    list: (params) => get("/departments", params),
    tree: (params) => get("/departments/tree", params),
    options: () => get("/departments/options"),
    create: (data) => post("/departments", data),
    update: (id, data) => put(`/departments/${id}`, data),
    remove: (id) => del(`/departments/${id}`)
  };
  const projectApi = {
    list: (params) => get("/projects", params),
    options: () => get("/projects/options"),
    ledger: () => get("/projects/ledger"),
    /** 导入合同 PDF，自动识别合同编号/金额/客户 */
    parseContract: (file) => {
      const form = new FormData();
      form.append("file", file);
      return post("/projects/parse-contract", form);
    },
    create: (data) => post("/projects", data),
    update: (id, data) => put(`/projects/${id}`, data),
    remove: (id) => del(`/projects/${id}`)
  };
  function ok(message = "操作成功") {
    elementPlus.ElMessage.success(message);
  }
  function emptyForm(initial) {
    return JSON.parse(JSON.stringify(initial));
  }
  const useBasicStore = pinia.defineStore("basic", {
    state: () => ({
      accounts: [],
      partners: [],
      banks: [],
      departments: [],
      projects: [],
      loaded: {
        accounts: false,
        partners: false,
        banks: false,
        departments: false,
        projects: false
      }
    }),
    getters: {
      /** 明细科目（可记账） */
      leafAccounts: (state) => state.accounts,
      /** 现金/银行科目 */
      cashAccounts: (state) => state.accounts.filter((a) => a.isCash || a.isBank),
      /** 损益类科目 */
      profitAccounts: (state) => state.accounts.filter((a) => a.category === "profit"),
      /** 资产类科目 */
      assetAccounts: (state) => state.accounts.filter((a) => a.category === "asset"),
      /** 负债类科目 */
      liabilityAccounts: (state) => state.accounts.filter((a) => a.category === "liability"),
      /** 权益类科目 */
      equityAccounts: (state) => state.accounts.filter((a) => a.category === "equity"),
      /** 现金类资金账户 */
      cashBanks: (state) => state.banks.filter((b) => b.type === "cash")
    },
    actions: {
      async loadAccounts(force = false) {
        if (this.loaded.accounts && !force) return;
        this.accounts = await accountApi.options();
        this.loaded.accounts = true;
      },
      async loadPartners(force = false) {
        if (this.loaded.partners && !force) return;
        this.partners = await partnerApi.options();
        this.loaded.partners = true;
      },
      async loadBanks(force = false) {
        if (this.loaded.banks && !force) return;
        this.banks = await bankApi.options();
        this.loaded.banks = true;
      },
      async loadDepartments(force = false) {
        if (this.loaded.departments && !force) return;
        this.departments = await departmentApi.options();
        this.loaded.departments = true;
      },
      async loadProjects(force = false) {
        if (this.loaded.projects && !force) return;
        this.projects = await projectApi.options();
        this.loaded.projects = true;
      },
      async loadAll() {
        await Promise.all([
          this.loadAccounts(),
          this.loadPartners(),
          this.loadBanks(),
          this.loadDepartments(),
          this.loadProjects()
        ]);
      },
      /** 档案变更后刷新指定类型 */
      async refresh(kind) {
        if (kind === "accounts") return this.loadAccounts(true);
        if (kind === "partners") return this.loadPartners(true);
        if (kind === "banks") return this.loadBanks(true);
        if (kind === "departments") return this.loadDepartments(true);
        return this.loadProjects(true);
      },
      /**
       * 清空全部档案缓存。
       *
       * 切换记账公司后必须调用：档案按公司隔离，
       * 沿用上一个公司的数据会导致下拉框串账。
       */
      reset() {
        this.accounts = [];
        this.partners = [];
        this.banks = [];
        this.departments = [];
        this.projects = [];
        this.loaded = {
          accounts: false,
          partners: false,
          banks: false,
          departments: false,
          projects: false
        };
      }
    }
  });
  const useUserStore = pinia.defineStore("user", {
    state: () => ({
      token: getToken() ?? "",
      profile: null,
      loading: false,
      switching: false
    }),
    getters: {
      isLoggedIn: (state) => !!state.token,
      isAdmin: (state) => state.profile?.roles?.includes("admin") ?? false,
      nickname: (state) => state.profile?.nickname ?? "",
      /** 当前记账公司ID */
      companyId: (state) => state.profile?.companyId ?? "",
      /** 当前记账公司 */
      currentCompany: (state) => state.profile?.company ?? null,
      /** 可管理的公司（用于切换器） */
      companies: (state) => state.profile?.companies ?? [],
      companyName: (state) => state.profile?.company?.name ?? "",
      /** 多公司时（可管理 1 家以上）才展示切换入口 */
      canSwitchCompany: (state) => (state.profile?.companies?.length ?? 0) > 1,
      /** 权限判断：admin 全通过 */
      hasPermission: (state) => (code) => {
        const perms = state.profile?.permissions ?? [];
        if (perms.length === 0) return false;
        const list = Array.isArray(code) ? code : [code];
        return list.some((c) => perms.includes(c));
      },
      /** 角色判断：admin 全通过 */
      hasRole: (state) => (codes) => {
        const roles = state.profile?.roles ?? [];
        if (roles.includes("admin")) return true;
        const list = Array.isArray(codes) ? codes : [codes];
        return list.some((c) => roles.includes(c));
      }
    },
    actions: {
      async login(username, password) {
        this.loading = true;
        try {
          const res = await authApi.login({ username, password });
          this.applyResult(res);
          return res;
        } finally {
          this.loading = false;
        }
      },
      /** 拉取当前用户信息（刷新页面后恢复状态） */
      async fetchProfile() {
        if (!this.token) return null;
        const res = await authApi.profile();
        this.profile = res;
        return res;
      },
      /**
       * 切换记账公司。
       *
       * 后端为隔离边界重新签发带 companyId 的令牌，
       * 因此切换后必须整体刷新，避免残留上一个公司的缓存数据。
       */
      async switchCompany(companyId) {
        if (!companyId || companyId === this.companyId) return null;
        this.switching = true;
        try {
          const res = await authApi.switchCompany(companyId);
          this.applyResult(res);
          return res;
        } finally {
          this.switching = false;
        }
      },
      /** 应用登录/切换公司的返回结果 */
      applyResult(res) {
        this.token = res.accessToken;
        setToken(res.accessToken);
        this.profile = {
          ...this.profile ?? {},
          ...res.user,
          companyId: res.company?.id ?? null,
          company: res.company,
          companies: res.companies ?? []
        };
      },
      async logout() {
        try {
          await authApi.logout();
        } catch {
        }
        this.reset();
      },
      reset() {
        this.token = "";
        this.profile = null;
        this.switching = false;
        clearToken();
      },
      async changePassword(oldPassword, newPassword) {
        await authApi.changePassword({ oldPassword, newPassword });
        this.reset();
      }
    }
  });
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-card" };
  const _hoisted_3 = { class: "page-toolbar" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const route = vueRouter.useRoute();
      const router = vueRouter.useRouter();
      const userStore = useUserStore();
      const basicStore = useBasicStore();
      const list = vue.ref([]);
      const loading = vue.ref(false);
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const memberVisible = vue.ref(false);
      const memberLoading = vue.ref(false);
      const memberSaving = vue.ref(false);
      const current = vue.ref(null);
      const memberRows = vue.ref([]);
      const allUsers = vue.ref([]);
      const selectedUserIds = vue.ref([]);
      const roles = vue.ref([]);
      const roleSelection = vue.reactive({});
      const emptyCompanyForm = {
        id: "",
        name: "",
        taxNo: "",
        taxpayerType: "",
        vatRate: 3,
        taxDeclareCycle: "month",
        legalPerson: "",
        industry: "",
        address: "",
        bankName: "",
        bankAccount: "",
        fiscalStartMonth: 1,
        remark: "",
        copyAccountsFromCurrent: true
      };
      const form = vue.reactive(emptyForm(emptyCompanyForm));
      function onTaxpayerTypeChange(val) {
        if (val === "general") form.vatRate = 0;
        else if (!form.vatRate) form.vatRate = 3;
      }
      const rules = {
        name: [
          { required: true, message: "请输入公司名称", trigger: "blur" },
          { max: 100, message: "公司名称过长", trigger: "blur" }
        ],
        taxpayerType: [{ required: true, message: "请选择纳税人类型", trigger: "change" }],
        taxNo: [
          {
            // 新建必填：税号用于比对票面购销方、判定进项/销项方向，缺失则票据无法自动生成凭证
            validator: (_rule, value, callback) => {
              if (!form.id && !String(value ?? "").trim()) {
                callback(new Error("请输入纳税人识别号"));
              } else {
                callback();
              }
            },
            trigger: "blur"
          }
        ]
      };
      async function load() {
        loading.value = true;
        try {
          list.value = await companyApi.mine();
        } finally {
          loading.value = false;
        }
      }
      function onCreate() {
        Object.assign(form, emptyForm(emptyCompanyForm));
        form.copyAccountsFromCurrent = true;
        dialogVisible.value = true;
      }
      function onEdit(row) {
        Object.assign(form, emptyForm(emptyCompanyForm), {
          id: row.id,
          name: row.name,
          taxNo: row.taxNo ?? "",
          taxpayerType: row.taxpayerType ?? "small_scale",
          vatRate: row.vatRate ?? (row.taxpayerType === "general" ? 0 : 3),
          taxDeclareCycle: row.taxDeclareCycle ?? "month"
        });
        dialogVisible.value = true;
      }
      async function onSave() {
        await formRef.value?.validate();
        saving.value = true;
        try {
          const payload = {
            name: form.name,
            taxNo: form.taxNo || void 0,
            taxpayerType: form.taxpayerType,
            vatRate: form.vatRate ?? void 0,
            taxDeclareCycle: form.taxDeclareCycle,
            legalPerson: form.legalPerson || void 0,
            industry: form.industry || void 0,
            address: form.address || void 0,
            bankName: form.bankName || void 0,
            bankAccount: form.bankAccount || void 0,
            fiscalStartMonth: form.fiscalStartMonth,
            remark: form.remark || void 0
          };
          if (form.id) {
            await companyApi.update(form.id, payload);
          } else {
            await companyApi.create({ ...payload, copyAccountsFromCurrent: form.copyAccountsFromCurrent });
          }
          ok(form.id ? "公司信息已更新" : "公司已创建，标准会计科目已初始化");
          dialogVisible.value = false;
          await load();
          await userStore.fetchProfile();
        } finally {
          saving.value = false;
        }
      }
      async function onRemove(row) {
        try {
          await elementPlus.ElMessageBox.confirm(
            "确定删除记账公司「" + row.name + "」吗？仅当该公司没有任何业务数据时才能删除。",
            "提示",
            { type: "warning", confirmButtonText: "确定删除", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        let force = false;
        try {
          await companyApi.remove(row.id);
        } catch (err) {
          const msg = err?.message ?? "";
          if (!/已有账务数据|请先清理后再删除/.test(msg)) return;
          try {
            await elementPlus.ElMessageBox.confirm(
              "「" + row.name + "」已有账务数据（凭证/分录/票据等）。\n强制删除将连同该公司的全部业务数据一并清除，此操作不可恢复。确定继续吗？",
              "确认强制删除",
              {
                type: "error",
                confirmButtonText: "强制删除并清空数据",
                cancelButtonText: "取消",
                distinguishCancelAndClose: true
              }
            );
          } catch {
            return;
          }
          force = true;
        }
        await companyApi.remove(row.id, force);
        ok(force ? "公司及全部业务数据已删除（不可恢复）" : "公司已删除");
        await load();
      }
      async function onSwitch(row) {
        if (row.id === userStore.companyId) return;
        await userStore.switchCompany(row.id);
        basicStore.reset();
        window.location.href = "/";
      }
      function toggleUser(userId, checked) {
        const set = new Set(selectedUserIds.value);
        if (checked) set.add(userId);
        else set.delete(userId);
        selectedUserIds.value = Array.from(set);
      }
      async function loadUsers() {
        memberLoading.value = true;
        try {
          allUsers.value = await userApi.options();
          roles.value = await roleApi.options();
        } finally {
          memberLoading.value = false;
        }
      }
      async function onMembers(row) {
        current.value = row;
        selectedUserIds.value = [];
        memberVisible.value = true;
        memberLoading.value = true;
        try {
          const detail = await companyApi.detail(row.id);
          memberRows.value = detail.members ?? [];
          selectedUserIds.value = memberRows.value.map((m) => m.userId);
          for (const m of memberRows.value) {
            roleSelection[m.userId] = [...m.roleIds ?? []];
          }
          await loadUsers();
        } finally {
          memberLoading.value = false;
        }
      }
      async function onSaveMembers() {
        if (!current.value) return;
        memberSaving.value = true;
        try {
          for (const member of memberRows.value) {
            const next = [...roleSelection[member.userId] ?? []].sort();
            const prev = [...member.roleIds ?? []].sort();
            if (next.length === prev.length && next.every((v, i) => v === prev[i])) continue;
            if (next.length === 0) {
              elementPlus.ElMessage.warning(`「${member.nickname}」不能清空角色，请先在用户管理中分配`);
              continue;
            }
            await userApi.assignRoles(member.userId, next);
          }
          await companyApi.setMembers(current.value.id, { userIds: selectedUserIds.value });
          ok("成员授权已保存");
          memberVisible.value = false;
          await load();
        } finally {
          memberSaving.value = false;
        }
      }
      vue.onMounted(load);
      vue.watch(
        () => route.query.create,
        (v) => {
          if (v === "1") {
            onCreate();
            router.replace({ path: route.path });
          }
        },
        { immediate: true }
      );
      return (_ctx, _cache) => {
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_checkbox = vue.resolveComponent("el-checkbox");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createVNode(_component_el_alert, {
            type: "info",
            closable: false,
            "show-icon": "",
            class: "mb12"
          }, {
            title: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
              vue.createTextVNode(" 一个账号可以管理多家记账公司，各公司的凭证、账簿、报表与基础资料", -1),
              vue.createElementVNode("b", null, "完全隔离", -1),
              vue.createTextVNode("。 顶部切换公司后即可进入对应账套记账。 ", -1)
            ])]),
            _: 1
          }),
          vue.createElementVNode("div", _hoisted_2, [
            vue.createElementVNode("div", _hoisted_3, [
              _cache[19] || (_cache[19] = vue.createElementVNode("span", { class: "page-title" }, "记账公司", -1)),
              _cache[20] || (_cache[20] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                type: "primary",
                onClick: onCreate
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Plus))
                    ]),
                    _: 1
                  }),
                  _cache[18] || (_cache[18] = vue.createTextVNode("新建公司 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "company:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: list.value,
              "empty-text": "暂无记账公司"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "code",
                  label: "编码",
                  width: "140"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "name",
                  label: "公司名称",
                  "min-width": "200",
                  "show-overflow-tooltip": ""
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "taxNo",
                  label: "纳税人识别号",
                  "min-width": "180"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.taxNo || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "我的身份",
                  width: "110",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.isOwner ? "warning" : "info",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.isOwner ? "所有者" : "可记账"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "状态",
                  width: "90",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.status === 1 ? "success" : "danger",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.status === 1 ? "启用" : "停用"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "260",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onSwitch(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                        vue.createTextVNode("进入记账", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onMembers(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                        vue.createTextVNode(" 成员 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "company:member"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
                        vue.createTextVNode(" 编辑 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "company:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      disabled: row.id === vue.unref(userStore).companyId,
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                        vue.createTextVNode(" 删除 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["disabled", "onClick"])), [
                      [_directive_permission, "company:delete"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, loading.value]
            ])
          ]),
          vue.createVNode(_component_el_dialog, {
            modelValue: dialogVisible.value,
            "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑公司" : "新建记账公司",
            width: "680px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[13] || (_cache[13] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[27] || (_cache[27] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSave
              }, {
                default: vue.withCtx(() => [..._cache[28] || (_cache[28] = [
                  vue.createTextVNode("保存", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_form, {
                ref_key: "formRef",
                ref: formRef,
                model: form,
                rules,
                "label-width": "110px"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, {
                    label: "公司名称",
                    prop: "name"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.name,
                        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.name = $event),
                        maxlength: "100",
                        placeholder: "营业执照上的公司全称"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "纳税人识别号",
                            prop: "taxNo"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.taxNo,
                                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.taxNo = $event),
                                maxlength: "50"
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "法定代表人",
                            prop: "legalPerson"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.legalPerson,
                                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.legalPerson = $event),
                                maxlength: "50"
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "所属行业",
                            prop: "industry"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.industry,
                                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.industry = $event),
                                maxlength: "50"
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "会计年度起始月",
                            prop: "fiscalStartMonth"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.fiscalStartMonth,
                                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.fiscalStartMonth = $event)
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(12, (m) => {
                                    return vue.createVNode(_component_el_option, {
                                      key: m,
                                      label: `${m} 月`,
                                      value: m
                                    }, null, 8, ["label", "value"]);
                                  }), 64))
                                ]),
                                _: 1
                              }, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "纳税人类型",
                            prop: "taxpayerType"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.taxpayerType,
                                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.taxpayerType = $event),
                                placeholder: "请选择纳税人类型",
                                onChange: onTaxpayerTypeChange
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_option, {
                                    label: "小规模纳税人",
                                    value: "small_scale"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "一般纳税人",
                                    value: "general"
                                  })
                                ]),
                                _: 1
                              }, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          form.taxpayerType === "small_scale" ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                            key: 0,
                            label: "征收率(%)",
                            prop: "vatRate"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input_number, {
                                modelValue: form.vatRate,
                                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.vatRate = $event),
                                min: 0,
                                max: 100,
                                precision: 2,
                                step: 1,
                                style: { "width": "100%" }
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })) : (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                            key: 1,
                            label: "增值税申报"
                          }, {
                            default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                              vue.createElementVNode("span", { class: "form-hint" }, "一般纳税人按分税率归集后申报", -1)
                            ])]),
                            _: 1
                          }))
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "申报周期",
                            prop: "taxDeclareCycle"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.taxDeclareCycle,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.taxDeclareCycle = $event)
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_option, {
                                    label: "按月申报",
                                    value: "month"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "按季申报",
                                    value: "quarter"
                                  })
                                ]),
                                _: 1
                              }, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 })
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "注册地址",
                    prop: "address"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.address,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.address = $event),
                        maxlength: "200"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "开户行",
                            prop: "bankName"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.bankName,
                                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.bankName = $event),
                                maxlength: "100"
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "银行账号",
                            prop: "bankAccount"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.bankAccount,
                                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.bankAccount = $event),
                                maxlength: "50"
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  !form.id ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                    key: 0,
                    label: "初始化科目"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_checkbox, {
                        modelValue: form.copyAccountsFromCurrent,
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.copyAccountsFromCurrent = $event)
                      }, {
                        default: vue.withCtx(() => [..._cache[26] || (_cache[26] = [
                          vue.createTextVNode(" 复制当前公司的会计科目表（取消则使用系统标准科目） ", -1)
                        ])]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_form_item, {
                    label: "备注",
                    prop: "remark"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.remark = $event),
                        type: "textarea",
                        rows: 2,
                        maxlength: "200"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["model"])
            ]),
            _: 1
          }, 8, ["modelValue", "title"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: memberVisible.value,
            "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => memberVisible.value = $event),
            title: "公司成员授权",
            width: "720px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[15] || (_cache[15] = ($event) => memberVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[30] || (_cache[30] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: memberSaving.value,
                onClick: onSaveMembers
              }, {
                default: vue.withCtx(() => [..._cache[31] || (_cache[31] = [
                  vue.createTextVNode("保存", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_alert, {
                type: "info",
                closable: false,
                class: "mb12"
              }, {
                title: vue.withCtx(() => [
                  vue.createTextVNode(" 勾选后可登录并进入「" + vue.toDisplayString(current.value?.name) + "」记账。角色为全局权限， 在所有公司中一致生效。 ", 1)
                ]),
                _: 1
              }),
              vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", null, [
                vue.createVNode(_component_el_table, {
                  data: allUsers.value,
                  height: "360",
                  "empty-text": "暂无用户"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      label: "选择",
                      width: "60",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_checkbox, {
                          "model-value": selectedUserIds.value.includes(row.id),
                          disabled: memberRows.value.find((m) => m.userId === row.id)?.isOwner,
                          onChange: (v) => toggleUser(row.id, v)
                        }, null, 8, ["model-value", "disabled", "onChange"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "username",
                      label: "账号",
                      width: "130"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "nickname",
                      label: "姓名",
                      width: "130"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "角色",
                      "min-width": "200"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_select, {
                          modelValue: roleSelection[row.id],
                          "onUpdate:modelValue": ($event) => roleSelection[row.id] = $event,
                          placeholder: "保持不变",
                          clearable: "",
                          multiple: "",
                          size: "small",
                          style: { "width": "100%" }
                        }, {
                          default: vue.withCtx(() => [
                            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(roles.value, (r) => {
                              return vue.openBlock(), vue.createBlock(_component_el_option, {
                                key: r.id,
                                label: r.name,
                                value: r.id
                              }, null, 8, ["label", "value"]);
                            }), 128))
                          ]),
                          _: 1
                        }, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "身份",
                      width: "90",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        memberRows.value.find((m) => m.userId === row.id)?.isOwner ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                          key: 0,
                          type: "warning",
                          size: "small"
                        }, {
                          default: vue.withCtx(() => [..._cache[29] || (_cache[29] = [
                            vue.createTextVNode(" 所有者 ", -1)
                          ])]),
                          _: 1
                        })) : vue.createCommentVNode("", true)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"])
              ])), [
                [_directive_loading, memberLoading.value]
              ])
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]);
      };
    }
  });
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const MultiCompanyPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-38380be6"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("multi-company", {
    components: {
      MultiCompanyPage
    }
  });
})(Vue, VueRouter, ElementPlus, ElementPlusIconsVue, axios, Pinia);
