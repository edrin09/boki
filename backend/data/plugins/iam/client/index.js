(function(vue, elementPlus, iconsVue, axios2, dayjs2) {
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
  const permissionApi = {
    list: () => get("/permissions"),
    tree: () => get("/permissions/tree"),
    menus: () => get("/permissions/menus"),
    create: (data) => post("/permissions", data),
    update: (id, data) => put(`/permissions/${id}`, data),
    remove: (id) => del(`/permissions/${id}`)
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
  function formatDate(value, pattern = "YYYY-MM-DD") {
    if (!value) return "";
    const d = dayjs2(value);
    return d.isValid() ? d.format(pattern) : "";
  }
  function formatDateTime(value) {
    return formatDate(value, "YYYY-MM-DD HH:mm:ss");
  }
  const _hoisted_1$2 = { class: "page" };
  const _hoisted_2$2 = { class: "page-card" };
  const _hoisted_3$2 = { class: "page-toolbar" };
  const _hoisted_4$1 = {
    key: 1,
    class: "cm-empty"
  };
  const _hoisted_5$1 = { class: "page-pagination" };
  const _sfc_main$2 = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => userApi.list(params),
        defaultParams: { page: 1, pageSize: 20, keyword: "" }
      });
      const roles = vue.ref([]);
      const companyOptions = vue.ref([]);
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const initialForm = {
        id: "",
        username: "",
        nickname: "",
        password: "123456",
        email: "",
        phone: "",
        status: 1,
        roleIds: [],
        companyIds: [],
        remark: ""
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        username: [{ required: true, message: "请输入登录账号", trigger: "blur" }],
        nickname: [{ required: true, message: "请输入姓名", trigger: "blur" }],
        password: [{ required: true, min: 6, message: "密码至少 6 位", trigger: "blur" }],
        roleIds: [{ required: true, type: "array", min: 1, message: "请至少选择一个角色", trigger: "change" }],
        email: [{ type: "email", message: "邮箱格式不正确", trigger: "blur" }]
      };
      async function loadRoles() {
        roles.value = await roleApi.options();
      }
      async function loadCompanyOptions(extra = []) {
        try {
          const mine = await authApi.companies();
          const seen = new Set(mine.map((c) => c.id));
          const orphan = extra.filter((c) => !seen.has(c.id));
          companyOptions.value = [
            ...mine.map((c) => ({ id: c.id, name: c.name, disabled: false })),
            ...orphan.map((c) => ({ id: c.id, name: c.name, disabled: true }))
          ];
        } catch {
        }
      }
      function onCreate() {
        Object.assign(form, { ...initialForm });
        loadCompanyOptions();
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onEdit(row) {
        const extra = (row.companyIds ?? []).map((id, i) => ({
          id,
          name: (row.companyNames ?? [])[i] ?? id
        }));
        await loadCompanyOptions(extra);
        Object.assign(form, {
          id: row.id,
          username: row.username,
          nickname: row.nickname,
          password: "",
          email: row.email ?? "",
          phone: row.phone ?? "",
          status: row.status,
          roleIds: [...row.roleIds ?? []],
          companyIds: [...row.companyIds ?? []],
          remark: row.remark ?? ""
        });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onToggleStatus(row) {
        const next = row.status === 1 ? 0 : 1;
        try {
          await userApi.updateStatus(row.id, next);
          ok(next === 1 ? "已启用" : "已禁用");
          load();
        } catch {
        }
      }
      async function onResetPassword(row) {
        try {
          const res = await elementPlus.ElMessageBox.prompt(
            `为用户「${row.username}」设置新密码（至少 6 位）`,
            "重置密码",
            {
              inputValue: "123456",
              inputType: "password",
              inputValidator: (v) => v && v.length >= 6 ? true : "密码至少 6 位"
            }
          );
          await userApi.resetPassword(row.id, res.value);
          ok("密码已重置");
        } catch {
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`用户「${row.username}」`)) return;
        try {
          await userApi.remove(row.id);
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
          if (form.id) {
            await userApi.update(form.id, {
              nickname: form.nickname,
              email: form.email || void 0,
              phone: form.phone || void 0,
              status: form.status,
              roleIds: form.roleIds,
              companyIds: form.companyIds,
              remark: form.remark || void 0
            });
          } else {
            await userApi.create({
              username: form.username,
              nickname: form.nickname,
              password: form.password,
              email: form.email || void 0,
              phone: form.phone || void 0,
              status: form.status,
              roleIds: form.roleIds,
              companyIds: form.companyIds,
              remark: form.remark || void 0
            });
          }
          ok(form.id ? "修改成功" : "新增成功");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      vue.onMounted(async () => {
        await loadRoles();
        await loadCompanyOptions();
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_checkbox = vue.resolveComponent("el-checkbox");
        const _component_el_checkbox_group = vue.resolveComponent("el-checkbox-group");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$2, [
          vue.createElementVNode("div", _hoisted_2$2, [
            vue.createElementVNode("div", _hoisted_3$2, [
              vue.createVNode(_component_el_input, {
                modelValue: vue.unref(query).keyword,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).keyword = $event),
                placeholder: "搜索账号 / 姓名 / 手机",
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
                  _cache[16] || (_cache[16] = vue.createTextVNode("新增用户 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "user:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无用户"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "username",
                  label: "登录账号",
                  width: "140"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "nickname",
                  label: "姓名",
                  width: "140"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "角色",
                  "min-width": "200"
                }, {
                  default: vue.withCtx(({ row }) => [
                    (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(row.roles, (r) => {
                      return vue.openBlock(), vue.createBlock(_component_el_tag, {
                        key: r.id,
                        size: "small",
                        class: "role-tag"
                      }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(vue.toDisplayString(r.name), 1)
                        ]),
                        _: 2
                      }, 1024);
                    }), 128))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "所属公司",
                  "min-width": "220",
                  "show-overflow-tooltip": ""
                }, {
                  default: vue.withCtx(({ row }) => [
                    (row.companyNames ?? []).length ? (vue.openBlock(true), vue.createElementBlock(vue.Fragment, { key: 0 }, vue.renderList(row.companyNames, (n) => {
                      return vue.openBlock(), vue.createBlock(_component_el_tag, {
                        key: n,
                        size: "small",
                        class: "role-tag"
                      }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(vue.toDisplayString(n), 1)
                        ]),
                        _: 2
                      }, 1024);
                    }), 128)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_4$1, "-"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "phone",
                  label: "手机号",
                  width: "140"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.phone || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "email",
                  label: "邮箱",
                  "min-width": "180",
                  "show-overflow-tooltip": ""
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.email || "-"), 1)
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
                  prop: "lastLoginAt",
                  label: "最后登录",
                  width: "170"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(vue.unref(formatDateTime)(row.lastLoginAt) || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "240",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "user:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "warning",
                      onClick: ($event) => onResetPassword(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[19] || (_cache[19] = [
                        vue.createTextVNode(" 重置密码 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "user:reset-password"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: row.status === 1 ? "info" : "success",
                      onClick: ($event) => onToggleStatus(row)
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.status === 1 ? "禁用" : "启用"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type", "onClick"])), [
                      [_directive_permission, "user:update"]
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
                      [_directive_permission, "user:delete"]
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
                "onUpdate:currentPage": _cache[1] || (_cache[1] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[2] || (_cache[2] = ($event) => vue.unref(query).pageSize = $event),
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
            "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑用户" : "新增用户",
            width: "600px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[12] || (_cache[12] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
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
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "登录账号",
                            prop: "username"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.username,
                                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.username = $event),
                                disabled: !!form.id
                              }, null, 8, ["modelValue", "disabled"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "姓名",
                            prop: "nickname"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.nickname,
                                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.nickname = $event)
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
                    label: "初始密码",
                    prop: "password"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.password,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.password = $event),
                        type: "password",
                        "show-password": ""
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_form_item, {
                    label: "角色",
                    prop: "roleIds"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.roleIds,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.roleIds = $event),
                        multiple: "",
                        placeholder: "选择角色",
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
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "记账公司",
                    prop: "companyIds"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_checkbox_group, {
                        modelValue: form.companyIds,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.companyIds = $event),
                        class: "company-access"
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(companyOptions.value, (c) => {
                            return vue.openBlock(), vue.createBlock(_component_el_checkbox, {
                              key: c.id,
                              value: c.id,
                              disabled: c.disabled
                            }, {
                              default: vue.withCtx(() => [
                                vue.createTextVNode(vue.toDisplayString(c.name), 1)
                              ]),
                              _: 2
                            }, 1032, ["value", "disabled"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"]),
                      _cache[21] || (_cache[21] = vue.createElementVNode("div", { class: "cm-tip" }, "勾选后该用户可登录并进入对应记账公司；灰色的为公司所有者/其他管理员维护的公司，仅展示不可修改。", -1))
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "手机号" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.phone,
                                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.phone = $event)
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "邮箱" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.email,
                                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.email = $event)
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
  const IamUsersPage = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-d5eb2ebd"]]);
  const _hoisted_1$1 = { class: "page" };
  const _hoisted_2$1 = { class: "page-card" };
  const _hoisted_3$1 = { class: "page-toolbar" };
  const _hoisted_4 = { class: "page-card" };
  const _hoisted_5 = { class: "page-toolbar" };
  const _hoisted_6 = { class: "code" };
  const _hoisted_7 = { class: "code" };
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const roles = vue.ref([]);
      const permissionTree = vue.ref([]);
      const current = vue.ref(null);
      const loading = vue.ref(false);
      const loadingTree = vue.ref(false);
      const treeRef = vue.ref();
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const initialForm = { id: "", code: "", name: "", description: "", sort: 0 };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        code: [{ required: true, message: "请输入角色标识", trigger: "blur" }],
        name: [{ required: true, message: "请输入角色名称", trigger: "blur" }]
      };
      async function loadRoles() {
        loading.value = true;
        try {
          roles.value = await roleApi.list();
          if (current.value) {
            const found = roles.value.find((r) => r.id === current.value.id);
            current.value = found ?? null;
          } else if (roles.value.length) {
            onSelect(roles.value[0]);
          }
        } finally {
          loading.value = false;
        }
      }
      async function loadPermissionTree() {
        loadingTree.value = true;
        try {
          permissionTree.value = await permissionApi.tree();
        } finally {
          loadingTree.value = false;
        }
      }
      function onSelect(row) {
        current.value = row;
        vue.nextTick(() => {
          treeRef.value?.setCheckedKeys(row?.permissionIds ?? []);
        });
      }
      function onCreate() {
        Object.assign(form, { ...initialForm });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      function onEdit() {
        if (!current.value) return;
        Object.assign(form, {
          id: current.value.id,
          code: current.value.code,
          name: current.value.name,
          description: current.value.description ?? "",
          sort: current.value.sort ?? 0
        });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onRemove() {
        if (!current.value) return;
        if (!await confirmDelete(`角色「${current.value.name}」`)) return;
        try {
          await roleApi.remove(current.value.id);
          current.value = null;
          ok("删除成功");
          loadRoles();
        } catch {
        }
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        saving.value = true;
        try {
          if (form.id) {
            await roleApi.update(form.id, {
              name: form.name,
              description: form.description || void 0,
              sort: form.sort
            });
          } else {
            await roleApi.create({ code: form.code, name: form.name, description: form.description || void 0, sort: form.sort });
          }
          ok(form.id ? "修改成功" : "新增成功");
          dialogVisible.value = false;
          loadRoles();
        } finally {
          saving.value = false;
        }
      }
      function collectCheckedIds() {
        if (!treeRef.value) return [];
        const checked = treeRef.value.getCheckedKeys(false);
        const halfChecked = treeRef.value.getHalfCheckedKeys();
        return Array.from(/* @__PURE__ */ new Set([...checked, ...halfChecked]));
      }
      async function onSavePermissions() {
        if (!current.value) return;
        const permissionIds = collectCheckedIds();
        try {
          await roleApi.assignPermissions(current.value.id, permissionIds);
          ok("权限已保存");
          loadRoles();
        } catch {
        }
      }
      vue.onMounted(async () => {
        await loadPermissionTree();
        loadRoles();
      });
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_tree = vue.resolveComponent("el-tree");
        const _component_el_empty = vue.resolveComponent("el-empty");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
          vue.createVNode(_component_el_row, { gutter: 12 }, {
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_col, {
                xs: 24,
                md: 9
              }, {
                default: vue.withCtx(() => [
                  vue.createElementVNode("div", _hoisted_2$1, [
                    vue.createElementVNode("div", _hoisted_3$1, [
                      _cache[7] || (_cache[7] = vue.createElementVNode("strong", null, "角色列表", -1)),
                      _cache[8] || (_cache[8] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        type: "primary",
                        size: "small",
                        onClick: onCreate
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_icon, null, {
                            default: vue.withCtx(() => [
                              vue.createVNode(vue.unref(iconsVue.Plus))
                            ]),
                            _: 1
                          }),
                          _cache[6] || (_cache[6] = vue.createTextVNode("新增 ", -1))
                        ]),
                        _: 1
                      })), [
                        [_directive_permission, "role:create"]
                      ])
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
                      data: roles.value,
                      "highlight-current-row": "",
                      size: "small",
                      onCurrentChange: onSelect
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_table_column, {
                          prop: "name",
                          label: "角色名称",
                          "min-width": "110"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "权限数",
                          width: "80",
                          align: "center",
                          prop: "permissionCount"
                        }),
                        vue.createVNode(_component_el_table_column, {
                          label: "类型",
                          width: "90",
                          align: "center"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createVNode(_component_el_tag, {
                              type: row.isSystem ? "info" : "success",
                              size: "small"
                            }, {
                              default: vue.withCtx(() => [
                                vue.createTextVNode(vue.toDisplayString(row.isSystem ? "内置" : "自定义"), 1)
                              ]),
                              _: 2
                            }, 1032, ["type"])
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }, 8, ["data"])), [
                      [_directive_loading, loading.value]
                    ])
                  ])
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_col, {
                xs: 24,
                md: 15
              }, {
                default: vue.withCtx(() => [
                  vue.createElementVNode("div", _hoisted_4, [
                    current.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                      vue.createElementVNode("div", _hoisted_5, [
                        vue.createElementVNode("div", null, [
                          vue.createElementVNode("strong", null, vue.toDisplayString(current.value.name), 1),
                          vue.createElementVNode("span", _hoisted_6, vue.toDisplayString(current.value.code), 1)
                        ]),
                        _cache[12] || (_cache[12] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
                        vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                          size: "small",
                          onClick: onEdit
                        }, {
                          default: vue.withCtx(() => [
                            vue.createVNode(_component_el_icon, null, {
                              default: vue.withCtx(() => [
                                vue.createVNode(vue.unref(iconsVue.Edit))
                              ]),
                              _: 1
                            }),
                            _cache[9] || (_cache[9] = vue.createTextVNode("编辑 ", -1))
                          ]),
                          _: 1
                        })), [
                          [_directive_permission, "role:update"]
                        ]),
                        vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                          size: "small",
                          type: "primary",
                          disabled: current.value.isSystem && current.value.code === "admin",
                          onClick: onSavePermissions
                        }, {
                          default: vue.withCtx(() => [
                            vue.createVNode(_component_el_icon, null, {
                              default: vue.withCtx(() => [
                                vue.createVNode(vue.unref(iconsVue.Check))
                              ]),
                              _: 1
                            }),
                            _cache[10] || (_cache[10] = vue.createTextVNode("保存权限 ", -1))
                          ]),
                          _: 1
                        }, 8, ["disabled"])), [
                          [_directive_permission, "role:assign-permission"]
                        ]),
                        vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                          size: "small",
                          type: "danger",
                          disabled: current.value.isSystem,
                          onClick: onRemove
                        }, {
                          default: vue.withCtx(() => [..._cache[11] || (_cache[11] = [
                            vue.createTextVNode(" 删除 ", -1)
                          ])]),
                          _: 1
                        }, 8, ["disabled"])), [
                          [_directive_permission, "role:delete"]
                        ])
                      ]),
                      current.value.description ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                        key: 0,
                        type: "info",
                        closable: false,
                        title: current.value.description,
                        class: "mb12"
                      }, null, 8, ["title"])) : vue.createCommentVNode("", true),
                      current.value.isSystem && current.value.code === "admin" ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                        key: 1,
                        type: "warning",
                        closable: false,
                        title: "超级管理员固定拥有系统全部权限，无需分配权限。",
                        class: "mb12"
                      })) : vue.createCommentVNode("", true),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_tree, {
                        ref_key: "treeRef",
                        ref: treeRef,
                        data: permissionTree.value,
                        "show-checkbox": "",
                        "node-key": "id",
                        props: { label: "name", children: "children" },
                        "default-checked-keys": current.value.permissionIds
                      }, {
                        default: vue.withCtx(({ data }) => [
                          vue.createElementVNode("span", null, [
                            vue.createTextVNode(vue.toDisplayString(data.name) + " ", 1),
                            data.type === "menu" ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                              key: 0,
                              size: "small",
                              type: "info"
                            }, {
                              default: vue.withCtx(() => [..._cache[13] || (_cache[13] = [
                                vue.createTextVNode("菜单", -1)
                              ])]),
                              _: 1
                            })) : vue.createCommentVNode("", true),
                            vue.createElementVNode("span", _hoisted_7, vue.toDisplayString(data.code), 1)
                          ])
                        ]),
                        _: 1
                      }, 8, ["data", "default-checked-keys"])), [
                        [_directive_loading, loadingTree.value]
                      ])
                    ], 64)) : (vue.openBlock(), vue.createBlock(_component_el_empty, {
                      key: 1,
                      description: "请从左侧选择一个角色"
                    }))
                  ])
                ]),
                _: 1
              })
            ]),
            _: 1
          }),
          vue.createVNode(_component_el_dialog, {
            modelValue: dialogVisible.value,
            "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑角色" : "新增角色",
            width: "520px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[4] || (_cache[4] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[14] || (_cache[14] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
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
                    label: "角色标识",
                    prop: "code"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.code,
                        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.code = $event),
                        disabled: !!form.id,
                        placeholder: "英文标识，如 auditor"
                      }, null, 8, ["modelValue", "disabled"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "角色名称",
                    prop: "name"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.name,
                        "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.name = $event)
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "描述" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.description,
                        "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.description = $event),
                        type: "textarea",
                        rows: 2
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "排序" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input_number, {
                        modelValue: form.sort,
                        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.sort = $event),
                        min: 0,
                        max: 999,
                        "controls-position": "right"
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
  const IamRolesPage = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-24ca947e"]]);
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-card" };
  const _hoisted_3 = { class: "page-toolbar" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const loading = vue.ref(false);
      const saving = vue.ref(false);
      const tree = vue.ref([]);
      const selectData = vue.ref([]);
      const dialogVisible = vue.ref(false);
      const formRef = vue.ref();
      const initialForm = {
        id: "",
        code: "",
        name: "",
        module: "",
        type: "action",
        parentId: null,
        path: "",
        sort: 0,
        remark: ""
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        code: [{ required: true, message: "请输入权限标识", trigger: "blur" }],
        name: [{ required: true, message: "请输入权限名称", trigger: "blur" }]
      };
      async function load() {
        loading.value = true;
        try {
          tree.value = await permissionApi.tree();
          selectData.value = JSON.parse(JSON.stringify(tree.value));
        } finally {
          loading.value = false;
        }
      }
      function onCreate(parent) {
        Object.assign(form, { ...initialForm });
        if (parent) {
          form.parentId = parent.id;
          form.type = "action";
          if (!form.module) form.module = parent.module;
        }
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      function onEdit(row) {
        Object.assign(form, {
          id: row.id,
          code: row.code,
          name: row.name,
          module: row.module ?? "",
          type: row.type,
          parentId: row.parentId,
          path: row.path ?? "",
          sort: row.sort ?? 0,
          remark: row.remark ?? ""
        });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onRemove(row) {
        if (!await confirmDelete(`权限「${row.name}」`)) return;
        try {
          await permissionApi.remove(row.id);
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
          const payload = {
            code: form.code,
            name: form.name,
            module: form.module || void 0,
            type: form.type,
            path: form.path || void 0,
            sort: form.sort,
            remark: form.remark || void 0
          };
          if (form.id) {
            await permissionApi.update(form.id, payload);
          } else {
            await permissionApi.create({ ...payload, parentId: form.parentId ?? void 0 });
          }
          ok(form.id ? "修改成功" : "新增成功");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_radio = vue.resolveComponent("el-radio");
        const _component_el_radio_group = vue.resolveComponent("el-radio-group");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_tree_select = vue.resolveComponent("el-tree-select");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createElementVNode("div", _hoisted_2, [
            vue.createElementVNode("div", _hoisted_3, [
              _cache[12] || (_cache[12] = vue.createElementVNode("strong", null, "权限列表", -1)),
              _cache[13] || (_cache[13] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                type: "primary",
                size: "small",
                onClick: _cache[0] || (_cache[0] = ($event) => onCreate())
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Plus))
                    ]),
                    _: 1
                  }),
                  _cache[11] || (_cache[11] = vue.createTextVNode("新增 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "permission:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: tree.value,
              "row-key": "id",
              "default-expand-all": "",
              "tree-props": { children: "children" },
              "empty-text": "暂无权限"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "code",
                  label: "权限标识",
                  width: "240"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "name",
                  label: "权限名称",
                  width: "200"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "类型",
                  width: "100"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.type === "menu" ? "primary" : "info",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.type === "menu" ? "菜单" : "操作"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "module",
                  label: "模块",
                  width: "130"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "path",
                  label: "路由地址",
                  "min-width": "200"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "190",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "success",
                      onClick: ($event) => onCreate(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[14] || (_cache[14] = [
                        vue.createTextVNode("新增子级", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "permission:create"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "permission:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "permission:delete"]
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
            "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑权限" : "新增权限",
            width: "560px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[9] || (_cache[9] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[19] || (_cache[19] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[20] || (_cache[20] = [
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
                    label: "权限标识",
                    prop: "code"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.code,
                        "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.code = $event),
                        placeholder: "如 voucher:create"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "权限名称",
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
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "所属模块" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.module,
                                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.module = $event),
                                placeholder: "如 voucher"
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "类型" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_radio_group, {
                                modelValue: form.type,
                                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.type = $event)
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_radio, { value: "menu" }, {
                                    default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
                                      vue.createTextVNode("菜单", -1)
                                    ])]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_radio, { value: "action" }, {
                                    default: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                                      vue.createTextVNode("操作", -1)
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
                      })
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "上级权限" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_tree_select, {
                        modelValue: form.parentId,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.parentId = $event),
                        data: selectData.value,
                        props: { label: "name", value: "id", children: "children" },
                        "check-strictly": "",
                        clearable: "",
                        placeholder: "不选则为顶级",
                        style: { "width": "100%" }
                      }, null, 8, ["modelValue", "data"])
                    ]),
                    _: 1
                  }),
                  form.type === "menu" ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                    key: 0,
                    label: "路由地址"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.path,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.path = $event),
                        placeholder: "如 /voucher/list"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_form_item, { label: "排序" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input_number, {
                        modelValue: form.sort,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.sort = $event),
                        min: 0,
                        max: 999,
                        "controls-position": "right"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.remark = $event),
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
  registerPlugin("iam", {
    components: {
      IamUsersPage,
      IamRolesPage,
      IamPermissionsPage: _sfc_main
    }
  });
})(Vue, ElementPlus, ElementPlusIconsVue, axios, dayjs);
