(function(vue, elementPlus, iconsVue, axios2, dayjs2, pinia) {
  "use strict";
  const TOKEN_KEY = "financial_token";
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
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
  const voucherApi = {
    list: (params) => get("/vouchers", params),
    detail: (id) => get(`/vouchers/${id}`),
    nextNo: (period, word = "记") => get("/vouchers/next-no", { period, word }),
    /** 复制凭证：返回新建草稿数据 */
    copy: (id) => get(`/vouchers/${id}/copy`),
    create: (data) => post("/vouchers", data),
    update: (id, data) => put(`/vouchers/${id}`, data),
    approve: (id) => post(`/vouchers/${id}/approve`),
    unapprove: (id) => post(`/vouchers/${id}/unapprove`),
    cancel: (id, reason) => post(`/vouchers/${id}/cancel`, { reason }),
    /** 红字冲销 */
    reverse: (id, data) => post(`/vouchers/${id}/reverse`, data ?? {}),
    remove: (id) => del(`/vouchers/${id}`)
  };
  const cashBankApi = {
    list: (params) => get("/cash-bank", params),
    detail: (id) => get(`/cash-bank/${id}`),
    create: (data) => post("/cash-bank", data),
    update: (id, data) => put(`/cash-bank/${id}`, data),
    remove: (id) => del(`/cash-bank/${id}`)
  };
  const bankStmtApi = {
    /** 上传对账单 Excel/CSV，解析落库并自动匹配 */
    import: (file, bankAccountId) => {
      const form = new FormData();
      form.append("file", file);
      form.append("bankAccountId", bankAccountId);
      return post("/bank-stmt/import", form);
    },
    list: (params) => get("/bank-stmt", params),
    summary: () => get("/bank-stmt/summary"),
    book: (id, data) => post(`/bank-stmt/${id}/book`, data),
    batchBook: () => post("/bank-stmt/batch-book", {}),
    skip: (id, remark) => post(`/bank-stmt/${id}/skip`, { remark }),
    restore: (id) => post(`/bank-stmt/${id}/restore`),
    remove: (id) => del(`/bank-stmt/${id}`),
    removeBatch: (batchId) => del(`/bank-stmt/batch/${batchId}`)
  };
  const employeeApi = {
    list: (params) => get("/employees", params),
    options: (onlyOnJob) => get("/employees/options", { onlyOnJob }),
    detail: (id) => get(`/employees/${id}`),
    /** 员工欠款明细：借款单列表 + 核销流水 + 汇总 */
    debts: (id) => get(`/employees/${id}/loans`),
    create: (data) => post("/employees", data),
    batchCreate: (items) => post("/employees/batch", { items }),
    /** 导入员工花名册（Excel/CSV）→ 预览解析 */
    importPreview: (file) => {
      const form = new FormData();
      form.append("file", file);
      return post("/employees/import", form);
    },
    /** 确认导入预览行 → 批量新建员工（exists 行由后端自动跳过） */
    importCommit: (data) => post("/employees/import/commit", data),
    update: (id, data) => put(`/employees/${id}`, data),
    remove: (id) => del(`/employees/${id}`)
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
  function voucherStatusMeta(status) {
    switch (status) {
      case "approved":
        return { label: "已审核", type: "success" };
      case "cancelled":
        return { label: "已作废", type: "danger" };
      case "draft":
        return { label: "未审核", type: "warning" };
      default:
        return { label: status, type: "info" };
    }
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
  const _hoisted_4$1 = { key: 1 };
  const _hoisted_5$1 = {
    key: 2,
    class: "text-muted"
  };
  const _hoisted_6$1 = { class: "amount" };
  const _hoisted_7$1 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_8$1 = { class: "page-pagination" };
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const basicStore = useBasicStore();
      const BIZ_TYPES = {
        receipt: "收款单",
        payment: "付款单",
        transfer: "转账单",
        expense: "费用报销",
        income: "其他收入"
      };
      const BIZ_TAGS = {
        receipt: "success",
        payment: "warning",
        transfer: "primary",
        expense: "danger",
        income: "info"
      };
      const bizTag = (t) => BIZ_TAGS[t] ?? "info";
      const statusLabel = (s) => voucherStatusMeta(s).label;
      const dateRange = vue.ref(null);
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => {
          if (dateRange.value?.length === 2) {
            params.startDate = dateRange.value[0];
            params.endDate = dateRange.value[1];
          }
          return cashBankApi.list(params);
        },
        defaultParams: { page: 1, pageSize: 20, bizType: "" }
      });
      const accountOptions = vue.ref([]);
      const counterAccountOptions = vue.computed(() => {
        const type = form.bizType;
        if (type === "expense") {
          return accountOptions.value.filter((a) => ["cost", "profit"].includes(a.category));
        }
        if (type === "income") {
          return accountOptions.value.filter((a) => a.category === "profit");
        }
        if (type === "receipt") {
          return accountOptions.value.filter((a) => ["asset", "liability"].includes(a.category));
        }
        if (type === "payment") {
          return accountOptions.value.filter((a) => ["asset", "liability", "cost", "profit"].includes(a.category));
        }
        return accountOptions.value;
      });
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const editId = vue.ref("");
      const formRef = vue.ref();
      const initialForm = {
        bizType: "receipt",
        bizDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        bankAccountId: "",
        accountId: "",
        toBankAccountId: "",
        partnerId: "",
        departmentId: "",
        amount: 0,
        summary: "",
        remark: "",
        autoApprove: true
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        bizDate: [{ required: true, message: "请选择业务日期", trigger: "change" }],
        bankAccountId: [{ required: true, message: "请选择资金账户", trigger: "change" }],
        amount: [{ required: true, message: "请输入金额", trigger: "blur" }]
      };
      const dialogTitle = vue.computed(() => {
        const name = editId.value ? "编辑" : "新增";
        return `${name}${BIZ_TYPES[form.bizType] ?? "单据"}`;
      });
      function onBizTypeChange() {
        form.accountId = "";
        form.toBankAccountId = "";
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
          bankAccountId: row.bankAccountId,
          accountId: row.accountId ?? "",
          toBankAccountId: row.toBankAccountId ?? "",
          partnerId: row.partnerId ?? "",
          departmentId: row.departmentId ?? "",
          amount: Number(row.amount),
          summary: row.summary ?? "",
          remark: row.remark ?? "",
          autoApprove: true
        });
        dialogVisible.value = true;
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        if (form.amount <= 0) {
          elementPlus.ElMessage.warning("金额必须大于 0");
          return;
        }
        if (form.bizType === "transfer" && !form.toBankAccountId) {
          elementPlus.ElMessage.warning("转账单据请选择转入账户");
          return;
        }
        if (form.bizType !== "transfer" && !form.accountId) {
          elementPlus.ElMessage.warning("请选择对方会计科目");
          return;
        }
        saving.value = true;
        try {
          const payload = { ...form };
          if (!payload.accountId) delete payload.accountId;
          if (!payload.toBankAccountId) delete payload.toBankAccountId;
          if (!payload.partnerId) delete payload.partnerId;
          if (!payload.departmentId) delete payload.departmentId;
          if (!payload.summary) delete payload.summary;
          if (!payload.remark) delete payload.remark;
          if (editId.value) await cashBankApi.update(editId.value, payload);
          else await cashBankApi.create(payload);
          ok("已保存并生成记账凭证");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`${BIZ_TYPES[row.bizType]}（${formatAmount(row.amount)}）`)) return;
        try {
          await cashBankApi.remove(row.id);
          ok("已删除，对应凭证同步删除");
          load();
        } catch {
        }
      }
      const voucherVisible = vue.ref(false);
      const voucherDetail = vue.ref(null);
      async function viewVoucher(row) {
        if (!row.voucherId) return;
        voucherDetail.value = await voucherApi.detail(row.voucherId);
        voucherVisible.value = true;
      }
      vue.onMounted(async () => {
        accountOptions.value = await accountApi.options();
        await basicStore.loadAll();
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_dropdown_item = vue.resolveComponent("el-dropdown-item");
        const _component_el_dropdown_menu = vue.resolveComponent("el-dropdown-menu");
        const _component_el_dropdown = vue.resolveComponent("el-dropdown");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
          vue.createElementVNode("div", _hoisted_2$1, [
            vue.createElementVNode("div", _hoisted_3$1, [
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).bizType,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).bizType = $event),
                placeholder: "单据类型",
                clearable: "",
                style: { "width": "140px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(BIZ_TYPES, (label, key) => {
                    return vue.createVNode(_component_el_option, {
                      key,
                      label,
                      value: key
                    }, null, 8, ["label", "value"]);
                  }), 64))
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
                  _cache[19] || (_cache[19] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: vue.unref(reset) }, {
                default: vue.withCtx(() => [..._cache[20] || (_cache[20] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }, 8, ["onClick"]),
              _cache[27] || (_cache[27] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                type: "primary",
                onClick: _cache[2] || (_cache[2] = ($event) => onCreate("receipt"))
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Plus))
                    ]),
                    _: 1
                  }),
                  _cache[21] || (_cache[21] = vue.createTextVNode("新增收款 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "cash-bank:create"]
              ]),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_dropdown, { onCommand: onCreate }, {
                dropdown: vue.withCtx(() => [
                  vue.createVNode(_component_el_dropdown_menu, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_dropdown_item, { command: "payment" }, {
                        default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
                          vue.createTextVNode("新增付款", -1)
                        ])]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_dropdown_item, { command: "transfer" }, {
                        default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                          vue.createTextVNode("新增转账", -1)
                        ])]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_dropdown_item, { command: "expense" }, {
                        default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                          vue.createTextVNode("费用报销", -1)
                        ])]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_dropdown_item, { command: "income" }, {
                        default: vue.withCtx(() => [..._cache[26] || (_cache[26] = [
                          vue.createTextVNode("其他收入", -1)
                        ])]),
                        _: 1
                      })
                    ]),
                    _: 1
                  })
                ]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_button, null, {
                    default: vue.withCtx(() => [
                      _cache[22] || (_cache[22] = vue.createTextVNode(" 其他单据", -1)),
                      vue.createVNode(_component_el_icon, { class: "el-icon--right" }, {
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
                [_directive_permission, "cash-bank:create"]
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
                  width: "105"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: bizTag(row.bizType),
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(BIZ_TYPES[row.bizType]), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "bankAccountName",
                  label: "资金账户",
                  "min-width": "140"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "对方科目",
                  "min-width": "200"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.bizType === "transfer" ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                      vue.createTextVNode(" → " + vue.toDisplayString(row.toBankAccountName), 1)
                    ], 64)) : row.accountName ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_4$1, vue.toDisplayString(row.accountCode) + " " + vue.toDisplayString(row.accountName), 1)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_5$1, "-"))
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
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_6$1, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
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
                      default: vue.withCtx(() => [..._cache[28] || (_cache[28] = [
                        vue.createTextVNode("已生成", -1)
                      ])]),
                      _: 1
                    })) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_7$1, "-"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "190",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[29] || (_cache[29] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "cash-bank:update"]
                    ]),
                    row.voucherId ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 0,
                      link: "",
                      type: "warning",
                      onClick: ($event) => viewVoucher(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[30] || (_cache[30] = [
                        vue.createTextVNode(" 查看凭证 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])) : vue.createCommentVNode("", true),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[31] || (_cache[31] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "cash-bank:delete"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_8$1, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[3] || (_cache[3] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[4] || (_cache[4] = ($event) => vue.unref(query).pageSize = $event),
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
            width: "640px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[16] || (_cache[16] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[32] || (_cache[32] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[33] || (_cache[33] = [
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
                          vue.createVNode(_component_el_form_item, { label: "业务类型" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.bizType,
                                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.bizType = $event),
                                style: { "width": "100%" },
                                onChange: onBizTypeChange
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(BIZ_TYPES, (label, key) => {
                                    return vue.createVNode(_component_el_option, {
                                      key,
                                      label,
                                      value: key
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
                                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.bizDate = $event),
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
                    label: "资金账户",
                    prop: "bankAccountId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.bankAccountId,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.bankAccountId = $event),
                        filterable: "",
                        placeholder: "选择收付款账户",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).banks, (b) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: b.id,
                              label: `${b.name}${b.accountCode ? `（${b.accountCode}）` : "（未关联科目）"}`,
                              value: b.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  form.bizType === "transfer" ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                    key: 0,
                    label: "转入账户",
                    prop: "toBankAccountId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.toBankAccountId,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.toBankAccountId = $event),
                        filterable: "",
                        placeholder: "选择转入账户",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).banks.filter((x) => x.id !== form.bankAccountId), (b) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: b.id,
                              label: `${b.name}${b.accountCode ? `（${b.accountCode}）` : "（未关联科目）"}`,
                              value: b.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  })) : (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                    key: 1,
                    label: "对方科目",
                    prop: "accountId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.accountId,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.accountId = $event),
                        filterable: "",
                        placeholder: "选择对方会计科目",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(counterAccountOptions.value, (acc) => {
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
                  })),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
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
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "自动审核" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_switch, {
                                modelValue: form.autoApprove,
                                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.autoApprove = $event)
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
                          vue.createVNode(_component_el_form_item, { label: "往来单位" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.partnerId,
                                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.partnerId = $event),
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
                  vue.createVNode(_component_el_form_item, { label: "摘要" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.summary,
                        "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => form.summary = $event),
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
            modelValue: voucherVisible.value,
            "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => voucherVisible.value = $event),
            title: "关联凭证",
            width: "720px"
          }, {
            default: vue.withCtx(() => [
              voucherDetail.value ? (vue.openBlock(), vue.createBlock(_component_el_descriptions, {
                key: 0,
                column: 3,
                border: "",
                size: "small"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_descriptions_item, { label: "凭证字" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(voucherDetail.value.word), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "凭证号" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(String(voucherDetail.value.voucherNo).padStart(4, "0")), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "日期" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(voucherDetail.value.voucherDate), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "状态" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(statusLabel(voucherDetail.value.status)), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "借方合计" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(voucherDetail.value.debitTotal)), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "贷方合计" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(voucherDetail.value.creditTotal)), 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })) : vue.createCommentVNode("", true),
              vue.createVNode(_component_el_table, {
                data: voucherDetail.value?.entries ?? [],
                size: "small",
                class: "mt8"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_table_column, {
                    prop: "summary",
                    label: "摘要",
                    "min-width": "140"
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "科目",
                    "min-width": "180"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createTextVNode(vue.toDisplayString(row.accountCode) + " " + vue.toDisplayString(row.accountName), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "借方",
                    width: "120",
                    align: "right"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createTextVNode(vue.toDisplayString(row.debit ? vue.unref(formatAmount)(row.debit) : ""), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "贷方",
                    width: "120",
                    align: "right"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createTextVNode(vue.toDisplayString(row.credit ? vue.unref(formatAmount)(row.credit) : ""), 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["data"])
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
  const CashBankPage = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-c2571bd0"]]);
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "s-value" };
  const _hoisted_3 = { class: "s-value" };
  const _hoisted_4 = { class: "s-value warn" };
  const _hoisted_5 = { class: "s-value small" };
  const _hoisted_6 = {
    key: 0,
    class: "tip"
  };
  const _hoisted_7 = {
    key: 0,
    class: "suggest"
  };
  const _hoisted_8 = { class: "amount" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "bank-stmt",
    setup(__props) {
      const summary = vue.ref({});
      const rows = vue.ref([]);
      const total = vue.ref(0);
      const loading = vue.ref(false);
      const importing = vue.ref(false);
      const booking = vue.ref(false);
      const batchBooking = vue.ref(false);
      const banks = vue.ref([]);
      const accounts = vue.ref([]);
      const employees = vue.ref([]);
      const partners = vue.ref([]);
      const bankAccountId = vue.ref("");
      const bookDialog = vue.ref(false);
      const current = vue.ref(null);
      const query = vue.reactive({ page: 1, pageSize: 50, status: "" });
      const bookForm = vue.reactive({
        bizType: "expense",
        accountId: "",
        summary: "",
        employeeId: "",
        partnerId: ""
      });
      const needEmployee = vue.computed(() => {
        const acc = accounts.value.find((a) => a.id === bookForm.accountId);
        return !!acc && String(acc.code).startsWith("1221");
      });
      const needPartner = vue.computed(() => {
        const acc = accounts.value.find((a) => a.id === bookForm.accountId);
        if (!acc) return false;
        return ["1122", "2202", "2241", "1221"].some((c) => String(acc.code).startsWith(c));
      });
      const bizTypes = [
        { value: "expense", label: "费用支出" },
        { value: "payment", label: "付款（冲应付/往来）" },
        { value: "receipt", label: "收款（冲应收/往来）" },
        { value: "income", label: "其他收入" }
      ];
      vue.onMounted(async () => {
        const [b, a, e, p] = await Promise.all([
          bankApi.list({ pageSize: 100 }),
          accountApi.tree(),
          employeeApi.list({ pageSize: 200 }),
          partnerApi.list({ pageSize: 200 })
        ]);
        banks.value = b?.list ?? b ?? [];
        accounts.value = flattenAccounts(a ?? []);
        employees.value = e?.list ?? e ?? [];
        partners.value = p?.list ?? p ?? [];
        await Promise.all([load(), loadSummary()]);
      });
      function flattenAccounts(list, prefix = "") {
        const out = [];
        for (const a of list) {
          const fullName = prefix ? `${prefix}/${a.name}` : a.name;
          if (a.isLeaf !== false) out.push({ ...a, fullName });
          if (a.children?.length) out.push(...flattenAccounts(a.children, fullName));
        }
        return out;
      }
      async function load() {
        loading.value = true;
        try {
          const res = await bankStmtApi.list({ ...query, status: query.status || void 0 });
          rows.value = res?.list ?? [];
          total.value = res?.total ?? 0;
        } finally {
          loading.value = false;
        }
      }
      async function loadSummary() {
        summary.value = await bankStmtApi.summary();
      }
      function beforeUpload(file) {
        if (!bankAccountId.value) {
          elementPlus.ElMessage.warning("请先选择资金账户");
          return false;
        }
        importing.value = true;
        bankStmtApi.import(file, bankAccountId.value).then(async (res) => {
          elementPlus.ElMessage.success(
            `导入 ${res.total} 行：已建议/匹配 ${res.total - res.pending} 行，待确认 ${res.pending} 行`
          );
          await Promise.all([load(), loadSummary()]);
        }).finally(() => {
          importing.value = false;
        });
        return false;
      }
      function openBook(row) {
        current.value = row;
        bookForm.bizType = row.suggestBizType || (row.credit > 0 ? "receipt" : "expense");
        bookForm.accountId = row.suggestAccountId || "";
        bookForm.summary = "";
        bookForm.employeeId = row.suggestEmployeeId || "";
        bookForm.partnerId = row.suggestPartnerId || "";
        bookDialog.value = true;
      }
      async function onBatchBook() {
        batchBooking.value = true;
        try {
          const res = await bankStmtApi.batchBook();
          if (!res?.total) {
            elementPlus.ElMessage.info("没有可自动入账的待确认行（仅高置信建议行会批量入账）");
            return;
          }
          if (res.failed?.length) {
            const lines = res.failed.slice(0, 5).map((f) => `${f.summary}：${f.reason}`);
            elementPlus.ElMessageBox.alert(
              `<div style="max-height:200px;overflow:auto">${lines.join("<br/>")}</div>`,
              `已入账 ${res.booked}/${res.total} 行，${res.failed.length} 行需人工处理`,
              { dangerouslyUseHTMLString: true, type: "warning" }
            ).catch(() => {
            });
          } else {
            elementPlus.ElMessage.success(`智能批量入账完成：${res.booked}/${res.total} 行已入账并生成凭证`);
          }
          await Promise.all([load(), loadSummary()]);
        } finally {
          batchBooking.value = false;
        }
      }
      async function confirmBook() {
        if (!bookForm.accountId) {
          elementPlus.ElMessage.warning("请选择对方科目");
          return;
        }
        if (needEmployee && !bookForm.employeeId) {
          elementPlus.ElMessage.warning("该科目需挂员工辅助核算，请选择员工");
          return;
        }
        booking.value = true;
        try {
          await bankStmtApi.book(current.value.id, {
            bizType: bookForm.bizType,
            accountId: bookForm.accountId,
            summary: bookForm.summary,
            employeeId: bookForm.employeeId || void 0,
            partnerId: bookForm.partnerId || void 0
          });
          elementPlus.ElMessage.success("已入账并生成凭证");
          bookDialog.value = false;
          await Promise.all([load(), loadSummary()]);
        } finally {
          booking.value = false;
        }
      }
      async function skip(row) {
        const { value } = await elementPlus.ElMessageBox.prompt("跳过原因（如：已在借款单/工资模块记账）", "跳过", {
          inputValue: row.status === "matched" ? row.matchInfo : ""
        });
        await bankStmtApi.skip(row.id, value);
        elementPlus.ElMessage.success("已跳过");
        await Promise.all([load(), loadSummary()]);
      }
      async function restore(row) {
        await bankStmtApi.restore(row.id);
        elementPlus.ElMessage.success("已恢复为待确认");
        await load();
      }
      async function removeRow(row) {
        await elementPlus.ElMessageBox.confirm(
          row.status === "booked" ? "该行已入账，删除将同时删除对应的资金单据和凭证，确认？" : "确认删除该流水行？",
          "删除",
          { type: "warning" }
        );
        await bankStmtApi.remove(row.id);
        elementPlus.ElMessage.success("已删除");
        await Promise.all([load(), loadSummary()]);
      }
      function statusText(s) {
        const map = { booked: "已入账", matched: "已匹配", pending: "待确认", skipped: "已跳过" };
        return map[s] ?? s;
      }
      function statusTag(s) {
        const map = { booked: "success", matched: "info", pending: "warning", skipped: "danger" };
        return map[s] ?? "info";
      }
      function fmt(n) {
        const v = Number(n ?? 0);
        return v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return (_ctx, _cache) => {
        const _component_el_card = vue.resolveComponent("el-card");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_radio_button = vue.resolveComponent("el-radio-button");
        const _component_el_radio_group = vue.resolveComponent("el-radio-group");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createVNode(_component_el_row, {
            gutter: 12,
            class: "summary"
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_col, { span: 6 }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_card, { shadow: "never" }, {
                    default: vue.withCtx(() => [
                      _cache[10] || (_cache[10] = vue.createElementVNode("div", { class: "s-label" }, "流水总笔数", -1)),
                      vue.createElementVNode("div", _hoisted_2, vue.toDisplayString(summary.value.total ?? 0), 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_col, { span: 6 }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_card, { shadow: "never" }, {
                    default: vue.withCtx(() => [
                      _cache[11] || (_cache[11] = vue.createElementVNode("div", { class: "s-label" }, "已自动识别（利息/手续费/借款）", -1)),
                      vue.createElementVNode("div", _hoisted_3, vue.toDisplayString((summary.value.booked ?? 0) + (summary.value.matched ?? 0)), 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_col, { span: 6 }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_card, { shadow: "never" }, {
                    default: vue.withCtx(() => [
                      _cache[12] || (_cache[12] = vue.createElementVNode("div", { class: "s-label" }, "待确认", -1)),
                      vue.createElementVNode("div", _hoisted_4, vue.toDisplayString(summary.value.pending ?? 0), 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_col, { span: 6 }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_card, { shadow: "never" }, {
                    default: vue.withCtx(() => [
                      _cache[13] || (_cache[13] = vue.createElementVNode("div", { class: "s-label" }, "收入 / 支出合计", -1)),
                      vue.createElementVNode("div", _hoisted_5, vue.toDisplayString(fmt(summary.value.creditTotal)) + " / " + vue.toDisplayString(fmt(summary.value.debitTotal)), 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          }),
          vue.createVNode(_component_el_card, {
            shadow: "never",
            class: "toolbar"
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_upload, {
                "show-file-list": false,
                accept: ".xlsx,.xls,.csv",
                "before-upload": beforeUpload
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_button, {
                    type: "primary",
                    loading: importing.value,
                    disabled: !bankAccountId.value
                  }, {
                    default: vue.withCtx(() => [..._cache[14] || (_cache[14] = [
                      vue.createTextVNode(" 上传对账单（Excel/CSV） ", -1)
                    ])]),
                    _: 1
                  }, 8, ["loading", "disabled"])
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_select, {
                modelValue: bankAccountId.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => bankAccountId.value = $event),
                placeholder: "选择资金账户",
                style: { "width": "240px", "margin-left": "12px" }
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(banks.value, (b) => {
                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                      key: b.id,
                      label: b.name,
                      value: b.id
                    }, null, 8, ["label", "value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"]),
              vue.createVNode(_component_el_select, {
                modelValue: query.status,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => query.status = $event),
                placeholder: "全部状态",
                clearable: "",
                style: { "width": "140px", "margin-left": "12px" },
                onChange: load
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_option, {
                    label: "待确认",
                    value: "pending"
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "已入账",
                    value: "booked"
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "已匹配",
                    value: "matched"
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "已跳过",
                    value: "skipped"
                  })
                ]),
                _: 1
              }, 8, ["modelValue"]),
              vue.createVNode(_component_el_button, {
                style: { "margin-left": "12px" },
                onClick: load
              }, {
                default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
                  vue.createTextVNode("刷新", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "success",
                style: { "margin-left": "12px" },
                loading: batchBooking.value,
                onClick: onBatchBook
              }, {
                default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                  vue.createTextVNode("智能批量入账", -1)
                ])]),
                _: 1
              }, 8, ["loading"]),
              !bankAccountId.value ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_6, "请先选择资金账户（收款/付款将记到该账户）")) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }),
          vue.createVNode(_component_el_card, { shadow: "never" }, {
            default: vue.withCtx(() => [
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
                data: rows.value,
                size: "small",
                stripe: ""
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_table_column, {
                    prop: "rowDate",
                    label: "日期",
                    width: "100"
                  }),
                  vue.createVNode(_component_el_table_column, {
                    prop: "summary",
                    label: "摘要",
                    "min-width": "140",
                    "show-overflow-tooltip": ""
                  }),
                  vue.createVNode(_component_el_table_column, {
                    prop: "counterName",
                    label: "对方户名",
                    "min-width": "130",
                    "show-overflow-tooltip": ""
                  }),
                  vue.createVNode(_component_el_table_column, {
                    prop: "credit",
                    label: "收入",
                    width: "100",
                    align: "right"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createTextVNode(vue.toDisplayString(row.credit > 0 ? fmt(row.credit) : ""), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    prop: "debit",
                    label: "支出",
                    width: "100",
                    align: "right"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createTextVNode(vue.toDisplayString(row.debit > 0 ? fmt(row.debit) : ""), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    prop: "status",
                    label: "状态",
                    width: "90"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createVNode(_component_el_tag, {
                        type: statusTag(row.status),
                        size: "small"
                      }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(vue.toDisplayString(statusText(row.status)), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    prop: "matchInfo",
                    label: "识别/建议",
                    "min-width": "180",
                    "show-overflow-tooltip": ""
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createElementVNode("span", null, vue.toDisplayString(row.matchInfo), 1),
                      row.suggestAccountCode ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_7, " → " + vue.toDisplayString(row.suggestAccountCode) + " " + vue.toDisplayString(row.suggestAccountName), 1)) : vue.createCommentVNode("", true),
                      row.autoBookable === 1 && row.status === "pending" ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                        key: 1,
                        type: "success",
                        size: "small",
                        style: { "margin-left": "4px" }
                      }, {
                        default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
                          vue.createTextVNode(" 可批量入账 ", -1)
                        ])]),
                        _: 1
                      })) : vue.createCommentVNode("", true)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "操作",
                    width: "200",
                    fixed: "right"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      row.status === "pending" ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                        key: 0,
                        type: "primary",
                        size: "small",
                        onClick: ($event) => openBook(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                          vue.createTextVNode("入账", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])) : vue.createCommentVNode("", true),
                      row.status === "pending" || row.status === "matched" ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                        key: 1,
                        size: "small",
                        onClick: ($event) => skip(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[19] || (_cache[19] = [
                          vue.createTextVNode("跳过", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])) : vue.createCommentVNode("", true),
                      row.status === "skipped" ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                        key: 2,
                        size: "small",
                        onClick: ($event) => restore(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[20] || (_cache[20] = [
                          vue.createTextVNode("恢复", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])) : vue.createCommentVNode("", true),
                      vue.createVNode(_component_el_button, {
                        type: "danger",
                        size: "small",
                        link: "",
                        onClick: ($event) => removeRow(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                          vue.createTextVNode("删除", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["data"])), [
                [_directive_loading, loading.value]
              ]),
              vue.createVNode(_component_el_pagination, {
                class: "pager",
                "current-page": query.page,
                "onUpdate:currentPage": _cache[2] || (_cache[2] = ($event) => query.page = $event),
                "page-size": query.pageSize,
                total: total.value,
                layout: "total, prev, pager, next",
                onCurrentChange: load
              }, null, 8, ["current-page", "page-size", "total"])
            ]),
            _: 1
          }),
          vue.createVNode(_component_el_dialog, {
            modelValue: bookDialog.value,
            "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => bookDialog.value = $event),
            title: "流水入账",
            width: "460px"
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[8] || (_cache[8] = ($event) => bookDialog.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: booking.value,
                onClick: confirmBook
              }, {
                default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
                  vue.createTextVNode("确认入账", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_form, { "label-width": "90px" }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "金额" }, {
                    default: vue.withCtx(() => [
                      vue.createElementVNode("span", _hoisted_8, vue.toDisplayString(fmt(current.value?.debit > 0 ? current.value?.debit : current.value?.credit)), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "业务类型" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_radio_group, {
                        modelValue: bookForm.bizType,
                        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => bookForm.bizType = $event)
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(bizTypes, (t) => {
                            return vue.createVNode(_component_el_radio_button, {
                              key: t.value,
                              value: t.value
                            }, {
                              default: vue.withCtx(() => [
                                vue.createTextVNode(vue.toDisplayString(t.label), 1)
                              ]),
                              _: 2
                            }, 1032, ["value"]);
                          }), 64))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "对方科目" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: bookForm.accountId,
                        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => bookForm.accountId = $event),
                        filterable: "",
                        placeholder: "选择会计科目",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accounts.value, (a) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: a.id,
                              label: `${a.code} ${a.fullName || a.name}`,
                              value: a.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  needEmployee.value ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                    key: 0,
                    label: "经办员工"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: bookForm.employeeId,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => bookForm.employeeId = $event),
                        filterable: "",
                        placeholder: "该科目需挂员工辅助核算",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employees.value, (e) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: e.id,
                              label: e.name,
                              value: e.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  needPartner.value ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                    key: 1,
                    label: "往来单位"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: bookForm.partnerId,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => bookForm.partnerId = $event),
                        filterable: "",
                        clearable: "",
                        placeholder: "选择往来单位（应收/应付/其他需挂往来）",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(partners.value, (p) => {
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
                  })) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_form_item, { label: "摘要" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: bookForm.summary,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => bookForm.summary = $event),
                        placeholder: "留空默认用流水摘要"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]);
      };
    }
  });
  const BankStmtPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6170f026"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("cash-bank", {
    components: {
      CashBankPage,
      BankStmtPage
    }
  });
})(Vue, ElementPlus, ElementPlusIconsVue, axios, dayjs, Pinia);
