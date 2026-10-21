(function(vue, vueRouter, dayjs2, axios2, elementPlus, pinia, iconsVue, XLSX2) {
  "use strict";
  function _interopNamespaceDefault(e) {
    const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
    if (e) {
      for (const k in e) {
        if (k !== "default") {
          const d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: () => e[k]
          });
        }
      }
    }
    n.default = e;
    return Object.freeze(n);
  }
  const XLSX__namespace = /* @__PURE__ */ _interopNamespaceDefault(XLSX2);
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
  async function download(url, params, filename) {
    const res = await service.get(url, { params, responseType: "blob" });
    const blob = new Blob([res.data]);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename ?? "download";
    link.click();
    URL.revokeObjectURL(link.href);
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
  const systemApi = {
    dashboard: () => get("/system/dashboard"),
    info: () => get("/system/info"),
    company: () => get("/system/company"),
    saveCompany: (data) => put("/system/company", data),
    logs: (params) => get("/system/logs", params),
    cleanLogs: (data) => post("/system/logs/clean", data),
    backups: () => get("/system/backups"),
    createBackup: () => post("/system/backups"),
    restore: (data) => post("/system/backups/restore", data),
    removeBackup: (filename) => del(`/system/backups/${encodeURIComponent(filename)}`),
    downloadBackup: (filename) => download("/system/backups/download", { filename }, filename),
    // ============ AI 模型设置 ============
    aiConfig: () => get("/ai/config"),
    saveAiConfig: (data) => put("/ai/config", data),
    testAi: () => post("/ai/test"),
    aiStatus: () => get("/ai/status")
  };
  const reportApi = {
    balanceSheet: (params) => get("/reports/balance-sheet", params),
    profitLoss: (params) => get("/reports/profit-loss", params),
    ledger: (params) => get("/reports/ledger", params),
    cashFlow: (params) => get("/reports/cash-flow", params),
    expenseAnalysis: (params) => get("/reports/expense-analysis", params),
    monthlyClose: (params) => get("/reports/monthly-close", params),
    overview: (params) => get("/reports/overview", params)
  };
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
  function formatAmount(value) {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  function formatDate(value, pattern = "YYYY-MM-DD") {
    if (!value) return "";
    const d = dayjs2(value);
    return d.isValid() ? d.format(pattern) : "";
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
  const _hoisted_1$6 = { class: "page" };
  const _hoisted_2$6 = { class: "welcome__inner" };
  const _hoisted_3$6 = { class: "welcome__hello" };
  const _hoisted_4$6 = { class: "welcome__sub" };
  const _hoisted_5$6 = { class: "welcome__quick" };
  const _hoisted_6$6 = { class: "stat-card__body" };
  const _hoisted_7$6 = { class: "stat-card__value" };
  const _hoisted_8$6 = { class: "stat-card__label" };
  const _hoisted_9$6 = { class: "overview__header" };
  const _hoisted_10$5 = { class: "overview-metric" };
  const _hoisted_11$4 = { class: "overview-metric__label" };
  const _hoisted_12$3 = { class: "quick-grid" };
  const _hoisted_13$3 = ["onClick"];
  const _hoisted_14$2 = { class: "quick-item__text" };
  const _sfc_main$7 = /* @__PURE__ */ vue.defineComponent({
    __name: "dashboard",
    setup(__props) {
      const router = vueRouter.useRouter();
      const userStore = useUserStore();
      const period = vue.ref(currentPeriod());
      const stats = vue.ref({
        accountCount: 0,
        partnerCount: 0,
        voucherCount: 0,
        draftCount: 0,
        todayVoucherCount: 0,
        monthVoucherCount: 0,
        companyCount: 0
      });
      const overview = vue.ref(null);
      const overviewMetrics = vue.computed(() => {
        const m = overview.value?.month ?? {};
        const b = overview.value?.balance ?? {};
        const metrics = [
          {
            key: "income",
            label: "本月收入",
            value: formatAmount(m.income),
            class: "overview-metric__value--income"
          },
          {
            key: "expense",
            label: "本月支出",
            value: formatAmount(m.expense),
            class: "overview-metric__value--expense"
          },
          {
            key: "netProfit",
            label: "本月净利润",
            value: formatAmount(m.netProfit),
            class: (m.netProfit ?? 0) >= 0 ? "overview-metric__value--income" : "overview-metric__value--expense"
          },
          {
            key: "taxPaid",
            label: "本期实缴税额",
            value: formatAmount(m.taxPaid)
          },
          {
            key: "cash",
            label: "现金余额",
            value: formatAmount(b.cash)
          },
          {
            key: "ar",
            label: "应收账款",
            value: formatAmount(b.receivable),
            class: (b.receivable ?? 0) > 0 ? "overview-metric__value--expense" : ""
          }
        ];
        return metrics;
      });
      const greeting = vue.computed(() => {
        const hour = dayjs2().hour();
        if (hour < 6) return "夜深了";
        if (hour < 12) return "早上好";
        if (hour < 14) return "中午好";
        if (hour < 18) return "下午好";
        return "晚上好";
      });
      const cards = vue.computed(() => [
        {
          key: "voucher",
          label: "凭证总数",
          value: stats.value.voucherCount,
          icon: "Tickets",
          color: "#2563eb"
        },
        {
          key: "month",
          label: "本月凭证",
          value: stats.value.monthVoucherCount,
          icon: "Calendar",
          color: "#059669"
        },
        {
          key: "today",
          label: "今日凭证",
          value: stats.value.todayVoucherCount,
          icon: "Clock",
          color: "#7c3aed"
        },
        {
          key: "draft",
          label: "待审核",
          value: stats.value.draftCount,
          icon: "Warning",
          color: "#d97706",
          to: "/voucher/list"
        },
        {
          key: "account",
          label: "会计科目",
          value: stats.value.accountCount,
          icon: "FolderOpened",
          color: "#0ea5e9",
          to: "/settings/accounts"
        },
        {
          key: "partner",
          label: "往来单位",
          value: stats.value.partnerCount,
          icon: "User",
          color: "#db2777",
          to: "/settings/partners"
        }
      ]);
      const quickLinks = vue.computed(() => {
        const all = [
          // AI 记账置顶，作为默认的记账路径
          { title: "AI 上传记账", path: "/receipts/workbench", icon: "MagicStick", permission: "receipts:workbench" },
          { title: "手动录入凭证", path: "/voucher/create", icon: "EditPen", permission: "voucher:create" },
          { title: "凭证列表", path: "/voucher/list", icon: "Tickets", permission: "voucher:list" },
          { title: "现金银行", path: "/cash-bank", icon: "Money", permission: "cash-bank" },
          { title: "应收应付", path: "/ar-ap", icon: "Connection", permission: "ar-ap" },
          { title: "科目余额表", path: "/books/balance", icon: "Notebook", permission: "books:balance" },
          { title: "资产负债表", path: "/reports/balance-sheet", icon: "DataAnalysis", permission: "reports:balance-sheet" },
          { title: "利润表", path: "/reports/profit-loss", icon: "TrendCharts", permission: "reports:profit-loss" },
          { title: "会计科目", path: "/settings/accounts", icon: "FolderOpened", permission: "settings:account" }
        ];
        const perms = userStore.profile?.permissions ?? [];
        return all.filter((item) => perms.includes(item.permission));
      });
      vue.onMounted(async () => {
        try {
          stats.value = await systemApi.dashboard();
        } catch (error) {
          console.warn("加载工作台数据失败", error);
        }
        try {
          overview.value = await reportApi.overview({ endPeriod: period.value });
        } catch (error) {
          console.warn("加载经营看板失败", error);
        }
      });
      return (_ctx, _cache) => {
        const _component_EditPen = vue.resolveComponent("EditPen");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_DataAnalysis = vue.resolveComponent("DataAnalysis");
        const _component_el_card = vue.resolveComponent("el-card");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_link = vue.resolveComponent("el-link");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _directive_permission = vue.resolveDirective("permission");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$6, [
          vue.createVNode(_component_el_card, {
            shadow: "never",
            class: "welcome"
          }, {
            default: vue.withCtx(() => [
              vue.createElementVNode("div", _hoisted_2$6, [
                vue.createElementVNode("div", null, [
                  vue.createElementVNode("div", _hoisted_3$6, vue.toDisplayString(greeting.value) + "，" + vue.toDisplayString(vue.unref(userStore).nickname), 1),
                  vue.createElementVNode("div", _hoisted_4$6, " 当前公司：" + vue.toDisplayString(vue.unref(userStore).companyName || "未选择公司") + " · " + vue.toDisplayString(vue.unref(periodLabel)(period.value)) + " · 共 " + vue.toDisplayString(stats.value.voucherCount) + " 张凭证 · " + vue.toDisplayString(stats.value.accountCount) + " 个会计科目 ", 1)
                ]),
                vue.createElementVNode("div", _hoisted_5$6, [
                  vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                    type: "primary",
                    onClick: _cache[0] || (_cache[0] = ($event) => vue.unref(router).push("/voucher/create"))
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_icon, null, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_EditPen)
                        ]),
                        _: 1
                      }),
                      _cache[4] || (_cache[4] = vue.createTextVNode("录入凭证 ", -1))
                    ]),
                    _: 1
                  })), [
                    [_directive_permission, "voucher:create"]
                  ]),
                  vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                    onClick: _cache[1] || (_cache[1] = ($event) => vue.unref(router).push("/books/trial-balance"))
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_icon, null, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_DataAnalysis)
                        ]),
                        _: 1
                      }),
                      _cache[5] || (_cache[5] = vue.createTextVNode("试算平衡 ", -1))
                    ]),
                    _: 1
                  })), [
                    [_directive_permission, "books:trial-balance"]
                  ])
                ])
              ])
            ]),
            _: 1
          }),
          vue.createVNode(_component_el_row, {
            gutter: 12,
            class: "stat-row"
          }, {
            default: vue.withCtx(() => [
              (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(cards.value, (card) => {
                return vue.openBlock(), vue.createBlock(_component_el_col, {
                  key: card.key,
                  xs: 12,
                  sm: 8,
                  md: 4
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_card, {
                      shadow: "hover",
                      class: "stat-card",
                      onClick: ($event) => card.to && vue.unref(router).push(card.to)
                    }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("div", {
                          class: "stat-card__icon",
                          style: vue.normalizeStyle({ background: card.color })
                        }, [
                          vue.createVNode(_component_el_icon, null, {
                            default: vue.withCtx(() => [
                              (vue.openBlock(), vue.createBlock(vue.resolveDynamicComponent(card.icon)))
                            ]),
                            _: 2
                          }, 1024)
                        ], 4),
                        vue.createElementVNode("div", _hoisted_6$6, [
                          vue.createElementVNode("div", _hoisted_7$6, vue.toDisplayString(card.value), 1),
                          vue.createElementVNode("div", _hoisted_8$6, vue.toDisplayString(card.label), 1)
                        ])
                      ]),
                      _: 2
                    }, 1032, ["onClick"])
                  ]),
                  _: 2
                }, 1024);
              }), 128))
            ]),
            _: 1
          }),
          vue.createVNode(_component_el_card, {
            shadow: "never",
            class: "overview"
          }, {
            header: vue.withCtx(() => [
              vue.createElementVNode("div", _hoisted_9$6, [
                vue.createElementVNode("span", null, "经营看板（" + vue.toDisplayString(vue.unref(periodLabel)(period.value)) + "）", 1),
                vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_link, {
                  type: "primary",
                  onClick: _cache[2] || (_cache[2] = ($event) => vue.unref(router).push("/reports/monthly-close"))
                }, {
                  default: vue.withCtx(() => [..._cache[6] || (_cache[6] = [
                    vue.createTextVNode(" 一键月结 ", -1)
                  ])]),
                  _: 1
                })), [
                  [_directive_permission, "reports:monthly-close"]
                ])
              ])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_row, { gutter: 12 }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(overviewMetrics.value, (m) => {
                    return vue.openBlock(), vue.createBlock(_component_el_col, {
                      key: m.key,
                      xs: 12,
                      sm: 8,
                      md: 4
                    }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("div", _hoisted_10$5, [
                          vue.createElementVNode("div", _hoisted_11$4, vue.toDisplayString(m.label), 1),
                          vue.createElementVNode("div", {
                            class: vue.normalizeClass(["overview-metric__value", m.class])
                          }, vue.toDisplayString(m.value), 3)
                        ])
                      ]),
                      _: 2
                    }, 1024);
                  }), 128))
                ]),
                _: 1
              }),
              overview.value?.pendingReceipts ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                key: 0,
                type: "warning",
                closable: false,
                "show-icon": "",
                class: "overview__alert",
                title: `AI 已识别 ${overview.value.pendingReceipts} 张单据，凭证待你确认入账`
              }, {
                default: vue.withCtx(() => [
                  vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                    size: "small",
                    onClick: _cache[3] || (_cache[3] = ($event) => vue.unref(router).push("/receipts/workbench"))
                  }, {
                    default: vue.withCtx(() => [..._cache[7] || (_cache[7] = [
                      vue.createTextVNode(" 去确认入账 ", -1)
                    ])]),
                    _: 1
                  })), [
                    [_directive_permission, "receipts:workbench"]
                  ])
                ]),
                _: 1
              }, 8, ["title"])) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }),
          vue.createVNode(_component_el_row, {
            gutter: 12,
            class: "mt12"
          }, {
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_col, {
                xs: 24,
                md: 12
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_card, {
                    shadow: "never",
                    header: "快捷入口"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createElementVNode("div", _hoisted_12$3, [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(quickLinks.value, (item) => {
                          return vue.openBlock(), vue.createElementBlock("div", {
                            key: item.path,
                            class: "quick-item",
                            onClick: ($event) => vue.unref(router).push(item.path)
                          }, [
                            vue.createVNode(_component_el_icon, { class: "quick-item__icon" }, {
                              default: vue.withCtx(() => [
                                (vue.openBlock(), vue.createBlock(vue.resolveDynamicComponent(item.icon)))
                              ]),
                              _: 2
                            }, 1024),
                            vue.createElementVNode("span", _hoisted_14$2, vue.toDisplayString(item.title), 1)
                          ], 8, _hoisted_13$3);
                        }), 128))
                      ])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              vue.createVNode(_component_el_col, {
                xs: 24,
                md: 12
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_card, {
                    shadow: "never",
                    header: "使用提示"
                  }, {
                    default: vue.withCtx(() => [..._cache[8] || (_cache[8] = [
                      vue.createElementVNode("ul", { class: "tips" }, [
                        vue.createElementVNode("li", null, "日常记账首选「AI 智能记账 → 上传记账」：拖入发票、工资表、银行对账单，AI 自动识别并生成借贷平衡的凭证，你只需核对后点一次「确认入账」。"),
                        vue.createElementVNode("li", null, "AI 拿不准的单据会标出原因并留在待确认，可手工调整科目或改用「凭证管理 → 手动录入」。"),
                        vue.createElementVNode("li", null, "凭证保存为草稿后需「审核」，已审核凭证才会计入账簿与报表。"),
                        vue.createElementVNode("li", null, "收付款业务建议使用「资金往来 → 现金银行」，系统会自动生成记账凭证。"),
                        vue.createElementVNode("li", null, "客户/供应商往来请使用「应收应付」核销，便于对账与余额查询。")
                      ], -1)
                    ])]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          })
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
  const DashboardPage = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-f87eafc0"]]);
  function exportExcel(options) {
    const { filename, sheetName = "Sheet1", columns, rows, summary, title, subtitle } = options;
    const aoa = [];
    if (title) aoa.push([title]);
    if (subtitle) aoa.push([subtitle]);
    if (title || subtitle) aoa.push([]);
    aoa.push(columns.map((c) => c.title));
    rows.forEach((row, index) => {
      aoa.push(
        columns.map((col) => {
          if (col.format) return col.format(row, index);
          const raw = getByPath(row, col.prop);
          if (col.amount) return Number(raw ?? 0);
          return raw ?? "";
        })
      );
    });
    if (summary) {
      aoa.push([]);
      aoa.push(
        columns.map((col) => {
          if (col.prop === "__label") return "合计";
          const v = summary[col.prop];
          if (v === void 0) return "";
          return v;
        })
      );
    }
    const ws = XLSX__namespace.utils.aoa_to_sheet(aoa);
    ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 14 }));
    const wb = XLSX__namespace.utils.book_new();
    XLSX__namespace.utils.book_append_sheet(wb, ws, sheetName);
    XLSX__namespace.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
  }
  function getByPath(obj, path) {
    if (!obj || !path) return void 0;
    return path.split(".").reduce((acc, key) => acc == null ? acc : acc[key], obj);
  }
  const _sfc_main$6 = /* @__PURE__ */ vue.defineComponent({
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
  const _hoisted_1$5 = { class: "page" };
  const _hoisted_2$5 = { class: "page-card" };
  const _hoisted_3$5 = { class: "page-toolbar" };
  const _hoisted_4$5 = { class: "report-title" };
  const _hoisted_5$5 = { class: "report-title__meta" };
  const _hoisted_6$5 = { class: "report-table" };
  const _hoisted_7$5 = { class: "amount text-right" };
  const _hoisted_8$5 = { class: "amount text-right" };
  const _hoisted_9$5 = { class: "report-table__total" };
  const _hoisted_10$4 = { class: "amount text-right" };
  const _hoisted_11$3 = { class: "amount text-right" };
  const _sfc_main$5 = /* @__PURE__ */ vue.defineComponent({
    __name: "balance-sheet",
    setup(__props) {
      const period = vue.ref(currentPeriod());
      const loading = vue.ref(false);
      const data = vue.ref(null);
      const assetRows = vue.computed(() => {
        const section = data.value?.sections?.find((s) => s.key === "asset");
        if (!section) return [];
        return [
          ...section.lines.map((l) => ({ label: l.name, amount: l.amount, level: l.level })),
          { label: "资产总计", amount: section.total, level: 0, bold: true }
        ];
      });
      const rightRows = vue.computed(() => {
        const liability = data.value?.sections?.find((s) => s.key === "liability");
        const equity = data.value?.sections?.find((s) => s.key === "equity");
        const rows = [];
        if (liability) {
          rows.push({ label: "流动负债：", amount: null, level: 0, group: true });
          rows.push(...liability.lines.map((l) => ({ label: l.name, amount: l.amount, level: l.level })));
          rows.push({ label: "负债合计", amount: liability.total, level: 0, bold: true });
        }
        if (equity) {
          rows.push({ label: "所有者权益：", amount: null, level: 0, group: true });
          rows.push(...equity.lines.map((l) => ({ label: l.name, amount: l.amount, level: l.level })));
          rows.push({ label: "所有者权益合计", amount: equity.total, level: 0, bold: true });
        }
        rows.push({
          label: "负债和所有者权益总计",
          amount: data.value?.totals?.totalLiabilityEquity,
          level: 0,
          bold: true
        });
        return rows;
      });
      function indentClass(row) {
        if (!row) return "";
        if (row.bold) return "report-table__total";
        if (row.group) return "";
        return row.level === 2 ? "report-table__indent-2" : "report-table__indent-1";
      }
      function amountCell(row) {
        if (!row || row.amount === null || row.amount === void 0) return "";
        return row.amount ? formatAmount(row.amount) : "";
      }
      async function load() {
        loading.value = true;
        try {
          const [year] = [Math.floor(period.value / 100)];
          data.value = await reportApi.balanceSheet({ endPeriod: period.value, fiscalYear: year });
        } finally {
          loading.value = false;
        }
      }
      vue.watch(period, load);
      function onExport() {
        if (!data.value) {
          elementPlus.ElMessage.warning("请先查询数据");
          return;
        }
        const rows = [];
        for (const s of data.value.sections) {
          for (const l of s.lines) {
            rows.push({ section: s.title, code: l.code, name: l.name, amount: l.amount });
          }
          rows.push({ section: s.title, code: "", name: `${s.title}合计`, amount: s.total, bold: true });
        }
        exportExcel({
          filename: `资产负债表_${period.value}.xlsx`,
          sheetName: "资产负债表",
          title: `资产负债表（${formatDate(data.value.date)}）`,
          columns: [
            { title: "类别", prop: "section", width: 14 },
            { title: "编码", prop: "code", width: 12 },
            { title: "项目", prop: "name", width: 30 },
            { title: "期末余额", prop: "amount", width: 18, amount: true }
          ],
          rows
        });
        elementPlus.ElMessage.success("导出成功");
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$5, [
          vue.createElementVNode("div", _hoisted_2$5, [
            vue.createElementVNode("div", _hoisted_3$5, [
              _cache[3] || (_cache[3] = vue.createElementVNode("span", { class: "label" }, "资产负债表日", -1)),
              vue.createVNode(_sfc_main$6, {
                modelValue: period.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => period.value = $event),
                width: "150px"
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
                  _cache[1] || (_cache[1] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }),
              _cache[4] || (_cache[4] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              data.value ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                key: 0,
                type: data.value.balanced ? "success" : "warning",
                size: "default"
              }, {
                default: vue.withCtx(() => [
                  vue.createTextVNode(vue.toDisplayString(data.value.balanced ? "已平衡" : `差额 ${vue.unref(formatAmount)(data.value.difference)}（未结转损益）`), 1)
                ]),
                _: 1
              }, 8, ["type"])) : vue.createCommentVNode("", true),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[2] || (_cache[2] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              })
            ]),
            vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", null, [
              data.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createElementVNode("div", _hoisted_4$5, [
                  _cache[5] || (_cache[5] = vue.createElementVNode("h2", null, "资产负债表", -1)),
                  vue.createElementVNode("div", _hoisted_5$5, " 编制单位：—    " + vue.toDisplayString(vue.unref(formatDate)(data.value.date)), 1),
                  _cache[6] || (_cache[6] = vue.createElementVNode("div", { class: "report-title__unit" }, "单位：元", -1))
                ]),
                vue.createElementVNode("table", _hoisted_6$5, [
                  _cache[9] || (_cache[9] = vue.createElementVNode("thead", null, [
                    vue.createElementVNode("tr", null, [
                      vue.createElementVNode("th", { style: { "width": "38%" } }, "资产"),
                      vue.createElementVNode("th", { style: { "width": "12%" } }, "期末余额"),
                      vue.createElementVNode("th", { style: { "width": "38%" } }, "负债和所有者权益"),
                      vue.createElementVNode("th", { style: { "width": "12%" } }, "期末余额")
                    ])
                  ], -1)),
                  vue.createElementVNode("tbody", null, [
                    (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(Math.max(assetRows.value.length, rightRows.value.length), (index) => {
                      return vue.openBlock(), vue.createElementBlock("tr", { key: index }, [
                        vue.createElementVNode("td", {
                          class: vue.normalizeClass(indentClass(assetRows.value[index - 1]))
                        }, vue.toDisplayString(assetRows.value[index - 1]?.label ?? ""), 3),
                        vue.createElementVNode("td", _hoisted_7$5, vue.toDisplayString(amountCell(assetRows.value[index - 1])), 1),
                        vue.createElementVNode("td", {
                          class: vue.normalizeClass(indentClass(rightRows.value[index - 1]))
                        }, vue.toDisplayString(rightRows.value[index - 1]?.label ?? ""), 3),
                        vue.createElementVNode("td", _hoisted_8$5, vue.toDisplayString(amountCell(rightRows.value[index - 1])), 1)
                      ]);
                    }), 128)),
                    vue.createElementVNode("tr", _hoisted_9$5, [
                      _cache[7] || (_cache[7] = vue.createElementVNode("td", null, "资产总计", -1)),
                      vue.createElementVNode("td", _hoisted_10$4, vue.toDisplayString(vue.unref(formatAmount)(data.value.totals.totalAssets)), 1),
                      _cache[8] || (_cache[8] = vue.createElementVNode("td", null, "负债和所有者权益总计", -1)),
                      vue.createElementVNode("td", _hoisted_11$3, vue.toDisplayString(vue.unref(formatAmount)(data.value.totals.totalLiabilityEquity)), 1)
                    ])
                  ])
                ]),
                vue.createVNode(_component_el_alert, {
                  type: "info",
                  closable: false,
                  "show-icon": "",
                  class: "mt12",
                  title: data.value.note
                }, null, 8, ["title"])
              ], 64)) : vue.createCommentVNode("", true)
            ])), [
              [_directive_loading, loading.value]
            ])
          ])
        ]);
      };
    }
  });
  const ReportBalanceSheetPage = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-d5ac74fc"]]);
  const _hoisted_1$4 = { class: "page" };
  const _hoisted_2$4 = { class: "page-card" };
  const _hoisted_3$4 = { class: "page-toolbar" };
  const _hoisted_4$4 = { class: "report-title" };
  const _hoisted_5$4 = { class: "report-title__meta" };
  const _hoisted_6$4 = { class: "report-table" };
  const _hoisted_7$4 = { class: "amount text-right" };
  const _hoisted_8$4 = { class: "amount text-right" };
  const _hoisted_9$4 = { class: "text-muted" };
  const _sfc_main$4 = /* @__PURE__ */ vue.defineComponent({
    __name: "profit-loss",
    setup(__props) {
      const startPeriod = vue.ref(currentPeriod());
      const endPeriod = vue.ref(currentPeriod());
      const loading = vue.ref(false);
      const data = vue.ref(null);
      const SUMMARY_KEYS = [
        { key: "operatingRevenue", title: "一、营业收入", bold: true },
        { key: "operatingCost", title: "减：营业成本" },
        { key: "taxAndSurcharge", title: "减：税金及附加" },
        { key: "sellingExpense", title: "减：销售费用" },
        { key: "adminExpense", title: "减：管理费用" },
        { key: "rdExpense", title: "减：研发费用" },
        { key: "financialExpense", title: "减：财务费用" },
        { key: "investmentIncome", title: "加：投资收益" },
        { key: "operatingProfit", title: "二、营业利润", bold: true },
        { key: "nonOperatingIncome", title: "加：营业外收入" },
        { key: "nonOperatingExpense", title: "减：营业外支出" },
        { key: "totalProfit", title: "三、利润总额", bold: true },
        { key: "incomeTax", title: "减：所得税费用" },
        { key: "netProfit", title: "四、净利润", bold: true }
      ];
      const displayRows = vue.computed(() => {
        if (!data.value) return [];
        const cur = data.value.currentPeriod?.totals ?? {};
        const ytd = data.value.yearToDate?.totals ?? {};
        const rows = [];
        for (const item of SUMMARY_KEYS) {
          const curVal = Number(cur[item.key] ?? 0);
          const ytdVal = Number(ytd[item.key] ?? 0);
          if (!curVal && !ytdVal && !item.bold) continue;
          rows.push({
            key: item.key,
            title: item.title,
            current: curVal,
            ytd: ytdVal,
            bold: item.bold,
            indent: !item.bold,
            remark: ""
          });
        }
        const detail = (data.value.sections ?? []).filter((s) => s.lines.length).flatMap((s) => s.lines.map((l) => ({ ...l, section: s.title })));
        rows.unshift({
          key: "__detail__",
          title: "明细科目",
          bold: true,
          current: 0,
          ytd: 0,
          indent: false,
          children: detail
        });
        return rows;
      });
      async function load() {
        loading.value = true;
        try {
          const [year] = [Math.floor(endPeriod.value / 100)];
          data.value = await reportApi.profitLoss({
            startPeriod: startPeriod.value,
            endPeriod: endPeriod.value,
            fiscalYear: year
          });
        } finally {
          loading.value = false;
        }
      }
      vue.watch([startPeriod, endPeriod], load);
      function onExport() {
        if (!data.value) {
          elementPlus.ElMessage.warning("请先查询数据");
          return;
        }
        const rows = [];
        for (const s of data.value.sections ?? []) {
          for (const l of s.lines ?? []) {
            rows.push({ section: s.title, name: l.name, code: l.code, amount: l.amount });
          }
        }
        for (const item of SUMMARY_KEYS) {
          rows.push({
            section: "汇总",
            name: item.title,
            code: "",
            current: Number(data.value.currentPeriod?.totals?.[item.key] ?? 0),
            ytd: Number(data.value.yearToDate?.totals?.[item.key] ?? 0),
            bold: true
          });
        }
        exportExcel({
          filename: `利润表_${endPeriod.value}.xlsx`,
          sheetName: "利润表",
          title: `利润表（${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}）`,
          columns: [
            { title: "类别", prop: "section", width: 20 },
            { title: "编码", prop: "code", width: 12 },
            { title: "项目", prop: "name", width: 30 },
            { title: "本期金额", prop: "current", width: 16, amount: true },
            { title: "本年累计", prop: "ytd", width: 16, amount: true }
          ],
          rows
        });
        elementPlus.ElMessage.success("导出成功");
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$4, [
          vue.createElementVNode("div", _hoisted_2$4, [
            vue.createElementVNode("div", _hoisted_3$4, [
              vue.createVNode(_sfc_main$6, {
                modelValue: startPeriod.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => startPeriod.value = $event),
                width: "140px"
              }, null, 8, ["modelValue"]),
              _cache[4] || (_cache[4] = vue.createElementVNode("span", { class: "sep" }, "至", -1)),
              vue.createVNode(_sfc_main$6, {
                modelValue: endPeriod.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => endPeriod.value = $event),
                width: "140px"
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
                  _cache[2] || (_cache[2] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }),
              _cache[5] || (_cache[5] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[3] || (_cache[3] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              })
            ]),
            vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", null, [
              data.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createElementVNode("div", _hoisted_4$4, [
                  _cache[6] || (_cache[6] = vue.createElementVNode("h2", null, "利润表", -1)),
                  vue.createElementVNode("div", _hoisted_5$4, vue.toDisplayString(vue.unref(periodLabel)(startPeriod.value)) + " 至 " + vue.toDisplayString(vue.unref(periodLabel)(endPeriod.value)), 1),
                  _cache[7] || (_cache[7] = vue.createElementVNode("div", { class: "report-title__unit" }, "单位：元", -1))
                ]),
                vue.createElementVNode("table", _hoisted_6$4, [
                  _cache[8] || (_cache[8] = vue.createElementVNode("thead", null, [
                    vue.createElementVNode("tr", null, [
                      vue.createElementVNode("th", { style: { "width": "38%" } }, "项目"),
                      vue.createElementVNode("th", { style: { "width": "15%" } }, "本期金额"),
                      vue.createElementVNode("th", { style: { "width": "15%" } }, "本年累计金额"),
                      vue.createElementVNode("th", { style: { "width": "32%" } }, "备注")
                    ])
                  ], -1)),
                  vue.createElementVNode("tbody", null, [
                    (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(displayRows.value, (row) => {
                      return vue.openBlock(), vue.createElementBlock("tr", {
                        key: row.key,
                        class: vue.normalizeClass({ "report-table__total": row.bold })
                      }, [
                        vue.createElementVNode("td", {
                          class: vue.normalizeClass(row.indent ? "report-table__indent-1" : "")
                        }, vue.toDisplayString(row.title), 3),
                        vue.createElementVNode("td", _hoisted_7$4, vue.toDisplayString(row.current ? vue.unref(formatAmount)(row.current) : ""), 1),
                        vue.createElementVNode("td", _hoisted_8$4, vue.toDisplayString(row.ytd ? vue.unref(formatAmount)(row.ytd) : ""), 1),
                        vue.createElementVNode("td", _hoisted_9$4, vue.toDisplayString(row.remark), 1)
                      ], 2);
                    }), 128))
                  ])
                ])
              ], 64)) : vue.createCommentVNode("", true)
            ])), [
              [_directive_loading, loading.value]
            ])
          ])
        ]);
      };
    }
  });
  const ReportProfitLossPage = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-fc402a9e"]]);
  const _hoisted_1$3 = { class: "page" };
  const _hoisted_2$3 = { class: "page-card" };
  const _hoisted_3$3 = { class: "page-toolbar" };
  const _hoisted_4$3 = { class: "summary-card__value" };
  const _hoisted_5$3 = { class: "summary-card__value amount amount--total" };
  const _hoisted_6$3 = { class: "summary-card__value amount amount--credit" };
  const _hoisted_7$3 = { class: "amount" };
  const _hoisted_8$3 = { class: "amount" };
  const _hoisted_9$3 = { class: "amount" };
  const _hoisted_10$3 = { class: "amount" };
  const _sfc_main$3 = /* @__PURE__ */ vue.defineComponent({
    __name: "ledger",
    setup(__props) {
      const STATUS_TAG = {
        parsed: "info",
        drafted: "warning",
        confirmed: "success",
        rejected: "danger"
      };
      const typeOptions = [
        { label: "增值税发票", value: "invoice" },
        { label: "身份证", value: "id_card" },
        { label: "营业执照", value: "business_license" },
        { label: "火车票/行程单", value: "train_ticket" },
        { label: "通用收据", value: "receipt" },
        { label: "未识别", value: "unknown" }
      ];
      const startPeriod = vue.ref(currentPeriod());
      const endPeriod = vue.ref(currentPeriod());
      const receiptType = vue.ref("");
      const loading = vue.ref(false);
      const data = vue.ref(null);
      function percentOf(amount) {
        if (!data.value || data.value.summary.amount <= 0) return 0;
        return Math.round(amount / data.value.summary.amount * 1e3) / 10;
      }
      async function load() {
        loading.value = true;
        try {
          data.value = await reportApi.ledger({
            startPeriod: startPeriod.value,
            endPeriod: endPeriod.value,
            receiptType: receiptType.value || void 0
          });
        } finally {
          loading.value = false;
        }
      }
      function onExport() {
        if (!data.value) return;
        const { summary, rows } = data.value;
        exportExcel({
          filename: `票据台账_${startPeriod.value}-${endPeriod.value}.xlsx`,
          sheetName: "票据台账",
          title: "票据台账",
          subtitle: `${startPeriod.value / 100} 年 ${startPeriod.value % 100} 月 至 ${endPeriod.value / 100} 年 ${endPeriod.value % 100} 月  单位：元`,
          columns: [
            { title: "开票日期", prop: "issueDate", width: 12 },
            { title: "票据类型", prop: "receiptTypeName", width: 12 },
            { title: "文件名", prop: "fileName", width: 30 },
            { title: "销售方", prop: "sellerName", width: 22 },
            { title: "购买方", prop: "buyerName", width: 22 },
            { title: "价税合计", prop: "amount", width: 14, amount: true },
            { title: "税额", prop: "taxAmount", width: 12, amount: true },
            { title: "状态", prop: "statusLabel", width: 10 }
          ],
          rows,
          summary: {
            count: summary.count,
            amount: summary.amount,
            taxAmount: summary.taxAmount
          }
        });
        elementPlus.ElMessage.success("导出成功");
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_card = vue.resolveComponent("el-card");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_progress = vue.resolveComponent("el-progress");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$3, [
          vue.createElementVNode("div", _hoisted_2$3, [
            vue.createElementVNode("div", _hoisted_3$3, [
              vue.createVNode(_sfc_main$6, {
                modelValue: startPeriod.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => startPeriod.value = $event),
                width: "140px"
              }, null, 8, ["modelValue"]),
              _cache[5] || (_cache[5] = vue.createElementVNode("span", { class: "sep" }, "至", -1)),
              vue.createVNode(_sfc_main$6, {
                modelValue: endPeriod.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => endPeriod.value = $event),
                width: "140px"
              }, null, 8, ["modelValue"]),
              vue.createVNode(_component_el_select, {
                modelValue: receiptType.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => receiptType.value = $event),
                placeholder: "票据类型",
                clearable: "",
                style: { "width": "150px" }
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(typeOptions, (t) => {
                    return vue.createVNode(_component_el_option, {
                      key: t.value,
                      label: t.label,
                      value: t.value
                    }, null, 8, ["label", "value"]);
                  }), 64))
                ]),
                _: 1
              }, 8, ["modelValue"]),
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
                  _cache[3] || (_cache[3] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }),
              _cache[6] || (_cache[6] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[4] || (_cache[4] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              })
            ]),
            vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", null, [
              data.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_row, {
                  gutter: 12,
                  class: "summary-row"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_col, {
                      xs: 8,
                      sm: 8,
                      md: 8
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: "summary-card"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_4$3, vue.toDisplayString(data.value.summary.count), 1),
                            _cache[7] || (_cache[7] = vue.createElementVNode("div", { class: "summary-card__label" }, "票据张数", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 8,
                      sm: 8,
                      md: 8
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: "summary-card"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_5$3, vue.toDisplayString(vue.unref(formatAmount)(data.value.summary.amount)), 1),
                            _cache[8] || (_cache[8] = vue.createElementVNode("div", { class: "summary-card__label" }, "价税合计（元）", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 8,
                      sm: 8,
                      md: 8
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: "summary-card"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_6$3, vue.toDisplayString(vue.unref(formatAmount)(data.value.summary.taxAmount)), 1),
                            _cache[9] || (_cache[9] = vue.createElementVNode("div", { class: "summary-card__label" }, "税额合计（元）", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table, {
                  data: data.value.summary.byType,
                  size: "small",
                  border: "",
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "typeName",
                      label: "票据类型",
                      "min-width": "120"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "count",
                      label: "张数",
                      width: "90",
                      align: "center"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "价税合计",
                      width: "140",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_7$3, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "税额",
                      width: "120",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_8$3, vue.toDisplayString(vue.unref(formatAmount)(row.taxAmount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "占比",
                      width: "120"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_progress, {
                          percentage: percentOf(row.amount),
                          "stroke-width": 10
                        }, null, 8, ["percentage"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                vue.createVNode(_component_el_table, {
                  data: data.value.rows,
                  size: "small",
                  "max-height": "480px"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "issueDate",
                      label: "开票日期",
                      width: "110"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "receiptTypeName",
                      label: "类型",
                      width: "110"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "fileName",
                      label: "文件名",
                      "min-width": "180",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "sellerName",
                      label: "销售方",
                      "min-width": "160",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "buyerName",
                      label: "购买方",
                      "min-width": "160",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "价税合计",
                      width: "130",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_9$3, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "税额",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_10$3, vue.toDisplayString(vue.unref(formatAmount)(row.taxAmount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "状态",
                      width: "100",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_tag, {
                          type: STATUS_TAG[row.status] ?? "info",
                          size: "small"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(row.statusLabel), 1)
                          ]),
                          _: 2
                        }, 1032, ["type"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"])
              ], 64)) : vue.createCommentVNode("", true)
            ])), [
              [_directive_loading, loading.value]
            ])
          ])
        ]);
      };
    }
  });
  const ReportLedgerPage = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-688aa044"]]);
  const _hoisted_1$2 = { class: "page" };
  const _hoisted_2$2 = { class: "page-card" };
  const _hoisted_3$2 = { class: "page-toolbar" };
  const _hoisted_4$2 = { class: "report-title" };
  const _hoisted_5$2 = { class: "report-title__meta" };
  const _hoisted_6$2 = { class: "report-table" };
  const _hoisted_7$2 = { class: "amount text-right" };
  const _hoisted_8$2 = { class: "amount text-right" };
  const _hoisted_9$2 = { class: "amount text-right" };
  const _hoisted_10$2 = { class: "amount text-right" };
  const _hoisted_11$2 = { class: "report-table__total" };
  const _hoisted_12$2 = { class: "amount text-right" };
  const _hoisted_13$2 = { class: "amount text-right" };
  const _sfc_main$2 = /* @__PURE__ */ vue.defineComponent({
    __name: "cash-flow",
    setup(__props) {
      const startPeriod = vue.ref(currentPeriod());
      const endPeriod = vue.ref(currentPeriod());
      const loading = vue.ref(false);
      const data = vue.ref(null);
      async function load() {
        loading.value = true;
        try {
          data.value = await reportApi.cashFlow({
            startPeriod: startPeriod.value,
            endPeriod: endPeriod.value
          });
        } finally {
          loading.value = false;
        }
      }
      function onExport() {
        if (!data.value) return;
        const categories = (data.value.categories ?? []).map((c) => ({
          category: c.title,
          inflow: c.inflow,
          outflow: c.outflow,
          net: c.net
        }));
        exportExcel({
          filename: `现金流量简表_${startPeriod.value}-${endPeriod.value}.xlsx`,
          sheetName: "现金流量简表",
          title: "现金流量简表",
          subtitle: `${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}  单位：元`,
          columns: [
            { title: "项目", prop: "category", width: 16 },
            { title: "流入", prop: "inflow", width: 14, amount: true },
            { title: "流出", prop: "outflow", width: 14, amount: true },
            { title: "净额", prop: "net", width: 14, amount: true }
          ],
          rows: categories
        });
        elementPlus.ElMessage.success("导出成功");
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$2, [
          vue.createElementVNode("div", _hoisted_2$2, [
            vue.createElementVNode("div", _hoisted_3$2, [
              vue.createVNode(_sfc_main$6, {
                modelValue: startPeriod.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => startPeriod.value = $event),
                width: "140px"
              }, null, 8, ["modelValue"]),
              _cache[4] || (_cache[4] = vue.createElementVNode("span", { class: "sep" }, "至", -1)),
              vue.createVNode(_sfc_main$6, {
                modelValue: endPeriod.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => endPeriod.value = $event),
                width: "140px"
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
                  _cache[2] || (_cache[2] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }),
              _cache[5] || (_cache[5] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[3] || (_cache[3] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              })
            ]),
            vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", null, [
              data.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createElementVNode("div", _hoisted_4$2, [
                  _cache[6] || (_cache[6] = vue.createElementVNode("h2", null, "现金流量简表", -1)),
                  vue.createElementVNode("div", _hoisted_5$2, vue.toDisplayString(vue.unref(periodLabel)(startPeriod.value)) + " 至 " + vue.toDisplayString(vue.unref(periodLabel)(endPeriod.value)), 1),
                  _cache[7] || (_cache[7] = vue.createElementVNode("div", { class: "report-title__unit" }, "单位：元", -1))
                ]),
                vue.createElementVNode("table", _hoisted_6$2, [
                  _cache[17] || (_cache[17] = vue.createElementVNode("thead", null, [
                    vue.createElementVNode("tr", null, [
                      vue.createElementVNode("th", { style: { "width": "40%" } }, "项目"),
                      vue.createElementVNode("th", { style: { "width": "20%" } }, "流入"),
                      vue.createElementVNode("th", { style: { "width": "20%" } }, "流出"),
                      vue.createElementVNode("th", { style: { "width": "20%" } }, "净额")
                    ])
                  ], -1)),
                  vue.createElementVNode("tbody", null, [
                    vue.createElementVNode("tr", null, [
                      _cache[8] || (_cache[8] = vue.createElementVNode("td", { class: "report-table__indent-0" }, "期初现金及现金等价物余额", -1)),
                      vue.createElementVNode("td", _hoisted_7$2, vue.toDisplayString(vue.unref(formatAmount)(data.value.openingBalance)), 1),
                      _cache[9] || (_cache[9] = vue.createElementVNode("td", null, null, -1)),
                      _cache[10] || (_cache[10] = vue.createElementVNode("td", null, null, -1))
                    ]),
                    (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(data.value.categories, (c) => {
                      return vue.openBlock(), vue.createElementBlock("tr", {
                        key: c.key,
                        class: "report-table__total"
                      }, [
                        vue.createElementVNode("td", null, vue.toDisplayString(c.title), 1),
                        vue.createElementVNode("td", _hoisted_8$2, vue.toDisplayString(vue.unref(formatAmount)(c.inflow)), 1),
                        vue.createElementVNode("td", _hoisted_9$2, vue.toDisplayString(vue.unref(formatAmount)(c.outflow)), 1),
                        vue.createElementVNode("td", _hoisted_10$2, vue.toDisplayString(vue.unref(formatAmount)(c.net)), 1)
                      ]);
                    }), 128)),
                    vue.createElementVNode("tr", _hoisted_11$2, [
                      _cache[11] || (_cache[11] = vue.createElementVNode("td", null, "现金净增加额", -1)),
                      _cache[12] || (_cache[12] = vue.createElementVNode("td", null, null, -1)),
                      _cache[13] || (_cache[13] = vue.createElementVNode("td", null, null, -1)),
                      vue.createElementVNode("td", _hoisted_12$2, vue.toDisplayString(vue.unref(formatAmount)(data.value.netIncrease)), 1)
                    ]),
                    vue.createElementVNode("tr", null, [
                      _cache[14] || (_cache[14] = vue.createElementVNode("td", { class: "report-table__indent-0" }, "期末现金及现金等价物余额", -1)),
                      vue.createElementVNode("td", _hoisted_13$2, vue.toDisplayString(vue.unref(formatAmount)(data.value.closingBalance)), 1),
                      _cache[15] || (_cache[15] = vue.createElementVNode("td", null, null, -1)),
                      _cache[16] || (_cache[16] = vue.createElementVNode("td", null, null, -1))
                    ])
                  ])
                ]),
                !data.value.balanced ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                  key: 0,
                  type: "warning",
                  closable: false,
                  "show-icon": "",
                  class: "mb12",
                  title: "三分法净额合计与现金净增加额存在差异（差异金额见明细，通常由现金科目间互转或未分类收支引起）"
                })) : vue.createCommentVNode("", true),
                vue.createVNode(_component_el_table, {
                  data: data.value.detail,
                  size: "small",
                  "max-height": "360px"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "voucherDate",
                      label: "日期",
                      width: "100"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "voucherNo",
                      label: "凭证号",
                      width: "120"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "summary",
                      label: "摘要",
                      "min-width": "180",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "accountName",
                      label: "现金科目",
                      width: "140",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "方向",
                      width: "80",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_tag, {
                          type: row.direction === "inflow" ? "success" : "danger",
                          size: "small"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(row.direction === "inflow" ? "流入" : "流出"), 1)
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
                        vue.createElementVNode("span", {
                          class: vue.normalizeClass(["amount", row.direction === "inflow" ? "amount--debit" : "amount--credit"])
                        }, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 3)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"])
              ], 64)) : vue.createCommentVNode("", true)
            ])), [
              [_directive_loading, loading.value]
            ])
          ])
        ]);
      };
    }
  });
  const ReportCashFlowPage = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-1cc66acb"]]);
  const _hoisted_1$1 = { class: "page" };
  const _hoisted_2$1 = { class: "page-card" };
  const _hoisted_3$1 = { class: "page-toolbar" };
  const _hoisted_4$1 = { class: "report-title" };
  const _hoisted_5$1 = { class: "report-title__meta" };
  const _hoisted_6$1 = { class: "summary-card__value amount amount--total" };
  const _hoisted_7$1 = { class: "summary-card__value" };
  const _hoisted_8$1 = { class: "summary-card__value" };
  const _hoisted_9$1 = { class: "summary-card__value" };
  const _hoisted_10$1 = { class: "amount" };
  const _hoisted_11$1 = { class: "text-muted" };
  const _hoisted_12$1 = { class: "amount" };
  const _hoisted_13$1 = { class: "text-muted" };
  const _hoisted_14$1 = { class: "amount amount--credit" };
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "expense-analysis",
    setup(__props) {
      const startPeriod = vue.ref(currentPeriod());
      const endPeriod = vue.ref(currentPeriod());
      const loading = vue.ref(false);
      const data = vue.ref(null);
      async function load() {
        loading.value = true;
        try {
          data.value = await reportApi.expenseAnalysis({
            startPeriod: startPeriod.value,
            endPeriod: endPeriod.value
          });
        } finally {
          loading.value = false;
        }
      }
      function onExport() {
        if (!data.value) return;
        exportExcel({
          filename: `费用结构分析_${startPeriod.value}-${endPeriod.value}.xlsx`,
          sheetName: "明细",
          title: "费用结构分析",
          subtitle: `${periodLabel(startPeriod.value)} 至 ${periodLabel(endPeriod.value)}  单位：元`,
          columns: [
            { title: "日期", prop: "voucherDate", width: 12 },
            { title: "凭证号", prop: "voucherNo", width: 12 },
            { title: "摘要", prop: "summary", width: 28 },
            { title: "费用科目", prop: "accountName", width: 18 },
            { title: "交易对手", prop: "partnerName", width: 18 },
            { title: "金额", prop: "amount", width: 14, amount: true }
          ],
          rows: data.value.rows,
          summary: { amount: data.value.total }
        });
        elementPlus.ElMessage.success("导出成功");
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_card = vue.resolveComponent("el-card");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_progress = vue.resolveComponent("el-progress");
        const _component_el_table = vue.resolveComponent("el-table");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
          vue.createElementVNode("div", _hoisted_2$1, [
            vue.createElementVNode("div", _hoisted_3$1, [
              vue.createVNode(_sfc_main$6, {
                modelValue: startPeriod.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => startPeriod.value = $event),
                width: "140px"
              }, null, 8, ["modelValue"]),
              _cache[4] || (_cache[4] = vue.createElementVNode("span", { class: "sep" }, "至", -1)),
              vue.createVNode(_sfc_main$6, {
                modelValue: endPeriod.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => endPeriod.value = $event),
                width: "140px"
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
                  _cache[2] || (_cache[2] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }),
              _cache[5] || (_cache[5] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[3] || (_cache[3] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              })
            ]),
            vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", null, [
              data.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createElementVNode("div", _hoisted_4$1, [
                  _cache[6] || (_cache[6] = vue.createElementVNode("h2", null, "费用结构分析", -1)),
                  vue.createElementVNode("div", _hoisted_5$1, vue.toDisplayString(vue.unref(periodLabel)(startPeriod.value)) + " 至 " + vue.toDisplayString(vue.unref(periodLabel)(endPeriod.value)), 1),
                  _cache[7] || (_cache[7] = vue.createElementVNode("div", { class: "report-title__unit" }, "单位：元", -1))
                ]),
                vue.createVNode(_component_el_row, {
                  gutter: 12,
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: "summary-card"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_6$1, vue.toDisplayString(vue.unref(formatAmount)(data.value.total)), 1),
                            _cache[8] || (_cache[8] = vue.createElementVNode("div", { class: "summary-card__label" }, "费用总额", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: "summary-card"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_7$1, vue.toDisplayString(data.value.byAccount.length), 1),
                            _cache[9] || (_cache[9] = vue.createElementVNode("div", { class: "summary-card__label" }, "涉及科目（一级）", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: "summary-card"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_8$1, vue.toDisplayString(data.value.byPartner.length), 1),
                            _cache[10] || (_cache[10] = vue.createElementVNode("div", { class: "summary-card__label" }, "交易对手数", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: "summary-card"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_9$1, vue.toDisplayString(data.value.rows.length), 1),
                            _cache[11] || (_cache[11] = vue.createElementVNode("div", { class: "summary-card__label" }, "明细笔数", -1))
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_row, {
                  gutter: 12,
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_col, {
                      xs: 24,
                      md: 12
                    }, {
                      default: vue.withCtx(() => [
                        _cache[12] || (_cache[12] = vue.createElementVNode("div", { class: "block-title" }, "按费用科目", -1)),
                        vue.createVNode(_component_el_table, {
                          data: data.value.byAccount,
                          size: "small",
                          border: "",
                          "max-height": "320px"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createVNode(_component_el_table_column, {
                              prop: "name",
                              label: "科目",
                              "min-width": "130",
                              "show-overflow-tooltip": ""
                            }),
                            vue.createVNode(_component_el_table_column, {
                              label: "金额",
                              width: "120",
                              align: "right"
                            }, {
                              default: vue.withCtx(({ row }) => [
                                vue.createElementVNode("span", _hoisted_10$1, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                              ]),
                              _: 1
                            }),
                            vue.createVNode(_component_el_table_column, {
                              label: "占比",
                              "min-width": "130"
                            }, {
                              default: vue.withCtx(({ row }) => [
                                vue.createVNode(_component_el_progress, {
                                  percentage: row.percent,
                                  "stroke-width": 10
                                }, null, 8, ["percentage"])
                              ]),
                              _: 1
                            }),
                            vue.createVNode(_component_el_table_column, {
                              label: "占比%",
                              width: "70",
                              align: "center"
                            }, {
                              default: vue.withCtx(({ row }) => [
                                vue.createElementVNode("span", _hoisted_11$1, vue.toDisplayString(row.percent.toFixed(2)), 1)
                              ]),
                              _: 1
                            })
                          ]),
                          _: 1
                        }, 8, ["data"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 24,
                      md: 12
                    }, {
                      default: vue.withCtx(() => [
                        _cache[13] || (_cache[13] = vue.createElementVNode("div", { class: "block-title" }, "按交易对手", -1)),
                        vue.createVNode(_component_el_table, {
                          data: data.value.byPartner,
                          size: "small",
                          border: "",
                          "max-height": "320px"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createVNode(_component_el_table_column, {
                              prop: "partnerName",
                              label: "交易对手",
                              "min-width": "130",
                              "show-overflow-tooltip": ""
                            }),
                            vue.createVNode(_component_el_table_column, {
                              label: "金额",
                              width: "120",
                              align: "right"
                            }, {
                              default: vue.withCtx(({ row }) => [
                                vue.createElementVNode("span", _hoisted_12$1, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                              ]),
                              _: 1
                            }),
                            vue.createVNode(_component_el_table_column, {
                              label: "占比",
                              "min-width": "130"
                            }, {
                              default: vue.withCtx(({ row }) => [
                                vue.createVNode(_component_el_progress, {
                                  percentage: row.percent,
                                  "stroke-width": 10
                                }, null, 8, ["percentage"])
                              ]),
                              _: 1
                            }),
                            vue.createVNode(_component_el_table_column, {
                              label: "占比%",
                              width: "70",
                              align: "center"
                            }, {
                              default: vue.withCtx(({ row }) => [
                                vue.createElementVNode("span", _hoisted_13$1, vue.toDisplayString(row.percent.toFixed(2)), 1)
                              ]),
                              _: 1
                            })
                          ]),
                          _: 1
                        }, 8, ["data"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table, {
                  data: data.value.rows,
                  size: "small",
                  "max-height": "360px"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "voucherDate",
                      label: "日期",
                      width: "100"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "voucherNo",
                      label: "凭证号",
                      width: "120"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "summary",
                      label: "摘要",
                      "min-width": "180",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "accountName",
                      label: "费用科目",
                      width: "140",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "partnerName",
                      label: "交易对手",
                      width: "140",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "金额",
                      width: "130",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_14$1, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"])
              ], 64)) : vue.createCommentVNode("", true)
            ])), [
              [_directive_loading, loading.value]
            ])
          ])
        ]);
      };
    }
  });
  const ReportExpenseAnalysisPage = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-e6950713"]]);
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-card" };
  const _hoisted_3 = { class: "page-toolbar" };
  const _hoisted_4 = { class: "summary-card__value" };
  const _hoisted_5 = { class: "summary-card__value" };
  const _hoisted_6 = { class: "summary-card__value" };
  const _hoisted_7 = { class: "summary-card__value" };
  const _hoisted_8 = { class: "summary-card__value" };
  const _hoisted_9 = {
    key: 0,
    class: "summary-card__hint"
  };
  const _hoisted_10 = { class: "issue-list" };
  const _hoisted_11 = { key: 2 };
  const _hoisted_12 = { class: "block-title" };
  const _hoisted_13 = { class: "amount amount--total" };
  const _hoisted_14 = { class: "amount" };
  const _hoisted_15 = { class: "amount" };
  const _hoisted_16 = { class: "amount" };
  const _hoisted_17 = { class: "amount" };
  const _hoisted_18 = { class: "amount amount--total" };
  const _hoisted_19 = { class: "mini-table" };
  const _hoisted_20 = { class: "amount text-right" };
  const _hoisted_21 = { class: "amount text-right" };
  const _hoisted_22 = { class: "mini-table__total" };
  const _hoisted_23 = { class: "amount text-right" };
  const _hoisted_24 = { class: "amount text-right" };
  const _hoisted_25 = { class: "amount amount--total" };
  const _hoisted_26 = { class: "amount" };
  const _hoisted_27 = { class: "amount" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "monthly-close",
    setup(__props) {
      const period = vue.ref(currentPeriod());
      const loading = vue.ref(false);
      const data = vue.ref(null);
      async function load() {
        loading.value = true;
        try {
          data.value = await reportApi.monthlyClose({ endPeriod: period.value });
        } finally {
          loading.value = false;
        }
      }
      function onExport() {
        if (!data.value || !data.value.ready) {
          elementPlus.ElMessage.warning("请先通过月结检查");
          return;
        }
        const d = data.value;
        const wb = XLSX__namespace.utils.book_new();
        const subtitle = `会计期间：${periodLabel(period.value)}  单位：元`;
        const appendSheet = (name, title, aoa) => {
          const rows = [[title], [subtitle], [], ...aoa];
          const ws = XLSX__namespace.utils.aoa_to_sheet(rows);
          ws["!cols"] = (aoa[0] ?? []).map(() => ({ wch: 20 }));
          XLSX__namespace.utils.book_append_sheet(wb, ws, name);
        };
        const bs = d.report.balanceSheet;
        appendSheet("资产负债表", "资产负债表", [
          ["项目", "金额", "说明"],
          ["资产总计", bs.totalAssets, ""],
          ["负债总计", bs.totalLiabilities, ""],
          ["所有者权益合计", bs.totalEquity, ""],
          ["平衡校验", bs.balanced ? "平衡" : "不平衡", ""]
        ]);
        const pl = d.report.profitLoss;
        appendSheet("利润表", "利润表", [
          ["项目", "本期金额"],
          ["营业收入", pl.operatingRevenue],
          ["营业利润", pl.operatingProfit],
          ["净利润", pl.netProfit]
        ]);
        const cf = d.report.cashFlow;
        appendSheet("现金流量简表", "现金流量简表", [
          ["项目", "金额"],
          ["期初现金及现金等价物余额", cf.openingBalance],
          ...(cf.categories ?? []).map((c) => [`${c.title}净额`, c.net]),
          ["现金净增加额", cf.netIncrease],
          ["期末现金及现金等价物余额", cf.closingBalance]
        ]);
        const rs = d.report.receiptSummary;
        appendSheet("票据台账", "票据台账汇总", [
          ["类型", "张数", "价税合计", "税额"],
          ...(rs.byType ?? []).map((t) => [t.typeName, t.count, t.amount, t.taxAmount]),
          ["合计", rs.count, rs.amount, rs.taxAmount]
        ]);
        XLSX__namespace.writeFile(wb, `月度报表包_${period.value}.xlsx`);
        elementPlus.ElMessage.success("月度报表包已生成");
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_card = vue.resolveComponent("el-card");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_table = vue.resolveComponent("el-table");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createElementVNode("div", _hoisted_2, [
            vue.createElementVNode("div", _hoisted_3, [
              _cache[4] || (_cache[4] = vue.createElementVNode("span", { class: "label" }, "结账期间", -1)),
              vue.createVNode(_sfc_main$6, {
                modelValue: period.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => period.value = $event),
                width: "140px"
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
                  _cache[2] || (_cache[2] = vue.createTextVNode("检查月结", -1))
                ]),
                _: 1
              }),
              _cache[5] || (_cache[5] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, {
                disabled: !data.value || !data.value.ready,
                type: "success",
                onClick: onExport
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[3] || (_cache[3] = vue.createTextVNode("生成月度报表包 ", -1))
                ]),
                _: 1
              }, 8, ["disabled"])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", null, [
              data.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_row, {
                  gutter: 12,
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: vue.normalizeClass(["summary-card", { "summary-card--warn": data.value.checks.pendingReceipts > 0 }])
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_4, vue.toDisplayString(data.value.checks.pendingReceipts), 1),
                            _cache[6] || (_cache[6] = vue.createElementVNode("div", { class: "summary-card__label" }, "待确认票据", -1))
                          ]),
                          _: 1
                        }, 8, ["class"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: vue.normalizeClass(["summary-card", { "summary-card--warn": data.value.checks.unapprovedVouchers > 0 }])
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_5, vue.toDisplayString(data.value.checks.unapprovedVouchers), 1),
                            _cache[7] || (_cache[7] = vue.createElementVNode("div", { class: "summary-card__label" }, "未审核凭证", -1))
                          ]),
                          _: 1
                        }, 8, ["class"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: vue.normalizeClass(["summary-card", { "summary-card--warn": data.value.checks.openPayrolls > 0 }])
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_6, vue.toDisplayString(data.value.checks.openPayrolls), 1),
                            _cache[8] || (_cache[8] = vue.createElementVNode("div", { class: "summary-card__label" }, "未发放工资单", -1))
                          ]),
                          _: 1
                        }, 8, ["class"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: vue.normalizeClass(["summary-card", { "summary-card--warn": data.value.checks.unapprovedExpenseClaims > 0 }])
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_7, vue.toDisplayString(data.value.checks.unapprovedExpenseClaims), 1),
                            _cache[9] || (_cache[9] = vue.createElementVNode("div", { class: "summary-card__label" }, "未审核报销单", -1))
                          ]),
                          _: 1
                        }, 8, ["class"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_col, {
                      xs: 12,
                      sm: 8,
                      md: 6
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_card, {
                          shadow: "hover",
                          class: vue.normalizeClass(["summary-card summary-card--link", { "summary-card--warn": data.value.checks.pendingFixedExpenses > 0 }]),
                          onClick: _cache[1] || (_cache[1] = ($event) => data.value.checks.pendingFixedExpenses > 0 && _ctx.$router.push("/cash/fixed-expense"))
                        }, {
                          default: vue.withCtx(() => [
                            vue.createElementVNode("div", _hoisted_8, vue.toDisplayString(data.value.checks.pendingFixedExpenses ?? 0), 1),
                            _cache[10] || (_cache[10] = vue.createElementVNode("div", { class: "summary-card__label" }, "固定费用待生成", -1)),
                            data.value.checks.pendingFixedExpenses > 0 ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_9, " 预计 " + vue.toDisplayString(vue.unref(formatAmount)(data.value.checks.pendingFixedExpenseAmount ?? 0)) + "，点击去生成 ", 1)) : vue.createCommentVNode("", true)
                          ]),
                          _: 1
                        }, 8, ["class"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                data.value.issues.length ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                  key: 0,
                  type: "warning",
                  closable: false,
                  "show-icon": "",
                  class: "mb12",
                  title: `存在 ${data.value.issues.length} 项未结账事项`
                }, {
                  default: vue.withCtx(() => [
                    vue.createElementVNode("ul", _hoisted_10, [
                      (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(data.value.issues, (issue, i) => {
                        return vue.openBlock(), vue.createElementBlock("li", { key: i }, vue.toDisplayString(issue), 1);
                      }), 128))
                    ])
                  ]),
                  _: 1
                }, 8, ["title"])) : (vue.openBlock(), vue.createBlock(_component_el_alert, {
                  key: 1,
                  type: "success",
                  closable: false,
                  "show-icon": "",
                  class: "mb12",
                  title: "检查通过，可生成月度报表包"
                })),
                data.value.report ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_11, [
                  vue.createElementVNode("div", _hoisted_12, "月度报表预览（" + vue.toDisplayString(vue.unref(periodLabel)(period.value)) + "）", 1),
                  vue.createVNode(_component_el_row, { gutter: 12 }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_col, {
                        xs: 24,
                        md: 12
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_card, {
                            shadow: "never",
                            class: "report-card"
                          }, {
                            header: vue.withCtx(() => [..._cache[11] || (_cache[11] = [
                              vue.createTextVNode("资产负债表", -1)
                            ])]),
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_descriptions, {
                                column: 1,
                                size: "small"
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_descriptions_item, { label: "资产总计" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_13, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.balanceSheet.totalAssets)), 1)
                                    ]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_descriptions_item, { label: "负债总计" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_14, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.balanceSheet.totalLiabilities)), 1)
                                    ]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_descriptions_item, { label: "所有者权益" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_15, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.balanceSheet.totalEquity)), 1)
                                    ]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_descriptions_item, { label: "平衡校验" }, {
                                    default: vue.withCtx(() => [
                                      vue.createVNode(_component_el_tag, {
                                        type: data.value.report.balanceSheet.balanced ? "success" : "danger",
                                        size: "small"
                                      }, {
                                        default: vue.withCtx(() => [
                                          vue.createTextVNode(vue.toDisplayString(data.value.report.balanceSheet.balanced ? "平衡" : "不平衡"), 1)
                                        ]),
                                        _: 1
                                      }, 8, ["type"])
                                    ]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, {
                        xs: 24,
                        md: 12
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_card, {
                            shadow: "never",
                            class: "report-card"
                          }, {
                            header: vue.withCtx(() => [..._cache[12] || (_cache[12] = [
                              vue.createTextVNode("利润表", -1)
                            ])]),
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_descriptions, {
                                column: 1,
                                size: "small"
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_descriptions_item, { label: "营业收入" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_16, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.profitLoss.operatingRevenue)), 1)
                                    ]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_descriptions_item, { label: "营业利润" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_17, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.profitLoss.operatingProfit)), 1)
                                    ]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_descriptions_item, { label: "净利润" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_18, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.profitLoss.netProfit)), 1)
                                    ]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, {
                        xs: 24,
                        md: 12
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_card, {
                            shadow: "never",
                            class: "report-card"
                          }, {
                            header: vue.withCtx(() => [..._cache[13] || (_cache[13] = [
                              vue.createTextVNode("现金流量简表", -1)
                            ])]),
                            default: vue.withCtx(() => [
                              vue.createElementVNode("table", _hoisted_19, [
                                _cache[17] || (_cache[17] = vue.createElementVNode("thead", null, [
                                  vue.createElementVNode("tr", null, [
                                    vue.createElementVNode("th", null, "项目"),
                                    vue.createElementVNode("th", null, "金额")
                                  ])
                                ], -1)),
                                vue.createElementVNode("tbody", null, [
                                  vue.createElementVNode("tr", null, [
                                    _cache[14] || (_cache[14] = vue.createElementVNode("td", null, "期初现金余额", -1)),
                                    vue.createElementVNode("td", _hoisted_20, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.cashFlow.openingBalance)), 1)
                                  ]),
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(data.value.report.cashFlow.categories, (c) => {
                                    return vue.openBlock(), vue.createElementBlock("tr", {
                                      key: c.key
                                    }, [
                                      vue.createElementVNode("td", null, vue.toDisplayString(c.title) + "净额", 1),
                                      vue.createElementVNode("td", _hoisted_21, vue.toDisplayString(vue.unref(formatAmount)(c.net)), 1)
                                    ]);
                                  }), 128)),
                                  vue.createElementVNode("tr", _hoisted_22, [
                                    _cache[15] || (_cache[15] = vue.createElementVNode("td", null, "现金净增加额", -1)),
                                    vue.createElementVNode("td", _hoisted_23, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.cashFlow.netIncrease)), 1)
                                  ]),
                                  vue.createElementVNode("tr", null, [
                                    _cache[16] || (_cache[16] = vue.createElementVNode("td", null, "期末现金余额", -1)),
                                    vue.createElementVNode("td", _hoisted_24, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.cashFlow.closingBalance)), 1)
                                  ])
                                ])
                              ])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, {
                        xs: 24,
                        md: 12
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_card, {
                            shadow: "never",
                            class: "report-card"
                          }, {
                            header: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                              vue.createTextVNode("票据台账汇总", -1)
                            ])]),
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_descriptions, {
                                column: 1,
                                size: "small"
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_descriptions_item, { label: "票据张数" }, {
                                    default: vue.withCtx(() => [
                                      vue.createTextVNode(vue.toDisplayString(data.value.report.receiptSummary.count), 1)
                                    ]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_descriptions_item, { label: "价税合计" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_25, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.receiptSummary.amount)), 1)
                                    ]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_descriptions_item, { label: "税额合计" }, {
                                    default: vue.withCtx(() => [
                                      vue.createElementVNode("span", _hoisted_26, vue.toDisplayString(vue.unref(formatAmount)(data.value.report.receiptSummary.taxAmount)), 1)
                                    ]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              }),
                              data.value.report.receiptSummary.byType?.length ? (vue.openBlock(), vue.createBlock(_component_el_table, {
                                key: 0,
                                data: data.value.report.receiptSummary.byType,
                                size: "small",
                                class: "mt8"
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_table_column, {
                                    prop: "typeName",
                                    label: "类型",
                                    "min-width": "90"
                                  }),
                                  vue.createVNode(_component_el_table_column, {
                                    prop: "count",
                                    label: "张数",
                                    width: "60",
                                    align: "center"
                                  }),
                                  vue.createVNode(_component_el_table_column, {
                                    label: "金额",
                                    width: "110",
                                    align: "right"
                                  }, {
                                    default: vue.withCtx(({ row }) => [
                                      vue.createElementVNode("span", _hoisted_27, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                                    ]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              }, 8, ["data"])) : vue.createCommentVNode("", true)
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  })
                ])) : vue.createCommentVNode("", true)
              ], 64)) : vue.createCommentVNode("", true)
            ])), [
              [_directive_loading, loading.value]
            ])
          ])
        ]);
      };
    }
  });
  const ReportMonthlyClosePage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-307df9a2"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("report-pack", {
    components: {
      DashboardPage,
      ReportBalanceSheetPage,
      ReportProfitLossPage,
      ReportLedgerPage,
      ReportCashFlowPage,
      ReportExpenseAnalysisPage,
      ReportMonthlyClosePage
    }
  });
})(Vue, VueRouter, dayjs, axios, ElementPlus, Pinia, ElementPlusIconsVue, XLSX);
