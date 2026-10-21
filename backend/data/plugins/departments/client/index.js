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
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const basicStore = useBasicStore();
      const loading = vue.ref(false);
      const saving = vue.ref(false);
      const keyword = vue.ref("");
      const tree = vue.ref([]);
      const selectData = vue.ref([]);
      const dialogVisible = vue.ref(false);
      const formRef = vue.ref();
      const initialForm = {
        id: "",
        name: "",
        parentId: null,
        manager: "",
        remark: "",
        status: 1
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        name: [{ required: true, message: "请输入部门名称", trigger: "blur" }]
      };
      async function load() {
        loading.value = true;
        try {
          tree.value = await departmentApi.tree({ keyword: keyword.value || void 0 });
          selectData.value = JSON.parse(JSON.stringify(tree.value));
          basicStore.refresh("departments");
        } finally {
          loading.value = false;
        }
      }
      function openCreate(parentId = null) {
        Object.assign(form, { ...initialForm, parentId });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      function onCreate() {
        openCreate();
      }
      function onCreateChild(row) {
        openCreate(row.id);
      }
      function onEdit(row) {
        Object.assign(form, {
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          manager: row.manager ?? "",
          remark: row.remark ?? "",
          status: row.status
        });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onRemove(row) {
        if (!await confirmDelete(`部门「${row.name}」`)) return;
        try {
          await departmentApi.remove(row.id);
          ok("删除成功");
          load();
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
          if (form.id) await departmentApi.update(form.id, payload);
          else await departmentApi.create(payload);
          ok(form.id ? "修改成功" : "新增成功");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_tree_select = vue.resolveComponent("el-tree-select");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createElementVNode("div", _hoisted_2, [
            vue.createElementVNode("div", _hoisted_3, [
              vue.createVNode(_component_el_input, {
                modelValue: keyword.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => keyword.value = $event),
                placeholder: "搜索部门编码 / 名称",
                clearable: "",
                style: { "width": "220px" },
                onKeyup: vue.withKeys(load, ["enter"]),
                onClear: load
              }, null, 8, ["modelValue"]),
              vue.createVNode(_component_el_button, {
                type: "primary",
                onClick: load
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Search))
                    ]),
                    _: 1
                  }),
                  _cache[9] || (_cache[9] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                onClick: _cache[1] || (_cache[1] = ($event) => {
                  keyword.value = "";
                  load();
                })
              }, {
                default: vue.withCtx(() => [..._cache[10] || (_cache[10] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }),
              _cache[12] || (_cache[12] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
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
                  _cache[11] || (_cache[11] = vue.createTextVNode("新增部门 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "department:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: tree.value,
              "row-key": "id",
              "default-expand-all": "",
              "tree-props": { children: "children" },
              "empty-text": "暂无部门"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "code",
                  label: "部门编码",
                  width: "140"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "name",
                  label: "部门名称",
                  "min-width": "200"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "manager",
                  label: "负责人",
                  width: "130"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "remark",
                  label: "备注",
                  "min-width": "180",
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
                  width: "180",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "success",
                      onClick: ($event) => onCreateChild(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[13] || (_cache[13] = [
                        vue.createTextVNode(" 新增下级 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "department:create"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[14] || (_cache[14] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "department:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "department:delete"]
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
            "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑部门" : "新增部门",
            width: "520px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[7] || (_cache[7] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
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
                  vue.createVNode(_component_el_form_item, {
                    label: "部门名称",
                    prop: "name"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.name,
                        "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.name = $event)
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "上级部门" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_tree_select, {
                        modelValue: form.parentId,
                        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.parentId = $event),
                        data: selectData.value,
                        props: { label: "name", value: "id", children: "children" },
                        "check-strictly": "",
                        clearable: "",
                        placeholder: "不选则为顶级部门",
                        style: { "width": "100%" }
                      }, null, 8, ["modelValue", "data"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "负责人" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.manager,
                        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.manager = $event)
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "状态" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_switch, {
                        modelValue: form.status,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.status = $event),
                        "active-value": 1,
                        "inactive-value": 0,
                        "active-text": "启用",
                        "inactive-text": "禁用"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.remark = $event),
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
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("departments", {
    components: {
      DepartmentsPage: _sfc_main
    }
  });
})(Vue, ElementPlusIconsVue, axios, ElementPlus, Pinia);
