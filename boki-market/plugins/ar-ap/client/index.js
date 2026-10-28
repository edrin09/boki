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
  const arApApi = {
    receivable: (params) => get("/ar-ap/receivable", params),
    payable: (params) => get("/ar-ap/payable", params),
    writeOffs: (params) => get("/ar-ap/write-offs", params),
    createWriteOff: (data) => post("/ar-ap/write-off", data),
    removeWriteOff: (id) => del(`/ar-ap/write-off/${id}`)
  };
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
  function periodToYearMonth(period) {
    const p = Number(period ?? 0);
    if (!p) {
      const now = dayjs2();
      return [now.year(), now.month() + 1];
    }
    return [Math.floor(p / 100), p % 100];
  }
  function yearMonthToPeriod(year, month) {
    return Number(`${year}${String(month).padStart(2, "0")}`);
  }
  function currentPeriod() {
    return yearMonthToPeriod(dayjs2().year(), dayjs2().month() + 1);
  }
  function periodLabel(period) {
    const [y, m] = periodToYearMonth(period);
    return `${y} 年 ${m} 月`;
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
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "PeriodPicker",
    props: {
      modelValue: { default: void 0 },
      clearable: { type: Boolean, default: false },
      width: { default: "150px" }
    },
    emits: ["update:modelValue", "change"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const period = vue.computed({
        get: () => {
          const v = props.modelValue;
          if (!v) return "";
          return String(v);
        },
        set: (val) => {
          const next = val ? Number(val) : null;
          emit("update:modelValue", next);
          emit("change", next);
        }
      });
      return (_ctx, _cache) => {
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        return vue.openBlock(), vue.createBlock(_component_el_date_picker, {
          modelValue: period.value,
          "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => period.value = $event),
          type: "month",
          "value-format": "YYYYMM",
          placeholder: "选择会计期间",
          format: "YYYY 年 MM 月",
          clearable: __props.clearable,
          style: vue.normalizeStyle({ width: __props.width })
        }, null, 8, ["modelValue", "clearable", "style"]);
      };
    }
  });
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-toolbar" };
  const _hoisted_3 = {
    key: 0,
    class: "page-card"
  };
  const _hoisted_4 = { class: "amount" };
  const _hoisted_5 = { class: "amount amount--debit" };
  const _hoisted_6 = { class: "amount amount--credit" };
  const _hoisted_7 = {
    key: 1,
    class: "page-card"
  };
  const _hoisted_8 = { class: "amount" };
  const _hoisted_9 = { class: "page-pagination" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const basicStore = useBasicStore();
      const tab = vue.ref("receivable");
      const period = vue.ref(currentPeriod());
      const partnerFilter = vue.ref("");
      const onlyWithBalance = vue.ref(true);
      const loading = vue.ref(false);
      const balanceData = vue.ref(null);
      const writeOffList = vue.ref([]);
      const woTotal = vue.ref(0);
      const woPage = vue.reactive({ page: 1, pageSize: 20 });
      const accountOptions = vue.ref([]);
      const arApAccountOptions = vue.computed(
        () => accountOptions.value.filter((a) => ["asset", "liability"].includes(a.category))
      );
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const selectedRow = vue.ref(null);
      const initialForm = {
        type: "receivable",
        partnerId: "",
        accountId: "",
        bankAccountId: "",
        bizDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        amount: 0,
        summary: ""
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        partnerId: [{ required: true, message: "请选择往来单位", trigger: "change" }],
        bankAccountId: [{ required: true, message: "请选择收付账户", trigger: "change" }],
        bizDate: [{ required: true, message: "请选择核销日期", trigger: "change" }],
        amount: [{ required: true, message: "请输入核销金额", trigger: "blur" }]
      };
      async function load() {
        if (tab.value === "write-offs") {
          await loadWriteOffs();
          return;
        }
        loading.value = true;
        try {
          const [year] = periodToYearMonth(period.value);
          const params = {
            endPeriod: period.value,
            fiscalYear: year,
            partnerIds: partnerFilter.value || void 0,
            onlyWithBalance: onlyWithBalance.value ? "true" : void 0
          };
          balanceData.value = tab.value === "receivable" ? await arApApi.receivable(params) : await arApApi.payable(params);
        } finally {
          loading.value = false;
        }
      }
      async function loadWriteOffs() {
        loading.value = true;
        try {
          const res = await arApApi.writeOffs({ page: woPage.page, pageSize: woPage.pageSize });
          writeOffList.value = res.list ?? [];
          woTotal.value = res.total ?? 0;
        } finally {
          loading.value = false;
        }
      }
      function onWoSizeChange() {
        woPage.page = 1;
        loadWriteOffs();
      }
      function onWriteOff(row) {
        selectedRow.value = row ?? null;
        Object.assign(form, { ...initialForm });
        if (row) {
          form.type = tab.value === "payable" ? "payable" : "receivable";
          form.partnerId = row.partnerId;
          form.amount = Number(row.closingBalance ?? 0);
        } else if (tab.value !== "receivable") {
          form.type = "payable";
        }
        dialogVisible.value = true;
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        if (form.amount <= 0) {
          elementPlus.ElMessage.warning("核销金额必须大于 0");
          return;
        }
        if (selectedRow.value?.closingBalance && form.amount > selectedRow.value.closingBalance) {
          elementPlus.ElMessage.warning("核销金额不能超过当前余额");
          return;
        }
        saving.value = true;
        try {
          const payload = { ...form };
          if (!payload.accountId) delete payload.accountId;
          if (!payload.summary) delete payload.summary;
          await arApApi.createWriteOff(payload);
          ok("核销成功，已生成记账凭证");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      async function onRemoveWriteOff(row) {
        if (!await confirmDelete("该核销记录")) return;
        try {
          await arApApi.removeWriteOff(row.id);
          ok("已撤销，对应凭证同步删除");
          load();
        } catch {
        }
      }
      vue.watch(period, load);
      vue.onMounted(async () => {
        accountOptions.value = await accountApi.options();
        await basicStore.loadAll();
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_radio_button = vue.resolveComponent("el-radio-button");
        const _component_el_radio_group = vue.resolveComponent("el-radio-group");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_checkbox = vue.resolveComponent("el-checkbox");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_card = vue.resolveComponent("el-card");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_radio = vue.resolveComponent("el-radio");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createVNode(_component_el_card, {
            shadow: "never",
            class: "mb12"
          }, {
            default: vue.withCtx(() => [
              vue.createElementVNode("div", _hoisted_2, [
                vue.createVNode(_component_el_radio_group, {
                  modelValue: tab.value,
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => tab.value = $event),
                  onChange: load
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_radio_button, { value: "receivable" }, {
                      default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
                        vue.createTextVNode("应收余额", -1)
                      ])]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_radio_button, { value: "payable" }, {
                      default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                        vue.createTextVNode("应付余额", -1)
                      ])]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_radio_button, { value: "write-offs" }, {
                      default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
                        vue.createTextVNode("核销记录", -1)
                      ])]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["modelValue"]),
                vue.createVNode(_sfc_main$1, {
                  modelValue: period.value,
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => period.value = $event),
                  width: "140px"
                }, null, 8, ["modelValue"]),
                tab.value !== "write-offs" ? (vue.openBlock(), vue.createBlock(_component_el_select, {
                  key: 0,
                  modelValue: partnerFilter.value,
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => partnerFilter.value = $event),
                  placeholder: "往来单位",
                  clearable: "",
                  filterable: "",
                  style: { "width": "200px" },
                  onChange: load
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
                }, 8, ["modelValue"])) : vue.createCommentVNode("", true),
                tab.value !== "write-offs" ? (vue.openBlock(), vue.createBlock(_component_el_checkbox, {
                  key: 1,
                  modelValue: onlyWithBalance.value,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => onlyWithBalance.value = $event),
                  onChange: load
                }, {
                  default: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                    vue.createTextVNode(" 仅显示有余额 ", -1)
                  ])]),
                  _: 1
                }, 8, ["modelValue"])) : vue.createCommentVNode("", true),
                _cache[20] || (_cache[20] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
                vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                  type: "primary",
                  onClick: onWriteOff
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_icon, null, {
                      default: vue.withCtx(() => [
                        vue.createVNode(vue.unref(iconsVue.Connection))
                      ]),
                      _: 1
                    }),
                    _cache[19] || (_cache[19] = vue.createTextVNode("往来核销 ", -1))
                  ]),
                  _: 1
                })), [
                  [_directive_permission, "ar-ap:write-off"]
                ])
              ])
            ]),
            _: 1
          }),
          tab.value !== "write-offs" ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_3, [
            balanceData.value ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
              key: 0,
              type: "info",
              closable: false,
              "show-icon": "",
              class: "mb12",
              title: `${balanceData.value.account.code} ${balanceData.value.account.name} · ${vue.unref(periodLabel)(period.value)} 余额合计 ${vue.unref(formatAmount)(balanceData.value.totals.balance)} 元`
            }, null, 8, ["title"])) : vue.createCommentVNode("", true),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: balanceData.value?.rows ?? [],
              "empty-text": "暂无往来数据"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "partnerName",
                  label: "往来单位",
                  "min-width": "200"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "期初余额",
                  width: "150",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_4, vue.toDisplayString(row.openingBalance ? vue.unref(formatAmount)(row.openingBalance) : "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "本期增加",
                  width: "150",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_5, vue.toDisplayString(row.periodDebit ? vue.unref(formatAmount)(row.periodDebit) : "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "本期减少",
                  width: "150",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_6, vue.toDisplayString(row.periodCredit ? vue.unref(formatAmount)(row.periodCredit) : "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "期末余额",
                  width: "160",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", {
                      class: vue.normalizeClass(["amount amount--total", row.direction === "debit" ? "amount--debit" : "amount--credit"])
                    }, vue.toDisplayString(row.closingBalance ? vue.unref(formatAmount)(row.closingBalance) : "-"), 3)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "方向",
                  width: "80",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.direction === "debit" ? "success" : "warning",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.direction === "debit" ? "借" : "贷"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "110",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      disabled: !row.closingBalance,
                      onClick: ($event) => onWriteOff(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                        vue.createTextVNode(" 核销 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["disabled", "onClick"])), [
                      [_directive_permission, "ar-ap:write-off"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, loading.value]
            ])
          ])) : (vue.openBlock(), vue.createElementBlock("div", _hoisted_7, [
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: writeOffList.value,
              "empty-text": "暂无核销记录"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "bizDate",
                  label: "核销日期",
                  width: "115"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "类型",
                  width: "100"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.type === "receivable" ? "success" : "warning",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.type === "receivable" ? "应收核销" : "应付核销"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "partnerName",
                  label: "往来单位",
                  "min-width": "180"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "accountName",
                  label: "往来科目",
                  width: "140"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "bankAccountName",
                  label: "收付账户",
                  "min-width": "140"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "金额",
                  width: "150",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_8, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "createdByName",
                  label: "制单",
                  width: "100"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "100",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemoveWriteOff(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                        vue.createTextVNode(" 撤销 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "ar-ap:write-off"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, loading.value]
            ]),
            vue.createElementVNode("div", _hoisted_9, [
              vue.createVNode(_component_el_pagination, {
                "current-page": woPage.page,
                "onUpdate:currentPage": _cache[4] || (_cache[4] = ($event) => woPage.page = $event),
                "page-size": woPage.pageSize,
                "onUpdate:pageSize": _cache[5] || (_cache[5] = ($event) => woPage.pageSize = $event),
                "page-sizes": [10, 20, 50],
                total: woTotal.value,
                layout: "total, sizes, prev, pager, next",
                onCurrentChange: loadWriteOffs,
                onSizeChange: onWoSizeChange
              }, null, 8, ["current-page", "page-size", "total"])
            ])
          ])),
          vue.createVNode(_component_el_dialog, {
            modelValue: dialogVisible.value,
            "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => dialogVisible.value = $event),
            title: "往来核销",
            width: "560px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[13] || (_cache[13] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[26] || (_cache[26] = [
                  vue.createTextVNode("确认核销", -1)
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
                  vue.createVNode(_component_el_form_item, { label: "核销类型" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_radio_group, {
                        modelValue: form.type,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.type = $event)
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_radio, { value: "receivable" }, {
                            default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
                              vue.createTextVNode("应收核销（收款）", -1)
                            ])]),
                            _: 1
                          }),
                          vue.createVNode(_component_el_radio, { value: "payable" }, {
                            default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                              vue.createTextVNode("应付核销（付款）", -1)
                            ])]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "往来单位",
                    prop: "partnerId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.partnerId,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.partnerId = $event),
                        filterable: "",
                        placeholder: "选择往来单位",
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
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "往来科目",
                    prop: "accountId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.accountId,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.accountId = $event),
                        filterable: "",
                        placeholder: "如 1122 应收账款",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(arApAccountOptions.value, (acc) => {
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
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "收付账户",
                    prop: "bankAccountId"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.bankAccountId,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.bankAccountId = $event),
                        filterable: "",
                        placeholder: "选择资金账户",
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
                    label: "核销日期",
                    prop: "bizDate"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_date_picker, {
                        modelValue: form.bizDate,
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.bizDate = $event),
                        type: "date",
                        "value-format": "YYYY-MM-DD",
                        style: { "width": "100%" }
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "核销金额",
                    prop: "amount"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input_number, {
                        modelValue: form.amount,
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.amount = $event),
                        min: 0,
                        precision: 2,
                        step: 100,
                        style: { "width": "100%" }
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  selectedRow.value?.closingBalance ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                    key: 0,
                    type: "info",
                    closable: false,
                    title: `当前余额 ${vue.unref(formatAmount)(selectedRow.value.closingBalance)} 元，可支持部分核销`
                  }, null, 8, ["title"])) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_form_item, { label: "摘要" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.summary,
                        "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.summary = $event),
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
  const ArApPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0bf4b0d7"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("ar-ap", {
    components: {
      ArApPage
    }
  });
})(Vue, ElementPlus, ElementPlusIconsVue, axios, dayjs, Pinia);
