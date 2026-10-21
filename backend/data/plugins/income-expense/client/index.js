(function(vue, elementPlus, iconsVue, axios2, dayjs2, pinia) {
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
  const incomeExpenseApi = {
    list: (params) => get("/income-expense", params),
    detail: (id) => get(`/income-expense/${id}`),
    create: (data) => post("/income-expense", data),
    update: (id, data) => put(`/income-expense/${id}`, data),
    remove: (id) => del(`/income-expense/${id}`)
  };
  const fixedExpenseApi = {
    list: (params) => get("/fixed-expenses", params),
    pending: (untilPeriod) => get("/fixed-expenses/pending", untilPeriod ? { untilPeriod } : void 0),
    suggest: (name) => get("/fixed-expenses/suggest", { name }),
    logs: (id) => get(`/fixed-expenses/${id}/logs`),
    create: (data) => post("/fixed-expenses", data),
    generate: (untilPeriod) => post("/fixed-expenses/generate", untilPeriod ? { untilPeriod } : {}),
    update: (id, data) => put(`/fixed-expenses/${id}`, data),
    toggleStatus: (id, status) => put(`/fixed-expenses/${id}/status`, { status }),
    remove: (id) => del(`/fixed-expenses/${id}`)
  };
  function usePagedList(options) {
    const list = vue.ref([]);
    const total = vue.ref(0);
    const loading = vue.ref(false);
    const query = vue.ref({
      page: 1,
      pageSize: 20,
      ...options.defaultParams ?? {}
    });
    async function load() {
      loading.value = true;
      try {
        const res = await options.fetcher({ ...query.value });
        list.value = res.list ?? [];
        total.value = res.total ?? 0;
        return res;
      } catch (error) {
        console.warn("列表加载失败", error);
        list.value = [];
        total.value = 0;
        return null;
      } finally {
        loading.value = false;
      }
    }
    function search() {
      query.value.page = 1;
      return load();
    }
    function reset() {
      query.value = { page: 1, pageSize: query.value.pageSize, ...options.defaultParams ?? {} };
      return load();
    }
    function handlePage(page) {
      query.value.page = page;
      return load();
    }
    function handleSize(pageSize) {
      query.value.pageSize = pageSize;
      query.value.page = 1;
      return load();
    }
    if (options.immediate !== false) {
      load();
    }
    return { list, total, loading, query, load, search, reset, handlePage, handleSize };
  }
  async function confirmDelete(name = "该记录") {
    try {
      await elementPlus.ElMessageBox.confirm(`确定要删除${name}吗？此操作不可撤销。`, "提示", {
        type: "warning",
        confirmButtonText: "确定删除",
        cancelButtonText: "取消"
      });
      return true;
    } catch {
      return false;
    }
  }
  function ok(message = "操作成功") {
    elementPlus.ElMessage.success(message);
  }
  function formatAmount(value) {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
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
  const _hoisted_1$1 = { class: "page" };
  const _hoisted_2$1 = { class: "page-card" };
  const _hoisted_3$1 = { class: "page-toolbar" };
  const _hoisted_4$1 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_5$1 = { class: "page-pagination" };
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const basicStore = useBasicStore();
      const dateRange = vue.ref(null);
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => {
          if (dateRange.value?.length === 2) {
            params.startDate = dateRange.value[0];
            params.endDate = dateRange.value[1];
          }
          return incomeExpenseApi.list(params);
        },
        defaultParams: { page: 1, pageSize: 20, bizType: "" }
      });
      const allAccounts = vue.ref([]);
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const editId = vue.ref("");
      const formRef = vue.ref();
      const initialForm = {
        bizType: "income",
        bizDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        accountId: "",
        bankAccountId: "",
        partnerId: "",
        departmentId: "",
        amount: 0,
        summary: "",
        remark: ""
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        bizDate: [{ required: true, message: "请选择业务日期", trigger: "change" }],
        accountId: [{ required: true, message: "请选择科目", trigger: "change" }],
        amount: [{ required: true, message: "请输入金额", trigger: "blur" }]
      };
      const accountOptionsFiltered = vue.computed(() => {
        const incomeCodes = ["6001", "6051", "6111", "6201"];
        const expenseCodes = ["6301", "6401", "6601", "6602", "6603", "6701", "6801", "6901"];
        const allowed = form.bizType === "income" ? incomeCodes : expenseCodes;
        return allAccounts.value.filter((a) => a.category === "profit" && allowed.some((c) => a.code.startsWith(c)));
      });
      const dialogTitle = vue.computed(() => {
        const word = form.bizType === "income" ? "其他收入" : "其他支出";
        return `${editId.value ? "编辑" : "新增"}${word}`;
      });
      function onReset() {
        query.value.bizType = "";
        dateRange.value = null;
        reset();
      }
      function onCreate(bizType) {
        editId.value = "";
        Object.assign(form, { ...initialForm, bizType });
        dialogVisible.value = true;
      }
      function onEdit(row) {
        editId.value = row.id;
        Object.assign(form, {
          bizType: row.bizType,
          bizDate: String(row.bizDate).slice(0, 10),
          accountId: row.accountId,
          bankAccountId: row.bankAccountId ?? "",
          partnerId: row.partnerId ?? "",
          departmentId: row.departmentId ?? "",
          amount: Number(row.amount),
          summary: row.summary ?? "",
          remark: row.remark ?? ""
        });
        dialogVisible.value = true;
      }
      function onAccountChange() {
        form.partnerId = "";
        form.departmentId = "";
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        if (form.amount <= 0) {
          elementPlus.ElMessage.warning("金额必须大于 0");
          return;
        }
        saving.value = true;
        try {
          const payload = { ...form };
          for (const k of ["bankAccountId", "partnerId", "departmentId", "summary", "remark"]) {
            if (!payload[k]) delete payload[k];
          }
          if (editId.value) await incomeExpenseApi.update(editId.value, payload);
          else await incomeExpenseApi.create(payload);
          ok("已保存并生成记账凭证");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`单据（${formatAmount(row.amount)}）`)) return;
        try {
          await incomeExpenseApi.remove(row.id);
          ok("已删除，对应凭证同步删除");
          load();
        } catch {
        }
      }
      vue.onMounted(async () => {
        allAccounts.value = await accountApi.options();
        await basicStore.loadAll();
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_radio_button = vue.resolveComponent("el-radio-button");
        const _component_el_radio_group = vue.resolveComponent("el-radio-group");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_radio = vue.resolveComponent("el-radio");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
          vue.createElementVNode("div", _hoisted_2$1, [
            vue.createElementVNode("div", _hoisted_3$1, [
              vue.createVNode(_component_el_radio_group, {
                modelValue: vue.unref(query).bizType,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).bizType = $event),
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_radio_button, { value: "" }, {
                    default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
                      vue.createTextVNode("全部", -1)
                    ])]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_radio_button, { value: "income" }, {
                    default: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                      vue.createTextVNode("其他收入", -1)
                    ])]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_radio_button, { value: "expense" }, {
                    default: vue.withCtx(() => [..._cache[19] || (_cache[19] = [
                      vue.createTextVNode("其他支出", -1)
                    ])]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_date_picker, {
                modelValue: dateRange.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => dateRange.value = $event),
                type: "daterange",
                "value-format": "YYYY-MM-DD",
                "range-separator": "至",
                "start-placeholder": "开始日期",
                "end-placeholder": "结束日期",
                style: { "width": "240px" },
                onChange: vue.unref(search)
              }, null, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_button, {
                type: "primary",
                onClick: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Search))
                    ]),
                    _: 1
                  }),
                  _cache[20] || (_cache[20] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: onReset }, {
                default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }),
              _cache[24] || (_cache[24] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                type: "primary",
                onClick: _cache[2] || (_cache[2] = ($event) => onCreate("income"))
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Plus))
                    ]),
                    _: 1
                  }),
                  _cache[22] || (_cache[22] = vue.createTextVNode("新增收入 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "income-expense:create"]
              ]),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                onClick: _cache[3] || (_cache[3] = ($event) => onCreate("expense"))
              }, {
                default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
                  vue.createTextVNode("新增支出", -1)
                ])]),
                _: 1
              })), [
                [_directive_permission, "income-expense:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无单据"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "bizDate",
                  label: "业务日期",
                  width: "115"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "类型",
                  width: "100"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.bizType === "income" ? "success" : "warning",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.bizType === "income" ? "收入" : "支出"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "accountName",
                  label: "收入/费用科目",
                  "min-width": "200"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "bankAccountName",
                  label: "收付账户",
                  "min-width": "130"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.bankAccountName || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "summary",
                  label: "摘要",
                  "min-width": "160",
                  "show-overflow-tooltip": ""
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "金额",
                  width: "150",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", {
                      class: vue.normalizeClass(["amount", row.bizType === "income" ? "amount--debit" : "amount--credit"])
                    }, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 3)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "createdByName",
                  label: "制单",
                  width: "100"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "凭证",
                  width: "80",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.voucherId ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 0,
                      type: "success",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                        vue.createTextVNode("已生成", -1)
                      ])]),
                      _: 1
                    })) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_4$1, "-"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "140",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[26] || (_cache[26] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "income-expense:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[27] || (_cache[27] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "income-expense:delete"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_5$1, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[4] || (_cache[4] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[5] || (_cache[5] = ($event) => vue.unref(query).pageSize = $event),
                "page-sizes": [10, 20, 50],
                total: vue.unref(total),
                layout: "total, sizes, prev, pager, next",
                onCurrentChange: vue.unref(load),
                onSizeChange: vue.unref(handleSize)
              }, null, 8, ["current-page", "page-size", "total", "onCurrentChange", "onSizeChange"])
            ])
          ]),
          vue.createVNode(_component_el_dialog, {
            modelValue: dialogVisible.value,
            "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => dialogVisible.value = $event),
            title: dialogTitle.value,
            width: "580px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[15] || (_cache[15] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[30] || (_cache[30] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[31] || (_cache[31] = [
                  vue.createTextVNode("保存并生成凭证", -1)
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
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "类型" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_radio_group, {
                                modelValue: form.bizType,
                                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.bizType = $event)
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_radio, { value: "income" }, {
                                    default: vue.withCtx(() => [..._cache[28] || (_cache[28] = [
                                      vue.createTextVNode("收入", -1)
                                    ])]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_radio, { value: "expense" }, {
                                    default: vue.withCtx(() => [..._cache[29] || (_cache[29] = [
                                      vue.createTextVNode("支出", -1)
                                    ])]),
                                    _: 1
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
                          vue.createVNode(_component_el_form_item, {
                            label: "业务日期",
                            prop: "bizDate"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.bizDate,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.bizDate = $event),
                                type: "date",
                                "value-format": "YYYY-MM-DD",
                                style: { "width": "100%" }
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
                  vue.createVNode(_component_el_form_item, {
                    label: form.bizType === "income" ? "收入科目" : "费用科目",
                    prop: "accountId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.accountId,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.accountId = $event),
                        filterable: "",
                        placeholder: "选择损益类科目",
                        style: { "width": "100%" },
                        onChange: onAccountChange
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptionsFiltered.value, (acc) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: acc.id,
                              label: `${acc.code} ${acc.fullName}`,
                              value: acc.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }, 8, ["label"]),
                  vue.createVNode(_component_el_form_item, { label: "收付账户" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.bankAccountId,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.bankAccountId = $event),
                        filterable: "",
                        clearable: "",
                        placeholder: "不选则使用默认资金科目",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).banks, (b) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: b.id,
                              label: b.name,
                              value: b.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "金额",
                    prop: "amount"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input_number, {
                        modelValue: form.amount,
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.amount = $event),
                        min: 0,
                        precision: 2,
                        step: 100,
                        style: { "width": "100%" }
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "往来单位" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.partnerId,
                                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.partnerId = $event),
                                filterable: "",
                                clearable: "",
                                placeholder: "可选",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).partners, (p) => {
                                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                                      key: p.id,
                                      label: p.name,
                                      value: p.id
                                    }, null, 8, ["label", "value"]);
                                  }), 128))
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
                          vue.createVNode(_component_el_form_item, { label: "部门" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.departmentId,
                                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.departmentId = $event),
                                filterable: "",
                                clearable: "",
                                placeholder: "可选",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).departments, (d) => {
                                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                                      key: d.id,
                                      label: d.name,
                                      value: d.id
                                    }, null, 8, ["label", "value"]);
                                  }), 128))
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
                  vue.createVNode(_component_el_form_item, { label: "摘要" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.summary,
                        "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.summary = $event),
                        maxlength: "200",
                        "show-word-limit": ""
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => form.remark = $event),
                        type: "textarea",
                        rows: 2,
                        maxlength: "200",
                        "show-word-limit": ""
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["model"])
            ]),
            _: 1
          }, 8, ["modelValue", "title"])
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
  const IncomeExpensePage = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-425cc14b"]]);
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
  const _hoisted_2 = { class: "amount amount--credit" };
  const _hoisted_3 = { class: "pending-items" };
  const _hoisted_4 = { class: "page-card" };
  const _hoisted_5 = { class: "page-toolbar" };
  const _hoisted_6 = { class: "amount amount--credit" };
  const _hoisted_7 = {
    key: 2,
    class: "text-muted"
  };
  const _hoisted_8 = { class: "page-pagination" };
  const _hoisted_9 = { class: "quick-chips" };
  const _hoisted_10 = {
    key: 0,
    class: "suggest-tip"
  };
  const _hoisted_11 = {
    key: 1,
    class: "text-muted"
  };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "fixed-expense",
    setup(__props) {
      const basicStore = useBasicStore();
      const userStore = useUserStore();
      const QUICK_TEMPLATES = ["办公室房租", "物业费", "宽带费", "水电费", "停车费", "服务器费用"];
      const canUpdate = vue.computed(() => userStore.hasPermission("fixed-expense:update"));
      const { list, total, loading, query, load, search, handleSize } = usePagedList({
        fetcher: (params) => fixedExpenseApi.list(params),
        defaultParams: { page: 1, pageSize: 20, status: "" }
      });
      const allAccounts = vue.ref([]);
      const pendingInfo = vue.ref(null);
      const autoGenerating = vue.ref(false);
      const generating = vue.ref(false);
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const editId = vue.ref("");
      const formRef = vue.ref();
      const suggestTip = vue.ref("");
      const todayPeriod = () => {
        const now = /* @__PURE__ */ new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      };
      const initialForm = {
        name: "",
        frequency: "monthly",
        amount: 0,
        accountId: "",
        bankAccountId: "",
        partnerId: "",
        departmentId: "",
        projectId: "",
        bizDay: 1,
        startDate: `${todayPeriod()}-01`,
        endDate: "",
        autoApprove: true,
        remark: ""
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        name: [{ required: true, message: "请填写费用名称", trigger: "blur" }],
        frequency: [{ required: true, message: "请选择频率", trigger: "change" }],
        amount: [{ required: true, message: "请输入金额", trigger: "blur" }],
        accountId: [{ required: true, message: "请选择费用科目", trigger: "change" }],
        startDate: [{ required: true, message: "请选择开始期间", trigger: "change" }]
      };
      const accountOptionsFiltered = vue.computed(() => {
        const codes = ["6601", "6602", "6603", "6701", "6301", "6401"];
        return allAccounts.value.filter((a) => a.category === "profit" && codes.some((c) => a.code.startsWith(c)));
      });
      const backfillCount = vue.computed(() => {
        if (!form.startDate) return 0;
        const start = String(form.startDate).slice(0, 7);
        if (start >= todayPeriod()) return 0;
        if (form.frequency === "once") return 1;
        const [sy, sm] = start.split("-").map(Number);
        const [ty, tm] = todayPeriod().split("-").map(Number);
        const diff = ty * 12 + tm - (sy * 12 + sm);
        const step = form.frequency === "quarterly" ? 3 : form.frequency === "yearly" ? 12 : 1;
        return Math.floor(diff / step) + 1;
      });
      const dialogTitle = vue.computed(() => `${editId.value ? "编辑" : "新增"}固定费用`);
      const logsVisible = vue.ref(false);
      const logsLoading = vue.ref(false);
      const logsList = vue.ref([]);
      const logsTemplate = vue.ref(null);
      function frequencyLabel(f) {
        return f === "once" ? "一次性" : f === "quarterly" ? "每季" : f === "yearly" ? "每年" : "每月";
      }
      function periodLabel(p) {
        if (!p || p.length < 7) return p;
        return `${p.slice(0, 4)}年${Number(p.slice(5, 7))}月`;
      }
      function onQuickCreate(name) {
        editId.value = "";
        Object.assign(form, { ...initialForm });
        suggestTip.value = "";
        if (name) onQuickFill(name);
        dialogVisible.value = true;
      }
      async function onQuickFill(name) {
        form.name = name;
        await doSuggest();
      }
      async function doSuggest() {
        const name = form.name.trim();
        if (!name) return;
        try {
          const res = await fixedExpenseApi.suggest(name);
          if (res?.accountId) {
            form.accountId = res.accountId;
            suggestTip.value = res.reason || "已按名称智能推荐科目";
          } else {
            suggestTip.value = "";
          }
        } catch {
          suggestTip.value = "";
        }
      }
      function onNameBlur() {
        if (!form.accountId) void doSuggest();
      }
      function onEdit(row) {
        editId.value = row.id;
        Object.assign(form, {
          name: row.name,
          frequency: row.frequency,
          amount: Number(row.amount),
          accountId: row.accountId,
          bankAccountId: row.bankAccountId ?? "",
          partnerId: row.partnerId ?? "",
          departmentId: row.departmentId ?? "",
          projectId: row.projectId ?? "",
          bizDay: row.bizDay ?? 1,
          startDate: String(row.startDate).slice(0, 10),
          endDate: row.endDate ? String(row.endDate).slice(0, 10) : "",
          autoApprove: !!row.autoApprove,
          remark: row.remark ?? ""
        });
        suggestTip.value = "";
        dialogVisible.value = true;
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        if (form.amount <= 0) {
          elementPlus.ElMessage.warning("金额必须大于 0");
          return;
        }
        saving.value = true;
        try {
          const payload = { ...form };
          for (const k of ["bankAccountId", "partnerId", "departmentId", "projectId", "endDate", "remark"]) {
            if (!payload[k]) delete payload[k];
          }
          if (editId.value) await fixedExpenseApi.update(editId.value, payload);
          else await fixedExpenseApi.create(payload);
          ok(editId.value ? "已保存" : "已保存，到期将自动生成凭证");
          dialogVisible.value = false;
          await Promise.all([load(), refreshPending()]);
        } finally {
          saving.value = false;
        }
      }
      async function onToggle(row, v) {
        try {
          await fixedExpenseApi.toggleStatus(row.id, v ? 1 : 0);
          ok(v ? "已启用，到期将自动生成" : "已停用");
          await Promise.all([load(), refreshPending()]);
        } catch {
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`固定费用「${row.name}」`)) return;
        try {
          await fixedExpenseApi.remove(row.id);
          ok("已删除");
          await Promise.all([load(), refreshPending()]);
        } catch {
        }
      }
      async function onShowLogs(row) {
        logsTemplate.value = row;
        logsVisible.value = true;
        logsLoading.value = true;
        try {
          logsList.value = await fixedExpenseApi.logs(row.id);
        } finally {
          logsLoading.value = false;
        }
      }
      async function onGenerate() {
        generating.value = true;
        try {
          const res = await fixedExpenseApi.generate();
          notifyGenerateResult(res);
          await Promise.all([load(), refreshPending()]);
        } finally {
          generating.value = false;
        }
      }
      function notifyGenerateResult(res) {
        if (!res) return;
        if (res.createdCount > 0) {
          const total2 = (res.results ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
          ok(`已自动生成 ${res.createdCount} 期固定费用凭证，合计 ${formatAmount(total2)}`);
        }
        if (res.failedCount > 0) {
          elementPlus.ElMessage.warning(
            `${res.failedCount} 期生成失败：${(res.failures ?? []).map((f) => `${f.name}（${f.message}）`).join("；")}`
          );
        }
        if (!res.createdCount && !res.failedCount) elementPlus.ElMessage.info("没有需要生成的固定费用");
      }
      async function refreshPending() {
        try {
          pendingInfo.value = await fixedExpenseApi.pending();
        } catch {
          pendingInfo.value = null;
        }
      }
      async function autoGenerate() {
        if (!userStore.hasPermission("fixed-expense:create")) return;
        if (!pendingInfo.value || pendingInfo.value.count <= 0) return;
        autoGenerating.value = true;
        try {
          const res = await fixedExpenseApi.generate();
          notifyGenerateResult(res);
          await Promise.all([load(), refreshPending()]);
        } catch {
        } finally {
          autoGenerating.value = false;
        }
      }
      vue.onMounted(async () => {
        allAccounts.value = await accountApi.options();
        await basicStore.loadAll();
        await load();
        await refreshPending();
        void autoGenerate();
      });
      return (_ctx, _cache) => {
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_dropdown_item = vue.resolveComponent("el-dropdown-item");
        const _component_el_dropdown_menu = vue.resolveComponent("el-dropdown-menu");
        const _component_el_dropdown = vue.resolveComponent("el-dropdown");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          pendingInfo.value && pendingInfo.value.count > 0 ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
            key: 0,
            type: "warning",
            closable: false,
            "show-icon": "",
            class: "mb12"
          }, {
            title: vue.withCtx(() => [
              vue.createTextVNode(" 检测到 " + vue.toDisplayString(pendingInfo.value.count) + " 期固定费用待入账（预计合计 ", 1),
              vue.createElementVNode("span", _hoisted_2, vue.toDisplayString(vue.unref(formatAmount)(pendingInfo.value.totalAmount)), 1),
              vue.createTextVNode("）， " + vue.toDisplayString(autoGenerating.value ? "正在自动生成…" : ""), 1)
            ]),
            default: vue.withCtx(() => [
              vue.createElementVNode("div", _hoisted_3, [
                (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(pendingInfo.value.items, (item) => {
                  return vue.openBlock(), vue.createBlock(_component_el_tag, {
                    key: item.id,
                    size: "small",
                    class: "pending-tag",
                    type: "warning",
                    effect: "plain"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(item.name) + " · " + vue.toDisplayString(item.periods.map(periodLabel).join("、")), 1)
                    ]),
                    _: 2
                  }, 1024);
                }), 128))
              ]),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                size: "small",
                type: "primary",
                loading: generating.value,
                style: { "margin-top": "8px" },
                onClick: onGenerate
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.MagicStick))
                    ]),
                    _: 1
                  }),
                  _cache[19] || (_cache[19] = vue.createTextVNode("立即生成 ", -1))
                ]),
                _: 1
              }, 8, ["loading"])), [
                [_directive_permission, "fixed-expense:create"]
              ])
            ]),
            _: 1
          })) : pendingInfo.value && !autoGenerating.value ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
            key: 1,
            type: "success",
            closable: false,
            "show-icon": "",
            class: "mb12",
            title: "所有固定费用均已按期入账"
          })) : vue.createCommentVNode("", true),
          vue.createElementVNode("div", _hoisted_4, [
            vue.createElementVNode("div", _hoisted_5, [
              vue.createVNode(_component_el_input, {
                modelValue: vue.unref(query).keyword,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).keyword = $event),
                placeholder: "费用名称",
                clearable: "",
                style: { "width": "200px" },
                onKeyup: vue.withKeys(vue.unref(search), ["enter"]),
                onClear: vue.unref(search)
              }, null, 8, ["modelValue", "onKeyup", "onClear"]),
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).status,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => vue.unref(query).status = $event),
                style: { "width": "120px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_option, {
                    label: "全部状态",
                    value: ""
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "启用",
                    value: 1
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "停用",
                    value: 0
                  })
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_button, {
                type: "primary",
                onClick: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Search))
                    ]),
                    _: 1
                  }),
                  _cache[20] || (_cache[20] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              _cache[23] || (_cache[23] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_dropdown, { onCommand: onQuickCreate }, {
                dropdown: vue.withCtx(() => [
                  vue.createVNode(_component_el_dropdown_menu, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_dropdown_item, { command: "" }, {
                        default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                          vue.createTextVNode("自定义录入", -1)
                        ])]),
                        _: 1
                      }),
                      (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(QUICK_TEMPLATES, (q) => {
                        return vue.createVNode(_component_el_dropdown_item, {
                          divided: "",
                          key: q,
                          command: q
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(q), 1)
                          ]),
                          _: 2
                        }, 1032, ["command"]);
                      }), 64))
                    ]),
                    _: 1
                  })
                ]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_button, { type: "primary" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_icon, null, {
                        default: vue.withCtx(() => [
                          vue.createVNode(vue.unref(iconsVue.Plus))
                        ]),
                        _: 1
                      }),
                      _cache[21] || (_cache[21] = vue.createTextVNode("新增固定费用", -1)),
                      vue.createVNode(_component_el_icon, null, {
                        default: vue.withCtx(() => [
                          vue.createVNode(vue.unref(iconsVue.ArrowDown))
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })), [
                [_directive_permission, "fixed-expense:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无固定费用，点击右上角新增"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "name",
                  label: "费用名称",
                  "min-width": "150",
                  "show-overflow-tooltip": ""
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "频率",
                  width: "80",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      size: "small",
                      type: row.frequency === "monthly" ? "primary" : row.frequency === "once" ? "warning" : "info"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(frequencyLabel(row.frequency)), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "金额",
                  width: "130",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_6, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "accountName",
                  label: "费用科目",
                  "min-width": "140",
                  "show-overflow-tooltip": ""
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "支付账户",
                  "min-width": "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.bankAccountName || "默认现金"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "扣费日",
                  width: "80",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.frequency === "once" ? `${row.bizDay}号` : `每月${row.bizDay}号`), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "生效期间",
                  "min-width": "150"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(periodLabel(String(row.startDate).slice(0, 7))) + " 起 " + vue.toDisplayString(row.endDate ? `至 ${periodLabel(String(row.endDate).slice(0, 7))}` : "· 长期"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "入账进度",
                  "min-width": "140"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.pendingPeriods?.length ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 0,
                      size: "small",
                      type: "warning"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode("待生成 " + vue.toDisplayString(row.pendingPeriods.length) + " 期", 1)
                      ]),
                      _: 2
                    }, 1024)) : row.generatedCount > 0 ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 1,
                      size: "small",
                      type: "success"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode("已生成 " + vue.toDisplayString(row.generatedCount) + " 期", 1)
                      ]),
                      _: 2
                    }, 1024)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_7, "尚未生成"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "最近生成",
                  width: "100"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.lastPeriod ? periodLabel(row.lastPeriod) : "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "启用",
                  width: "70",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_switch, {
                      "model-value": row.status === 1,
                      disabled: !canUpdate.value,
                      onChange: (v) => onToggle(row, v)
                    }, null, 8, ["model-value", "disabled", "onChange"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "180",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onShowLogs(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                        vue.createTextVNode("生成历史", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "fixed-expense:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[26] || (_cache[26] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "fixed-expense:delete"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_8, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[2] || (_cache[2] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[3] || (_cache[3] = ($event) => vue.unref(query).pageSize = $event),
                "page-sizes": [10, 20, 50],
                total: vue.unref(total),
                layout: "total, sizes, prev, pager, next",
                onCurrentChange: vue.unref(load),
                onSizeChange: vue.unref(handleSize)
              }, null, 8, ["current-page", "page-size", "total", "onCurrentChange", "onSizeChange"])
            ])
          ]),
          vue.createVNode(_component_el_dialog, {
            modelValue: dialogVisible.value,
            "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => dialogVisible.value = $event),
            title: dialogTitle.value,
            width: "620px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[16] || (_cache[16] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[27] || (_cache[27] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
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
                  !editId.value ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                    key: 0,
                    label: "快速填入"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createElementVNode("div", _hoisted_9, [
                        (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(QUICK_TEMPLATES, (q) => {
                          return vue.createVNode(_component_el_tag, {
                            key: q,
                            class: "quick-chip",
                            type: form.name === q ? "primary" : "info",
                            effect: "plain",
                            onClick: ($event) => onQuickFill(q)
                          }, {
                            default: vue.withCtx(() => [
                              vue.createTextVNode(vue.toDisplayString(q), 1)
                            ]),
                            _: 2
                          }, 1032, ["type", "onClick"]);
                        }), 64))
                      ])
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "费用名称",
                            prop: "name"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.name,
                                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.name = $event),
                                maxlength: "100",
                                placeholder: "如：办公室房租",
                                onBlur: onNameBlur
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
                            label: "发生频率",
                            prop: "frequency"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.frequency,
                                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.frequency = $event),
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_option, {
                                    label: "一次性",
                                    value: "once"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "每月",
                                    value: "monthly"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "每季度",
                                    value: "quarterly"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "每年",
                                    value: "yearly"
                                  })
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
                            label: "固定金额",
                            prop: "amount"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input_number, {
                                modelValue: form.amount,
                                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.amount = $event),
                                min: 0,
                                precision: 2,
                                step: 100,
                                style: { "width": "100%" }
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
                            label: "扣费日",
                            prop: "bizDay"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input_number, {
                                modelValue: form.bizDay,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.bizDay = $event),
                                min: 1,
                                max: 31,
                                step: 1,
                                style: { "width": "100%" }
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
                  vue.createVNode(_component_el_form_item, {
                    label: "费用科目",
                    prop: "accountId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.accountId,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.accountId = $event),
                        filterable: "",
                        placeholder: "输入费用名称可智能推荐",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptionsFiltered.value, (acc) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: acc.id,
                              label: `${acc.code} ${acc.fullName}`,
                              value: acc.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"]),
                      suggestTip.value ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_10, [
                        vue.createVNode(_component_el_icon, null, {
                          default: vue.withCtx(() => [
                            vue.createVNode(vue.unref(iconsVue.MagicStick))
                          ]),
                          _: 1
                        }),
                        vue.createTextVNode(" " + vue.toDisplayString(suggestTip.value), 1)
                      ])) : vue.createCommentVNode("", true)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "支付账户" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.bankAccountId,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.bankAccountId = $event),
                        filterable: "",
                        clearable: "",
                        placeholder: "不选则默认现金科目",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).banks, (b) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: b.id,
                              label: b.name,
                              value: b.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "开始期间",
                            prop: "startDate"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.startDate,
                                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.startDate = $event),
                                type: "month",
                                "value-format": "YYYY-MM-01",
                                placeholder: "从哪个月开始",
                                style: { "width": "100%" }
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "结束期间" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.endDate,
                                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.endDate = $event),
                                type: "month",
                                "value-format": "YYYY-MM-01",
                                disabled: form.frequency === "once",
                                placeholder: form.frequency === "once" ? "一次性费用无需选择" : "留空为长期有效",
                                style: { "width": "100%" }
                              }, null, 8, ["modelValue", "disabled", "placeholder"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  backfillCount.value > 0 ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                    key: 1,
                    type: "info",
                    closable: false,
                    "show-icon": "",
                    class: "mb12",
                    title: `起始期间早于当前月，保存后首次生成将自动补录 ${backfillCount.value} 期凭证`
                  }, null, 8, ["title"])) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "往来单位" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.partnerId,
                                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.partnerId = $event),
                                filterable: "",
                                clearable: "",
                                placeholder: "可选，如房东",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).partners, (p) => {
                                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                                      key: p.id,
                                      label: p.name,
                                      value: p.id
                                    }, null, 8, ["label", "value"]);
                                  }), 128))
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
                          vue.createVNode(_component_el_form_item, { label: "部门" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.departmentId,
                                "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.departmentId = $event),
                                filterable: "",
                                clearable: "",
                                placeholder: "可选",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).departments, (d) => {
                                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                                      key: d.id,
                                      label: d.name,
                                      value: d.id
                                    }, null, 8, ["label", "value"]);
                                  }), 128))
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
                  vue.createVNode(_component_el_form_item, { label: "自动审核" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_switch, {
                        modelValue: form.autoApprove,
                        "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => form.autoApprove = $event),
                        "active-text": "生成后直接审核入账",
                        "inactive-text": "生成草稿待审核"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => form.remark = $event),
                        type: "textarea",
                        rows: 2,
                        maxlength: "200",
                        "show-word-limit": ""
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
            modelValue: logsVisible.value,
            "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => logsVisible.value = $event),
            title: `生成历史 - ${logsTemplate.value?.name ?? ""}`,
            width: "560px"
          }, {
            default: vue.withCtx(() => [
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
                data: logsList.value,
                "empty-text": "尚未生成过",
                size: "small"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_table_column, {
                    label: "期间",
                    width: "100"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createTextVNode(vue.toDisplayString(periodLabel(row.period)), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    prop: "bizDate",
                    label: "凭证日期",
                    width: "110"
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "金额",
                    width: "120",
                    align: "right"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "凭证",
                    align: "center"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      row.voucherId ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                        key: 0,
                        type: "success",
                        size: "small"
                      }, {
                        default: vue.withCtx(() => [..._cache[29] || (_cache[29] = [
                          vue.createTextVNode("已生成", -1)
                        ])]),
                        _: 1
                      })) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_11, "-"))
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["data"])), [
                [_directive_loading, logsLoading.value]
              ])
            ]),
            _: 1
          }, 8, ["modelValue", "title"])
        ]);
      };
    }
  });
  const FixedExpensePage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-476015d6"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("income-expense", {
    components: {
      IncomeExpensePage,
      FixedExpensePage
    }
  });
})(Vue, ElementPlus, ElementPlusIconsVue, axios, dayjs, Pinia);
