(function(vue, iconsVue, axios2, elementPlus, dayjs2, pinia) {
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
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-card" };
  const _hoisted_3 = { class: "page-toolbar" };
  const _hoisted_4 = { class: "page-pagination" };
  const _hoisted_5 = { class: "page-card" };
  const _hoisted_6 = { class: "page-toolbar" };
  const _hoisted_7 = { class: "amt amt--advance" };
  const _hoisted_8 = { class: "amt amt--receivable" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const basicStore = useBasicStore();
      const parsing = vue.ref(false);
      async function onContractFile(file) {
        const raw = file.raw;
        if (!raw) return;
        parsing.value = true;
        try {
          const r = await projectApi.parseContract(raw);
          if (r.projectName && !form.name) form.name = r.projectName;
          if (r.contractNo) form.contractNo = r.contractNo;
          if (r.amount) form.contractAmount = r.amount;
          if (r.partyA || r.partyB) {
            const hit = basicStore.partners.find(
              (pt) => pt.name === r.partyA || pt.name === r.partyB
            );
            if (hit) {
              form.partnerId = hit.id;
            } else {
              ok(
                `已识别甲方「${r.partyA ?? "-"}」、乙方「${r.partyB ?? "-"}」，请在客户下拉中手动选择`
              );
            }
          } else {
            ok("已识别部分字段，请核对补全");
          }
          vue.nextTick(() => formRef.value?.clearValidate());
        } catch {
        } finally {
          parsing.value = false;
        }
      }
      const activeTab = vue.ref("list");
      const ledger = vue.ref([]);
      const ledgerLoading = vue.ref(false);
      async function loadLedger() {
        ledgerLoading.value = true;
        try {
          ledger.value = await projectApi.ledger();
        } finally {
          ledgerLoading.value = false;
        }
      }
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => projectApi.list(params),
        defaultParams: { page: 1, pageSize: 20, keyword: "" }
      });
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const initialForm = {
        id: "",
        name: "",
        manager: "",
        contractNo: "",
        contractAmount: void 0,
        partnerId: "",
        startDate: "",
        endDate: "",
        remark: "",
        status: 1
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        name: [{ required: true, message: "请输入项目名称", trigger: "blur" }]
      };
      function onCreate() {
        Object.assign(form, { ...initialForm });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      function onEdit(row) {
        Object.assign(form, {
          id: row.id,
          name: row.name,
          manager: row.manager ?? "",
          contractNo: row.contractNo ?? "",
          contractAmount: row.contractAmount != null ? Number(row.contractAmount) : void 0,
          partnerId: row.partnerId ?? "",
          startDate: row.startDate ?? "",
          endDate: row.endDate ?? "",
          remark: row.remark ?? "",
          status: row.status
        });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onRemove(row) {
        if (!await confirmDelete(`项目「${row.name}」`)) return;
        try {
          await projectApi.remove(row.id);
          ok("删除成功");
          load();
          basicStore.refresh("projects");
        } catch {
        }
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        saving.value = true;
        try {
          const payload = { ...form };
          delete payload.id;
          if (form.id) await projectApi.update(form.id, payload);
          else await projectApi.create(payload);
          ok(form.id ? "修改成功" : "新增成功");
          dialogVisible.value = false;
          load();
          basicStore.refresh("projects");
        } finally {
          saving.value = false;
        }
      }
      vue.onMounted(() => {
        load();
        loadLedger();
        basicStore.loadPartners();
      });
      return (_ctx, _cache) => {
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_tab_pane = vue.resolveComponent("el-tab-pane");
        const _component_el_tabs = vue.resolveComponent("el-tabs");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createVNode(_component_el_tabs, {
            modelValue: activeTab.value,
            "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => activeTab.value = $event)
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_tab_pane, {
                label: "项目档案",
                name: "list"
              }, {
                default: vue.withCtx(() => [
                  vue.createElementVNode("div", _hoisted_2, [
                    vue.createElementVNode("div", _hoisted_3, [
                      vue.createVNode(_component_el_input, {
                        modelValue: vue.unref(query).keyword,
                        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).keyword = $event),
                        placeholder: "搜索项目编码 / 名称",
                        clearable: "",
                        style: { "width": "220px" },
                        onKeyup: vue.withKeys(vue.unref(search), ["enter"]),
                        onClear: vue.unref(search)
                      }, null, 8, ["modelValue", "onKeyup", "onClear"]),
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
                          _cache[15] || (_cache[15] = vue.createTextVNode("查询", -1))
                        ]),
                        _: 1
                      }, 8, ["onClick"]),
                      vue.createVNode(_component_el_button, { onClick: vue.unref(reset) }, {
                        default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                          vue.createTextVNode("重置", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"]),
                      _cache[18] || (_cache[18] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
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
                          _cache[17] || (_cache[17] = vue.createTextVNode("新增项目 ", -1))
                        ]),
                        _: 1
                      })), [
                        [_directive_permission, "project:create"]
                      ])
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
                      data: vue.unref(list),
                      "empty-text": "暂无项目"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_table_column, {
                          prop: "code",
                          label: "项目编码",
                          width: "140"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "name",
                          label: "项目名称",
                          "min-width": "200"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "manager",
                          label: "负责人",
                          width: "130"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "startDate",
                          label: "开始日期",
                          width: "120"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "endDate",
                          label: "结束日期",
                          width: "120"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "remark",
                          label: "备注",
                          "min-width": "160",
                          "show-overflow-tooltip": ""
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "状态",
                          width: "80",
                          align: "center"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createVNode(_component_el_tag, {
                              type: row.status === 1 ? "success" : "info",
                              size: "small"
                            }, {
                              default: vue.withCtx(() => [
                                vue.createTextVNode(vue.toDisplayString(row.status === 1 ? "启用" : "禁用"), 1)
                              ]),
                              _: 2
                            }, 1032, ["type"])
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
                              default: vue.withCtx(() => [..._cache[19] || (_cache[19] = [
                                vue.createTextVNode("编辑", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"])), [
                              [_directive_permission, "project:update"]
                            ]),
                            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                              link: "",
                              type: "danger",
                              onClick: ($event) => onRemove(row)
                            }, {
                              default: vue.withCtx(() => [..._cache[20] || (_cache[20] = [
                                vue.createTextVNode("删除", -1)
                              ])]),
                              _: 1
                            }, 8, ["onClick"])), [
                              [_directive_permission, "project:delete"]
                            ])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["data"])), [
                      [_directive_loading, vue.unref(loading)]
                    ]),
                    vue.createElementVNode("div", _hoisted_4, [
                      vue.createVNode(_component_el_pagination, {
                        "current-page": vue.unref(query).page,
                        "onUpdate:currentPage": _cache[1] || (_cache[1] = ($event) => vue.unref(query).page = $event),
                        "page-size": vue.unref(query).pageSize,
                        "onUpdate:pageSize": _cache[2] || (_cache[2] = ($event) => vue.unref(query).pageSize = $event),
                        "page-sizes": [10, 20, 50, 100],
                        total: vue.unref(total),
                        layout: "total, sizes, prev, pager, next, jumper",
                        onCurrentChange: vue.unref(load),
                        onSizeChange: vue.unref(handleSize)
                      }, null, 8, ["current-page", "page-size", "total", "onCurrentChange", "onSizeChange"])
                    ])
                  ])
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_tab_pane, {
                label: "合同台账",
                name: "ledger"
              }, {
                default: vue.withCtx(() => [
                  vue.createElementVNode("div", _hoisted_5, [
                    vue.createElementVNode("div", _hoisted_6, [
                      _cache[22] || (_cache[22] = vue.createElementVNode("span", { class: "ledger-tip" }, " 数据口径：预收账款 2203 / 应收账款 1122 / 已确认收入 6001（按凭证项目辅助核算聚合） ", -1)),
                      _cache[23] || (_cache[23] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
                      vue.createVNode(_component_el_button, { onClick: loadLedger }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_icon, null, {
                            default: vue.withCtx(() => [
                              vue.createVNode(vue.unref(iconsVue.Refresh))
                            ]),
                            _: 1
                          }),
                          _cache[21] || (_cache[21] = vue.createTextVNode("刷新", -1))
                        ]),
                        _: 1
                      })
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
                      data: ledger.value,
                      "empty-text": "暂无项目"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_table_column, {
                          prop: "code",
                          label: "项目编码",
                          width: "110"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "name",
                          label: "项目名称",
                          "min-width": "160",
                          "show-overflow-tooltip": ""
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "partnerName",
                          label: "客户",
                          "min-width": "140",
                          "show-overflow-tooltip": ""
                        }),
                        vue.createVNode(_component_el_table_column, {
                          prop: "contractNo",
                          label: "合同编号",
                          width: "130",
                          "show-overflow-tooltip": ""
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "合同金额",
                          width: "120",
                          align: "right"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(row.contractAmount)), 1)
                          ]),
                          _: 1
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "预收(未开票已收)",
                          width: "150",
                          align: "right"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createElementVNode("span", _hoisted_7, vue.toDisplayString(vue.unref(formatAmount)(row.advanceReceived)), 1)
                          ]),
                          _: 1
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "应收(已开票未收)",
                          width: "150",
                          align: "right"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createElementVNode("span", _hoisted_8, vue.toDisplayString(vue.unref(formatAmount)(row.receivable)), 1)
                          ]),
                          _: 1
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "已确认收入",
                          width: "120",
                          align: "right"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(row.recognizedRevenue)), 1)
                          ]),
                          _: 1
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "尾款(合同额-上述)",
                          width: "150",
                          align: "right"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createElementVNode("span", {
                              class: vue.normalizeClass(["amt", row.restAmount > 0 ? "amt--rest" : ""])
                            }, vue.toDisplayString(vue.unref(formatAmount)(row.restAmount)), 3)
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["data"])), [
                      [_directive_loading, ledgerLoading.value]
                    ])
                  ])
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: dialogVisible.value,
            "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑项目" : "新增项目",
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
                "label-width": "100px"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "导入合同" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_upload, {
                        "show-file-list": false,
                        "auto-upload": false,
                        accept: ".pdf",
                        "on-change": onContractFile
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_button, {
                            loading: parsing.value,
                            type: "warning",
                            plain: ""
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_icon, null, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(vue.unref(iconsVue.Upload))
                                ]),
                                _: 1
                              }),
                              vue.createTextVNode(vue.toDisplayString(parsing.value ? "识别中…" : "导入合同PDF自动识别"), 1)
                            ]),
                            _: 1
                          }, 8, ["loading"])
                        ]),
                        _: 1
                      }),
                      _cache[24] || (_cache[24] = vue.createElementVNode("span", { class: "parse-tip" }, "识别结果仅作预填，请核对后保存", -1))
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "项目名称",
                    prop: "name"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.name,
                        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.name = $event)
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "负责人" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.manager,
                                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.manager = $event)
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "开始日期" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.startDate,
                                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.startDate = $event),
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
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "结束日期" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.endDate,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.endDate = $event),
                                type: "date",
                                "value-format": "YYYY-MM-DD",
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
                          vue.createVNode(_component_el_form_item, { label: "状态" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_switch, {
                                modelValue: form.status,
                                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.status = $event),
                                "active-value": 1,
                                "inactive-value": 0,
                                "active-text": "启用",
                                "inactive-text": "禁用"
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
                          vue.createVNode(_component_el_form_item, { label: "合同编号" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.contractNo,
                                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.contractNo = $event),
                                placeholder: "选填"
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "合同金额" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input_number, {
                                modelValue: form.contractAmount,
                                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.contractAmount = $event),
                                min: 0,
                                precision: 2,
                                controls: false,
                                placeholder: "选填",
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
                  vue.createVNode(_component_el_form_item, { label: "客户" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.partnerId,
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.partnerId = $event),
                        clearable: "",
                        filterable: "",
                        placeholder: "选择往来单位（客户）",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(vue.unref(basicStore).partners, (pt) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: pt.id,
                              label: pt.name,
                              value: pt.id
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.remark = $event),
                        type: "textarea",
                        rows: 2
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
  const ProjectsPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-570f8844"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("projects", {
    components: {
      ProjectsPage
    }
  });
})(Vue, ElementPlusIconsVue, axios, ElementPlus, dayjs, Pinia);
