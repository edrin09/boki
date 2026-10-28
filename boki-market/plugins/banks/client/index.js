(function(vue, iconsVue, axios2, elementPlus, pinia) {
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
  const _hoisted_4 = { key: 0 };
  const _hoisted_5 = { class: "page-pagination" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const basicStore = useBasicStore();
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => bankApi.list(params),
        defaultParams: { page: 1, pageSize: 20, keyword: "", type: "" }
      });
      const cashAccountOptions = vue.ref([]);
      function accountName(code) {
        return cashAccountOptions.value.find((a) => a.code === code)?.name ?? "";
      }
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const initialForm = {
        id: "",
        name: "",
        type: "bank",
        accountCode: "",
        bankName: "",
        accountNo: "",
        accountName: "",
        remark: "",
        status: 1
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        name: [{ required: true, message: "请输入账户名称", trigger: "blur" }]
      };
      async function loadAccountOptions() {
        const all = await accountApi.options();
        cashAccountOptions.value = all.filter((a) => a.isCash || a.isBank);
      }
      function onCreate() {
        Object.assign(form, { ...initialForm });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      function onEdit(row) {
        Object.assign(form, {
          id: row.id,
          name: row.name,
          type: row.type,
          accountCode: row.accountCode ?? "",
          bankName: row.bankName ?? "",
          accountNo: row.accountNo ?? "",
          accountName: row.accountName ?? "",
          remark: row.remark ?? "",
          status: row.status
        });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onRemove(row) {
        if (!await confirmDelete(`资金账户「${row.name}」`)) return;
        try {
          await bankApi.remove(row.id);
          ok("删除成功");
          load();
          basicStore.refresh("banks");
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
          if (form.id) await bankApi.update(form.id, payload);
          else await bankApi.create(payload);
          ok(form.id ? "修改成功" : "新增成功");
          dialogVisible.value = false;
          load();
          basicStore.refresh("banks");
        } finally {
          saving.value = false;
        }
      }
      vue.onMounted(async () => {
        await loadAccountOptions();
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_radio = vue.resolveComponent("el-radio");
        const _component_el_radio_group = vue.resolveComponent("el-radio-group");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createElementVNode("div", _hoisted_2, [
            vue.createElementVNode("div", _hoisted_3, [
              vue.createVNode(_component_el_input, {
                modelValue: vue.unref(query).keyword,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).keyword = $event),
                placeholder: "搜索编码 / 名称 / 账号",
                clearable: "",
                style: { "width": "220px" },
                onKeyup: vue.withKeys(vue.unref(search), ["enter"]),
                onClear: vue.unref(search)
              }, null, 8, ["modelValue", "onKeyup", "onClear"]),
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).type,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => vue.unref(query).type = $event),
                placeholder: "账户类型",
                clearable: "",
                style: { "width": "130px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_option, {
                    label: "现金",
                    value: "cash"
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "银行",
                    value: "bank"
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
                  _cache[14] || (_cache[14] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: vue.unref(reset) }, {
                default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }, 8, ["onClick"]),
              _cache[17] || (_cache[17] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
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
                  _cache[16] || (_cache[16] = vue.createTextVNode("新增账户 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "bank:create"]
              ])
            ]),
            vue.createVNode(_component_el_alert, {
              type: "info",
              "show-icon": "",
              closable: false,
              title: "资金账户需关联对应的会计科目（如库存现金 1001、银行存款 1002），现金银行单据才能据此自动生成凭证。",
              class: "tip"
            }),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无数据"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "code",
                  label: "编码",
                  width: "120"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "name",
                  label: "账户名称",
                  "min-width": "180"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "类型",
                  width: "90"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.type === "cash" ? "warning" : "primary",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.type === "cash" ? "现金" : "银行"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "accountCode",
                  label: "关联科目",
                  width: "130"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.accountCode ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_4, vue.toDisplayString(row.accountCode) + " " + vue.toDisplayString(accountName(row.accountCode)), 1)) : (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 1,
                      type: "danger",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                        vue.createTextVNode("未关联", -1)
                      ])]),
                      _: 1
                    }))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "bankName",
                  label: "开户行",
                  "min-width": "150",
                  "show-overflow-tooltip": ""
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "accountNo",
                  label: "账号",
                  width: "160"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "accountName",
                  label: "开户名称",
                  "min-width": "140"
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
                      [_directive_permission, "bank:update"]
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
                      [_directive_permission, "bank:delete"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_5, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[2] || (_cache[2] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[3] || (_cache[3] = ($event) => vue.unref(query).pageSize = $event),
                "page-sizes": [10, 20, 50, 100],
                total: vue.unref(total),
                layout: "total, sizes, prev, pager, next, jumper",
                onCurrentChange: vue.unref(load),
                onSizeChange: vue.unref(handleSize)
              }, null, 8, ["current-page", "page-size", "total", "onCurrentChange", "onSizeChange"])
            ])
          ]),
          vue.createVNode(_component_el_dialog, {
            modelValue: dialogVisible.value,
            "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑资金账户" : "新增资金账户",
            width: "620px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[12] || (_cache[12] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
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
                    label: "账户名称",
                    prop: "name"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.name,
                        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.name = $event),
                        placeholder: "如 基本存款账户"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "账户类型" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_radio_group, {
                                modelValue: form.type,
                                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.type = $event)
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_radio, { value: "cash" }, {
                                    default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                                      vue.createTextVNode("现金", -1)
                                    ])]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_radio, { value: "bank" }, {
                                    default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                                      vue.createTextVNode("银行", -1)
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
                          vue.createVNode(_component_el_form_item, { label: "关联科目" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.accountCode,
                                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.accountCode = $event),
                                placeholder: "选择会计科目",
                                filterable: "",
                                clearable: "",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(cashAccountOptions.value, (acc) => {
                                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                                      key: acc.id,
                                      label: `${acc.code} ${acc.name}`,
                                      value: acc.code
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
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "开户行" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.bankName,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.bankName = $event)
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "银行账号" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.accountNo,
                                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.accountNo = $event)
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
                          vue.createVNode(_component_el_form_item, { label: "开户名称" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.accountName,
                                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.accountName = $event)
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
                                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.status = $event),
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
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.remark = $event),
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
  const BanksPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6da0091d"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("banks", {
    components: {
      BanksPage
    }
  });
})(Vue, ElementPlusIconsVue, axios, ElementPlus, Pinia);
