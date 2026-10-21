(function(vue, elementPlus, iconsVue, axios2, dayjs2, XLSX2, vueRouter) {
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
  async function downloadPost(url, data, filename) {
    const res = await service.post(url, data, { responseType: "blob" });
    const blob = new Blob([res.data]);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename ?? "download";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function fileStamp() {
    const d = /* @__PURE__ */ new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  const ocrApi = {
    status: () => get("/ocr/status"),
    /** 上传证件，抽取目标档案的字段建议 */
    extract: (file, target) => {
      const form = new FormData();
      form.append("file", file);
      return post(`/ocr/extract?target=${target}`, form);
    }
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
  const expenseClaimApi = {
    list: (params) => get("/expense-claims", params),
    detail: (id) => get(`/expense-claims/${id}`),
    nextNo: (claimDate) => get("/expense-claims/next-no", { claimDate }),
    /** 导入报销单（Excel/CSV）→ 预览解析 */
    importPreview: (file) => {
      const form = new FormData();
      form.append("file", file);
      return post("/expense-claims/import", form);
    },
    /** 确认导入预览行 → 生成报销单草稿 */
    importCommit: (data) => post("/expense-claims/import/commit", data),
    create: (data) => post("/expense-claims", data),
    update: (id, data) => put(`/expense-claims/${id}`, data),
    approve: (id) => post(`/expense-claims/${id}/approve`),
    pay: (id, data) => post(`/expense-claims/${id}/pay`, data),
    reject: (id, reason) => post(`/expense-claims/${id}/reject`, { reason }),
    remove: (id) => del(`/expense-claims/${id}`),
    /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件） */
    downloadPdfPackage: (data) => downloadPost("/expense-claims/pdf-package", data, `报销单原始凭证_${fileStamp()}.zip`)
  };
  const loanApi = {
    list: (params) => get("/loans", params),
    detail: (id) => get(`/loans/${id}`),
    nextNo: (loanDate) => get("/loans/next-no", { loanDate }),
    create: (data) => post("/loans", data),
    update: (id, data) => put(`/loans/${id}`, data),
    approve: (id) => post(`/loans/${id}/approve`),
    repay: (id, data) => post(`/loans/${id}/repay`, data),
    reject: (id, reason) => post(`/loans/${id}/reject`, { reason }),
    remove: (id) => del(`/loans/${id}`),
    /** 按员工汇总的往来余额（含未还清借款余额 balance） */
    employeeBalances: (params) => get("/loans/employee-balances", params),
    /** 导入借款单（Excel/CSV）→ 预览解析 */
    importPreview: (file) => {
      const form = new FormData();
      form.append("file", file);
      return post("/loans/import", form);
    },
    /** 确认导入预览行 → 生成借款单草稿 */
    importCommit: (data) => post("/loans/import/commit", data),
    /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件） */
    downloadPdfPackage: (data) => downloadPost("/loans/pdf-package", data, `借款单原始凭证_${fileStamp()}.zip`)
  };
  const payrollApi = {
    list: (params) => get("/payrolls", params),
    detail: (id) => get(`/payrolls/${id}`),
    generate: (data) => post("/payrolls/generate", data),
    /** 导入工资表（Excel/CSV/图片/PDF）→ 预览解析 */
    importPreview: (file) => {
      const form = new FormData();
      form.append("file", file);
      return post("/payrolls/import", form);
    },
    /** 确认导入预览行 → 生成工资单草稿 */
    importCommit: (data) => post("/payrolls/import/commit", data),
    create: (data) => post("/payrolls", data),
    update: (id, data) => put(`/payrolls/${id}`, data),
    approve: (id) => post(`/payrolls/${id}/approve`),
    pay: (id, data) => post(`/payrolls/${id}/pay`, data),
    remove: (id) => del(`/payrolls/${id}`),
    /** 批量生成原始凭证 PDF 压缩包（ids 优先，否则按筛选条件） */
    downloadPdfPackage: (data) => downloadPost("/payrolls/pdf-package", data, `工资表原始凭证_${fileStamp()}.zip`)
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
  const _hoisted_1$6 = { class: "ocr-upload" };
  const _hoisted_2$6 = { class: "ocr-upload__actions" };
  const _hoisted_3$6 = { class: "ocr-card__head" };
  const _hoisted_4$6 = { class: "ocr-card__file" };
  const _hoisted_5$5 = {
    key: 1,
    class: "ocr-card__loading"
  };
  const _hoisted_6$5 = {
    key: 1,
    class: "ocr-card__na"
  };
  const _hoisted_7$5 = { key: 1 };
  const _hoisted_8$5 = { key: 0 };
  const _hoisted_9$5 = {
    key: 1,
    class: "ocr-card__na"
  };
  const _hoisted_10$5 = { class: "ocr-card__foot" };
  const _hoisted_11$5 = { class: "ocr-card__count" };
  const ACCEPT$1 = ".jpg,.jpeg,.png,.webp,.bmp,.tiff,.pdf,image/*,application/pdf";
  const MAX_BYTES$1 = 20 * 1024 * 1024;
  const _sfc_main$7 = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    props: {
      target: {},
      disabled: { type: Boolean, default: false }
    },
    emits: ["apply"],
    setup(__props, { expose: __expose, emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const ALLOWED = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/;
      const items = vue.ref([]);
      const cameraRef = vue.ref();
      let seq = 0;
      function nextId() {
        seq += 1;
        return `ocr-${Date.now()}-${seq}`;
      }
      function onFileChange(file) {
        const raw = file.raw;
        if (!raw) return;
        void recognize([raw]);
      }
      function onCameraChange(event) {
        const input = event.target;
        const files = Array.from(input.files ?? []);
        input.value = "";
        if (files.length) void recognize(files);
      }
      function triggerCamera() {
        cameraRef.value?.click();
      }
      function clearAll() {
        items.value = [];
      }
      function removeItem(index) {
        items.value.splice(index, 1);
      }
      async function recognize(files) {
        for (const file of files) {
          const item = { id: nextId(), fileName: file.name, loading: true };
          items.value.push(item);
          if (!ALLOWED.test(file.type)) {
            item.loading = false;
            item.error = `不支持的文件类型：${file.type || "未知"}`;
            continue;
          }
          if (file.size > MAX_BYTES$1) {
            item.loading = false;
            item.error = "文件超过 20MB 上限";
            continue;
          }
          try {
            item.result = await ocrApi.extract(file, props.target);
          } catch (err) {
            item.error = err.message || "识别失败";
          } finally {
            item.loading = false;
          }
        }
        if (items.value.some((i) => i.error)) elementPlus.ElMessage.warning("部分证件识别失败，可手动填写");
      }
      function selectedCount(result) {
        return result.fields.filter((f) => f.targetKey && f.selected && hasValue(f.value)).length;
      }
      function hasValue(value) {
        return value !== null && value !== void 0 && String(value).trim() !== "";
      }
      function applyItem(result) {
        const values = {};
        for (const f of result.fields) {
          if (f.targetKey && f.selected && hasValue(f.value)) values[f.targetKey] = f.value;
        }
        if (Object.keys(values).length === 0) {
          elementPlus.ElMessage.warning("请先勾选要填入的字段");
          return;
        }
        emit("apply", { values, result });
      }
      function percent(value) {
        return `${Math.round((value || 0) * 100)}%`;
      }
      function confidenceTag(value) {
        if (value >= 0.85) return "success";
        if (value >= 0.6) return "warning";
        return "danger";
      }
      __expose({ clearAll });
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_checkbox = vue.resolveComponent("el-checkbox");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_table = vue.resolveComponent("el-table");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$6, [
          vue.createVNode(_component_el_upload, {
            class: "ocr-upload__drop",
            drag: "",
            multiple: "",
            action: "#",
            "auto-upload": false,
            "show-file-list": false,
            disabled: __props.disabled,
            accept: ACCEPT$1,
            "on-change": onFileChange
          }, {
            tip: vue.withCtx(() => [..._cache[0] || (_cache[0] = [
              vue.createElementVNode("div", { class: "ocr-upload__tip" }, " 支持营业执照、身份证等图片或 PDF，单文件不超过 20MB，可一次选择多张 ", -1)
            ])]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_icon, { class: "ocr-upload__icon" }, {
                default: vue.withCtx(() => [
                  vue.createVNode(vue.unref(iconsVue.UploadFilled))
                ]),
                _: 1
              }),
              _cache[1] || (_cache[1] = vue.createElementVNode("div", { class: "ocr-upload__text" }, [
                vue.createTextVNode(" 将证件拖到此处，或"),
                vue.createElementVNode("em", null, "点击选择")
              ], -1))
            ]),
            _: 1
          }, 8, ["disabled"]),
          vue.createElementVNode("div", _hoisted_2$6, [
            vue.createVNode(_component_el_button, {
              disabled: __props.disabled,
              onClick: triggerCamera
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_icon, null, {
                  default: vue.withCtx(() => [
                    vue.createVNode(vue.unref(iconsVue.Camera))
                  ]),
                  _: 1
                }),
                _cache[2] || (_cache[2] = vue.createTextVNode("拍照 ", -1))
              ]),
              _: 1
            }, 8, ["disabled"]),
            items.value.length ? (vue.openBlock(), vue.createBlock(_component_el_button, {
              key: 0,
              text: "",
              type: "info",
              onClick: clearAll
            }, {
              default: vue.withCtx(() => [..._cache[3] || (_cache[3] = [
                vue.createTextVNode("清空", -1)
              ])]),
              _: 1
            })) : vue.createCommentVNode("", true),
            _cache[4] || (_cache[4] = vue.createElementVNode("span", { class: "ocr-upload__hint" }, "识别结果仅作建议，确认后才会写入表单", -1))
          ]),
          vue.createElementVNode("input", {
            ref_key: "cameraRef",
            ref: cameraRef,
            type: "file",
            class: "ocr-upload__camera",
            accept: "image/*",
            capture: "environment",
            onChange: onCameraChange
          }, null, 544),
          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(items.value, (item, index) => {
            return vue.openBlock(), vue.createElementBlock("div", {
              key: item.id,
              class: "ocr-card"
            }, [
              vue.createElementVNode("div", _hoisted_3$6, [
                vue.createElementVNode("span", _hoisted_4$6, vue.toDisplayString(item.fileName), 1),
                item.result ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                  vue.createVNode(_component_el_tag, {
                    size: "small",
                    type: "primary"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(item.result.docTypeName), 1)
                    ]),
                    _: 2
                  }, 1024),
                  vue.createVNode(_component_el_tag, {
                    size: "small",
                    type: item.result.source === "pdf" ? "info" : "success"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(item.result.source === "pdf" ? "PDF 文本层" : "OCR 识别"), 1)
                    ]),
                    _: 2
                  }, 1032, ["type"]),
                  vue.createVNode(_component_el_tag, {
                    size: "small",
                    type: confidenceTag(item.result.confidence)
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(" 置信度 " + vue.toDisplayString(percent(item.result.confidence)), 1)
                    ]),
                    _: 2
                  }, 1032, ["type"])
                ], 64)) : vue.createCommentVNode("", true),
                _cache[6] || (_cache[6] = vue.createElementVNode("div", { class: "ocr-card__spacer" }, null, -1)),
                vue.createVNode(_component_el_button, {
                  text: "",
                  type: "danger",
                  disabled: item.loading,
                  onClick: ($event) => removeItem(index)
                }, {
                  default: vue.withCtx(() => [..._cache[5] || (_cache[5] = [
                    vue.createTextVNode("移除", -1)
                  ])]),
                  _: 1
                }, 8, ["disabled", "onClick"])
              ]),
              item.result && !item.result.docTypeMatched ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                key: 0,
                class: "ocr-card__alert",
                type: "warning",
                closable: false,
                "show-icon": "",
                title: item.result.message
              }, null, 8, ["title"])) : vue.createCommentVNode("", true),
              item.loading ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_5$5, [
                vue.createVNode(_component_el_icon, { class: "is-loading" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(vue.unref(iconsVue.Loading))
                  ]),
                  _: 1
                }),
                _cache[7] || (_cache[7] = vue.createElementVNode("span", null, "识别中，请稍候…", -1))
              ])) : item.error ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                key: 2,
                class: "ocr-card__alert",
                type: "error",
                closable: false,
                "show-icon": "",
                title: item.error
              }, null, 8, ["title"])) : item.result ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 3 }, [
                vue.createVNode(_component_el_table, {
                  data: item.result.fields,
                  size: "small",
                  "empty-text": "未识别到可用字段"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      label: "应用",
                      width: "60",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.targetKey ? (vue.openBlock(), vue.createBlock(_component_el_checkbox, {
                          key: 0,
                          modelValue: row.selected,
                          "onUpdate:modelValue": ($event) => row.selected = $event
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_6$5, "—"))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "识别项",
                      width: "130"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.label), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "识别结果",
                      "min-width": "200"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.targetKey ? (vue.openBlock(), vue.createBlock(_component_el_input, {
                          key: 0,
                          modelValue: row.value,
                          "onUpdate:modelValue": ($event) => row.value = $event,
                          size: "small"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_7$5, vue.toDisplayString(row.value ?? "-"), 1))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "填入档案字段",
                      width: "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.targetKey ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_8$5, vue.toDisplayString(row.targetLabel), 1)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_9$5, "不适用"))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "置信度",
                      width: "90",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(percent(row.confidence)), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                vue.createElementVNode("div", _hoisted_10$5, [
                  vue.createElementVNode("span", _hoisted_11$5, "已选 " + vue.toDisplayString(selectedCount(item.result)) + " 项", 1),
                  vue.createVNode(_component_el_button, {
                    type: "primary",
                    size: "small",
                    disabled: selectedCount(item.result) === 0,
                    onClick: ($event) => applyItem(item.result)
                  }, {
                    default: vue.withCtx(() => [..._cache[8] || (_cache[8] = [
                      vue.createTextVNode(" 应用到表单 ", -1)
                    ])]),
                    _: 1
                  }, 8, ["disabled", "onClick"])
                ])
              ], 64)) : vue.createCommentVNode("", true)
            ]);
          }), 128))
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
  const OcrUpload = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-0b5288a7"]]);
  const _hoisted_1$5 = { class: "batch__actions" };
  const _hoisted_2$5 = { class: "batch__file" };
  const _hoisted_3$5 = {
    key: 0,
    class: "batch__muted"
  };
  const _hoisted_4$5 = { class: "batch__summary" };
  const ACCEPT = ".jpg,.jpeg,.png,.webp,.bmp,.tiff,.pdf,image/*,application/pdf";
  const MAX_BYTES = 20 * 1024 * 1024;
  const _sfc_main$6 = /* @__PURE__ */ vue.defineComponent({
    __name: "BatchDialog",
    props: {
      modelValue: { type: Boolean },
      target: {}
    },
    emits: ["update:modelValue", "success"],
    setup(__props, { emit: __emit }) {
      const props = __props;
      const emit = __emit;
      const ALLOWED = /^(image\/(jpeg|png|webp|bmp|tiff)|application\/pdf)$/;
      const targetLabel = vue.computed(() => props.target === "partner" ? "往来单位" : "员工");
      const COLUMNS = {
        partner: [
          { key: "name", label: "名称", required: true, width: 200 },
          { key: "taxNo", label: "纳税人识别号", width: 190 },
          { key: "legalPerson", label: "法定代表人", width: 120 },
          { key: "address", label: "地址", width: 200 }
        ],
        employee: [
          { key: "name", label: "姓名", required: true, width: 120 },
          { key: "gender", label: "性别", width: 110, type: "gender" },
          { key: "idCard", label: "身份证号", width: 190 }
        ]
      };
      const columns = vue.computed(() => COLUMNS[props.target]);
      const rows = vue.ref([]);
      const recognizing = vue.ref(false);
      const submitting = vue.ref(false);
      const cameraRef = vue.ref();
      let seq = 0;
      function nextId() {
        seq += 1;
        return `batch-${Date.now()}-${seq}`;
      }
      function emptyValues() {
        const values = {};
        for (const col of columns.value) values[col.key] = col.type === "gender" ? "unknown" : "";
        return values;
      }
      const pendingCount = vue.computed(
        () => rows.value.filter((r) => r.included && !r.loading && !r.error && !r.done).length
      );
      function canEdit(row) {
        return !row.loading && !row.error && !row.done;
      }
      function onOpen() {
        rows.value = [];
      }
      function close(value = false) {
        emit("update:modelValue", value);
      }
      function onFileChange(file) {
        const raw = file.raw;
        if (raw) void recognize([raw]);
      }
      function onCameraChange(event) {
        const input = event.target;
        const files = Array.from(input.files ?? []);
        input.value = "";
        if (files.length) void recognize(files);
      }
      function triggerCamera() {
        cameraRef.value?.click();
      }
      async function recognize(files) {
        recognizing.value = true;
        try {
          for (const file of files) {
            const row = {
              id: nextId(),
              fileName: file.name,
              loading: true,
              included: true,
              values: emptyValues()
            };
            rows.value.push(row);
            if (!ALLOWED.test(file.type)) {
              row.loading = false;
              row.included = false;
              row.error = "不支持的格式";
              continue;
            }
            if (file.size > MAX_BYTES) {
              row.loading = false;
              row.included = false;
              row.error = "超过 20MB";
              continue;
            }
            try {
              const result = await ocrApi.extract(file, props.target);
              applyResult(row, result);
            } catch (err) {
              row.included = false;
              row.error = err.message || "识别失败";
            } finally {
              row.loading = false;
            }
          }
        } finally {
          recognizing.value = false;
        }
      }
      function applyResult(row, result) {
        row.docTypeName = result.docTypeName;
        row.docTypeMatched = result.docTypeMatched;
        for (const [key, value] of Object.entries(result.values)) {
          row.values[key] = value;
        }
        const required = columns.value.find((c) => c.required);
        if (required && !String(row.values[required.key] ?? "").trim()) {
          row.included = false;
          row.error = `未识别到${required.label}`;
        }
      }
      function buildPayload(row) {
        const payload = {};
        for (const col of columns.value) {
          const value = row.values[col.key];
          if (value !== null && value !== void 0 && String(value).trim() !== "") payload[col.key] = value;
        }
        return payload;
      }
      async function onSubmit() {
        const targets = rows.value.filter((r) => r.included && !r.loading && !r.error && !r.done);
        if (targets.length === 0) return;
        submitting.value = true;
        try {
          const payload = targets.map((r) => buildPayload(r));
          const res = props.target === "partner" ? await partnerApi.batchCreate(payload) : await employeeApi.batchCreate(payload);
          targets.forEach((row, index) => {
            const item = res?.results?.[index];
            if (item?.success) {
              row.done = true;
              row.included = false;
              row.message = `已建档 ${item.code ?? ""}`;
            } else {
              row.error = item?.message ?? "入库失败";
              row.included = false;
            }
          });
          if (res?.created > 0) emit("success");
          elementPlus.ElMessage.success(`批量入库完成：成功 ${res?.created ?? 0} 条，失败 ${res?.failed ?? 0} 条`);
          if (rows.value.every((r) => r.done || r.error)) {
            if (rows.value.every((r) => r.done)) {
              rows.value = [];
              close(false);
            }
          }
        } finally {
          submitting.value = false;
        }
      }
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_checkbox = vue.resolveComponent("el-checkbox");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_empty = vue.resolveComponent("el-empty");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createBlock(_component_el_dialog, {
          "model-value": __props.modelValue,
          title: `批量建档 · ${targetLabel.value}`,
          width: "960px",
          "destroy-on-close": "",
          "onUpdate:modelValue": close,
          onOpen
        }, {
          footer: vue.withCtx(() => [
            vue.createElementVNode("span", _hoisted_4$5, "已识别 " + vue.toDisplayString(rows.value.length) + " 张，待入库 " + vue.toDisplayString(pendingCount.value) + " 条", 1),
            vue.createVNode(_component_el_button, {
              onClick: _cache[1] || (_cache[1] = ($event) => close(false))
            }, {
              default: vue.withCtx(() => [..._cache[9] || (_cache[9] = [
                vue.createTextVNode("取消", -1)
              ])]),
              _: 1
            }),
            vue.createVNode(_component_el_button, {
              type: "primary",
              loading: submitting.value,
              disabled: pendingCount.value === 0,
              onClick: onSubmit
            }, {
              default: vue.withCtx(() => [..._cache[10] || (_cache[10] = [
                vue.createTextVNode(" 批量入库 ", -1)
              ])]),
              _: 1
            }, 8, ["loading", "disabled"])
          ]),
          default: vue.withCtx(() => [
            vue.createVNode(_component_el_upload, {
              drag: "",
              multiple: "",
              action: "#",
              "auto-upload": false,
              "show-file-list": false,
              accept: ACCEPT,
              "on-change": onFileChange
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_icon, { class: "batch__icon" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(vue.unref(iconsVue.UploadFilled))
                  ]),
                  _: 1
                }),
                _cache[2] || (_cache[2] = vue.createElementVNode("div", { class: "batch__text" }, [
                  vue.createTextVNode("将多张证件拖到此处，或"),
                  vue.createElementVNode("em", null, "点击选择"),
                  vue.createTextVNode("，系统逐张识别后进入预览表格")
                ], -1))
              ]),
              _: 1
            }),
            vue.createElementVNode("div", _hoisted_1$5, [
              vue.createVNode(_component_el_button, { onClick: triggerCamera }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Camera))
                    ]),
                    _: 1
                  }),
                  _cache[3] || (_cache[3] = vue.createTextVNode("拍照", -1))
                ]),
                _: 1
              }),
              rows.value.length ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                key: 0,
                text: "",
                type: "info",
                onClick: _cache[0] || (_cache[0] = ($event) => rows.value = [])
              }, {
                default: vue.withCtx(() => [..._cache[4] || (_cache[4] = [
                  vue.createTextVNode("清空", -1)
                ])]),
                _: 1
              })) : vue.createCommentVNode("", true),
              _cache[5] || (_cache[5] = vue.createElementVNode("span", { class: "batch__hint" }, "识别完成后可在表格中逐条修改，确认无误再批量入库", -1))
            ]),
            vue.createElementVNode("input", {
              ref_key: "cameraRef",
              ref: cameraRef,
              type: "file",
              class: "batch__camera",
              accept: "image/*",
              capture: "environment",
              onChange: onCameraChange
            }, null, 544),
            rows.value.length ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              key: 0,
              data: rows.value,
              size: "small",
              "max-height": "360",
              class: "batch__table"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  label: "入库",
                  width: "56",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_checkbox, {
                      modelValue: row.included,
                      "onUpdate:modelValue": ($event) => row.included = $event,
                      disabled: row.loading || Boolean(row.error) || row.done
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "识别证件",
                  width: "150"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("div", _hoisted_2$5, vue.toDisplayString(row.fileName), 1),
                    row.docTypeName ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 0,
                      size: "small",
                      type: row.docTypeMatched ? "primary" : "warning"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.docTypeName), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(columns.value, (col) => {
                  return vue.openBlock(), vue.createBlock(_component_el_table_column, {
                    key: col.key,
                    label: col.label,
                    "min-width": col.width ?? 150
                  }, {
                    default: vue.withCtx(({ row }) => [
                      col.type === "gender" ? (vue.openBlock(), vue.createBlock(_component_el_select, {
                        key: 0,
                        modelValue: row.values[col.key],
                        "onUpdate:modelValue": ($event) => row.values[col.key] = $event,
                        size: "small",
                        style: { "width": "100%" },
                        disabled: !canEdit(row)
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_option, {
                            label: "男",
                            value: "male"
                          }),
                          vue.createVNode(_component_el_option, {
                            label: "女",
                            value: "female"
                          }),
                          vue.createVNode(_component_el_option, {
                            label: "未知",
                            value: "unknown"
                          })
                        ]),
                        _: 1
                      }, 8, ["modelValue", "onUpdate:modelValue", "disabled"])) : (vue.openBlock(), vue.createBlock(_component_el_input, {
                        key: 1,
                        modelValue: row.values[col.key],
                        "onUpdate:modelValue": ($event) => row.values[col.key] = $event,
                        size: "small",
                        disabled: !canEdit(row),
                        placeholder: col.required ? "必填" : ""
                      }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled", "placeholder"]))
                    ]),
                    _: 2
                  }, 1032, ["label", "min-width"]);
                }), 128)),
                vue.createVNode(_component_el_table_column, {
                  label: "状态",
                  width: "150"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.loading ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_3$5, "识别中…")) : row.done ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 1,
                      type: "success",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.message), 1)
                      ]),
                      _: 2
                    }, 1024)) : row.error ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 2,
                      type: "danger",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.error), 1)
                      ]),
                      _: 2
                    }, 1024)) : !row.included ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 3,
                      type: "info",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [..._cache[6] || (_cache[6] = [
                        vue.createTextVNode("不入库", -1)
                      ])]),
                      _: 1
                    })) : (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 4,
                      type: "warning",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [..._cache[7] || (_cache[7] = [
                        vue.createTextVNode("待入库", -1)
                      ])]),
                      _: 1
                    }))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "70"
                }, {
                  default: vue.withCtx(({ $index }) => [
                    vue.createVNode(_component_el_button, {
                      text: "",
                      type: "danger",
                      size: "small",
                      onClick: ($event) => rows.value.splice($index, 1)
                    }, {
                      default: vue.withCtx(() => [..._cache[8] || (_cache[8] = [
                        vue.createTextVNode("移除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, recognizing.value]
            ]) : (vue.openBlock(), vue.createBlock(_component_el_empty, {
              key: 1,
              description: "尚未选择证件",
              "image-size": 80
            }))
          ]),
          _: 1
        }, 8, ["model-value", "title"]);
      };
    }
  });
  const BatchDialog = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-6b8bb540"]]);
  const _hoisted_1$4 = { class: "page" };
  const _hoisted_2$4 = { class: "page-card" };
  const _hoisted_3$4 = { class: "page-toolbar" };
  const _hoisted_4$4 = { class: "amount" };
  const _hoisted_5$4 = {
    key: 1,
    class: "debt-clear"
  };
  const _hoisted_6$4 = { class: "page-pagination" };
  const _hoisted_7$4 = {
    key: 0,
    class: "ocr-section"
  };
  const _hoisted_8$4 = { class: "amount" };
  const _hoisted_9$4 = { class: "amount" };
  const _hoisted_10$4 = { class: "amount" };
  const _hoisted_11$4 = { class: "debt-link-text" };
  const _hoisted_12$4 = { class: "amount" };
  const _hoisted_13$4 = { class: "amount" };
  const _hoisted_14$4 = { class: "amount" };
  const _hoisted_15$4 = { class: "amount" };
  const _hoisted_16$4 = { class: "import-head" };
  const _sfc_main$5 = /* @__PURE__ */ vue.defineComponent({
    __name: "employees",
    setup(__props) {
      const GENDERS = { male: "男", female: "女", unknown: "未知" };
      const genderLabel = (g) => GENDERS[g] ?? "未知";
      const employmentTypeLabel = (t) => t === "part_time" ? "兼职" : "全职";
      const LOAN_STATUS_LABELS = {
        draft: "待审核",
        approved: "已借款",
        repaid: "已还清",
        rejected: "已驳回"
      };
      const LOAN_STATUS_TAGS = {
        draft: "warning",
        approved: "success",
        repaid: "info",
        rejected: "danger"
      };
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => employeeApi.list(params),
        defaultParams: { page: 1, pageSize: 20, keyword: "", status: "", departmentId: "" }
      });
      const departmentOptions = vue.ref([]);
      const dialogVisible = vue.ref(false);
      const batchVisible = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const initialForm = {
        id: "",
        name: "",
        gender: "unknown",
        employmentType: "full_time",
        departmentId: "",
        position: "",
        idCard: "",
        phone: "",
        email: "",
        hireDate: "",
        leaveDate: "",
        baseSalary: 0,
        bankName: "",
        bankAccount: "",
        status: 1,
        remark: ""
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
        email: [{ type: "email", message: "邮箱格式不正确", trigger: "blur" }]
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
          gender: row.gender ?? "unknown",
          employmentType: row.employmentType ?? "full_time",
          departmentId: row.departmentId ?? "",
          position: row.position ?? "",
          idCard: row.idCard ?? "",
          phone: row.phone ?? "",
          email: row.email ?? "",
          hireDate: row.hireDate ?? "",
          leaveDate: row.leaveDate ?? "",
          baseSalary: Number(row.baseSalary ?? 0),
          bankName: row.bankName ?? "",
          bankAccount: row.bankAccount ?? "",
          status: row.status,
          remark: row.remark ?? ""
        });
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      function onOcrApply(payload) {
        Object.assign(form, payload.values);
        elementPlus.ElMessage.success(`已填入 ${Object.keys(payload.values).length} 个字段，请核对后保存`);
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      function onBatchSuccess() {
        load();
      }
      async function onToggle(row) {
        const next = row.status === 1 ? 0 : 1;
        try {
          await employeeApi.update(row.id, { status: next });
          ok(next === 1 ? "已恢复在职" : "已办理离职");
          load();
        } catch {
        }
      }
      const importVisible = vue.ref(false);
      const importFileList = vue.ref([]);
      const importParsing = vue.ref(false);
      const importPreviewData = vue.ref(null);
      const importRows = vue.ref([]);
      const importCommitting = vue.ref(false);
      const importSummary = vue.computed(() => importPreviewData.value?.summary ?? {});
      const importAlertTitle = vue.computed(() => {
        const s = importSummary.value;
        let title = `共 ${s.total ?? 0} 行：将新建 ${s.newCount ?? 0} 人，已存在跳过 ${s.exists ?? 0} 人`;
        if (s.newDepartments?.length) title += `，将自动创建部门：${s.newDepartments.join("、")}`;
        return title;
      });
      function onImportFileChange(_file, files) {
        importFileList.value = files;
        onImportParse();
      }
      function onImportFileRemove(_file, files) {
        importFileList.value = files;
      }
      async function onImportParse() {
        const raw = importFileList.value.find((f) => f.raw instanceof File)?.raw;
        if (!raw) return;
        importParsing.value = true;
        try {
          const res = await employeeApi.importPreview(raw);
          importPreviewData.value = res;
          importRows.value = (res.rows ?? []).map((r) => ({ ...r }));
        } finally {
          importParsing.value = false;
        }
      }
      function backToUpload() {
        importPreviewData.value = null;
        importRows.value = [];
        importFileList.value = [];
      }
      async function onImportCommit() {
        const rows = importRows.value;
        if (!rows.length) {
          elementPlus.ElMessage.warning("没有可导入的行");
          return;
        }
        const newCount = importSummary.value.newCount ?? rows.filter((r) => !r.exists).length;
        const existsCount = importSummary.value.exists ?? rows.filter((r) => r.exists).length;
        try {
          await elementPlus.ElMessageBox.confirm(
            `将新建 ${newCount} 名员工（已存在 ${existsCount} 人自动跳过），工号由系统自动生成，确认导入吗？`,
            "确认导入",
            { type: "warning", confirmButtonText: "确认导入", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        importCommitting.value = true;
        try {
          const res = await employeeApi.importCommit({
            rows: rows.map((r) => {
              const item = { name: r.name };
              if (r.gender) item.gender = r.gender;
              if (r.employmentType) item.employmentType = r.employmentType;
              if (r.departmentName) item.departmentName = r.departmentName;
              if (r.position) item.position = r.position;
              if (r.idCard) item.idCard = r.idCard;
              if (r.phone) item.phone = r.phone;
              if (r.hireDate) item.hireDate = r.hireDate;
              if (r.baseSalary !== null && r.baseSalary !== void 0 && r.baseSalary !== "") {
                item.baseSalary = Number(r.baseSalary);
              }
              if (r.bankName) item.bankName = r.bankName;
              if (r.bankAccount) item.bankAccount = r.bankAccount;
              return item;
            })
          });
          ok(`导入完成：新建 ${res.created} 人，跳过 ${res.skipped} 人`);
          const failed = (res.results ?? []).filter((x) => x.success === false && !x.skipped);
          if (failed.length) {
            elementPlus.ElMessage.warning(
              `有 ${failed.length} 行导入失败：` + failed.map((f) => `${f.name ?? `第 ${(f.index ?? 0) + 1} 行`}：${f.message ?? "失败"}`).join("；")
            );
          }
          importVisible.value = false;
          backToUpload();
          load();
        } finally {
          importCommitting.value = false;
        }
      }
      const debtVisible = vue.ref(false);
      const debtData = vue.ref(null);
      async function openDebts(row) {
        debtData.value = await employeeApi.debts(row.id);
        debtVisible.value = true;
      }
      async function onRemove(row) {
        if (!await confirmDelete(`员工「${row.name}」`)) return;
        try {
          await employeeApi.remove(row.id);
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
          for (const k of ["departmentId", "position", "idCard", "phone", "email", "hireDate", "leaveDate", "bankName", "bankAccount", "remark"]) {
            if (!payload[k]) delete payload[k];
          }
          if (form.id) await employeeApi.update(form.id, payload);
          else await employeeApi.create(payload);
          ok(form.id ? "修改成功" : "新增成功");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      function onExport() {
        exportExcel({
          filename: `员工花名册_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
          sheetName: "员工",
          columns: [
            { title: "工号", prop: "code", width: 10 },
            { title: "姓名", prop: "name", width: 12 },
            { title: "性别", prop: "gender", width: 8, format: (r) => genderLabel(r.gender) },
            { title: "用工性质", prop: "employmentType", width: 10, format: (r) => employmentTypeLabel(r.employmentType) },
            { title: "部门", prop: "departmentName", width: 16 },
            { title: "岗位", prop: "position", width: 16 },
            { title: "基本工资", prop: "baseSalary", width: 14, amount: true },
            { title: "当前欠款", prop: "loanBalance", width: 12, amount: true },
            { title: "身份证号", prop: "idCard", width: 20 },
            { title: "手机号", prop: "phone", width: 15 },
            { title: "入职日期", prop: "hireDate", width: 12 },
            { title: "状态", prop: "status", width: 8, format: (r) => r.status === 1 ? "在职" : "离职" }
          ],
          rows: list.value
        });
        elementPlus.ElMessage.success("导出成功");
      }
      vue.onMounted(async () => {
        departmentOptions.value = await departmentApi.options();
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$4, [
          vue.createElementVNode("div", _hoisted_2$4, [
            vue.createElementVNode("div", _hoisted_3$4, [
              vue.createVNode(_component_el_input, {
                modelValue: vue.unref(query).keyword,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).keyword = $event),
                placeholder: "搜索工号 / 姓名 / 手机 / 岗位",
                clearable: "",
                style: { "width": "240px" },
                onKeyup: vue.withKeys(vue.unref(search), ["enter"]),
                onClear: vue.unref(search)
              }, null, 8, ["modelValue", "onKeyup", "onClear"]),
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).departmentId,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => vue.unref(query).departmentId = $event),
                placeholder: "所属部门",
                clearable: "",
                filterable: "",
                style: { "width": "160px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(departmentOptions.value, (d) => {
                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                      key: d.id,
                      label: d.name,
                      value: d.id
                    }, null, 8, ["label", "value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).status,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => vue.unref(query).status = $event),
                placeholder: "在职状态",
                clearable: "",
                style: { "width": "120px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_option, {
                    label: "在职",
                    value: 1
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "离职",
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
                  _cache[29] || (_cache[29] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: vue.unref(reset) }, {
                default: vue.withCtx(() => [..._cache[30] || (_cache[30] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }, 8, ["onClick"]),
              _cache[35] || (_cache[35] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                onClick: _cache[3] || (_cache[3] = ($event) => batchVisible.value = true)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Files))
                    ]),
                    _: 1
                  }),
                  _cache[31] || (_cache[31] = vue.createTextVNode("批量建档 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:employee:create"]
              ]),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[32] || (_cache[32] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              }),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                onClick: _cache[4] || (_cache[4] = ($event) => importVisible.value = true)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Upload))
                    ]),
                    _: 1
                  }),
                  _cache[33] || (_cache[33] = vue.createTextVNode("导入 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:employee:create"]
              ]),
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
                  _cache[34] || (_cache[34] = vue.createTextVNode("新增员工 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:employee:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无员工"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "code",
                  label: "工号",
                  width: "130"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "name",
                  label: "姓名",
                  width: "160"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "性别",
                  width: "70",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(genderLabel(row.gender)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "用工性质",
                  width: "90",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.employmentType === "part_time" ? "warning" : "info",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.employmentType === "part_time" ? "兼职" : "全职"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "departmentName",
                  label: "部门",
                  width: "130"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.departmentName || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "position",
                  label: "岗位",
                  "min-width": "140"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.position || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "基本工资",
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_4$4, vue.toDisplayString(vue.unref(formatAmount)(row.baseSalary)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "当前欠款",
                  width: "110",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    (row.loanBalance ?? 0) > 0 ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 0,
                      link: "",
                      type: "warning",
                      class: "debt-link",
                      onClick: ($event) => openDebts(row)
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(row.loanBalance)), 1)
                      ]),
                      _: 2
                    }, 1032, ["onClick"])) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_5$4, "0.00"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "phone",
                  label: "手机号",
                  width: "130"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.phone || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "hireDate",
                  label: "入职日期",
                  width: "115"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.hireDate || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "状态",
                  width: "110",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: row.status === 1 ? "success" : "info",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.status === 1 ? "在职" : "离职"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "250",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[36] || (_cache[36] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:employee:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "warning",
                      onClick: ($event) => onToggle(row)
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.status === 1 ? "办理离职" : "恢复在职"), 1)
                      ]),
                      _: 2
                    }, 1032, ["onClick"])), [
                      [_directive_permission, "hr:employee:update"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[37] || (_cache[37] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:employee:delete"]
                    ])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_6$4, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[5] || (_cache[5] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[6] || (_cache[6] = ($event) => vue.unref(query).pageSize = $event),
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
            "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => dialogVisible.value = $event),
            title: form.id ? "编辑员工" : "新增员工",
            width: "700px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[22] || (_cache[22] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[40] || (_cache[40] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[41] || (_cache[41] = [
                  vue.createTextVNode("保存", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              !form.id ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_7$4, [
                _cache[38] || (_cache[38] = vue.createElementVNode("div", { class: "ocr-section__title" }, "证件一键录入", -1)),
                vue.createVNode(OcrUpload, {
                  target: "employee",
                  onApply: onOcrApply
                })
              ])) : vue.createCommentVNode("", true),
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "姓名",
                            prop: "name"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.name,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.name = $event)
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "性别" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.gender,
                                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.gender = $event),
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_option, {
                                    label: "男",
                                    value: "male"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "女",
                                    value: "female"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "未知",
                                    value: "unknown"
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "用工性质" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.employmentType,
                                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.employmentType = $event),
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_option, {
                                    label: "全职",
                                    value: "full_time"
                                  }),
                                  vue.createVNode(_component_el_option, {
                                    label: "兼职",
                                    value: "part_time"
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
                          vue.createVNode(_component_el_form_item, { label: "部门" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.departmentId,
                                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.departmentId = $event),
                                clearable: "",
                                filterable: "",
                                placeholder: "可选",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(departmentOptions.value, (d) => {
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
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "岗位" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.position,
                                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.position = $event)
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
                          vue.createVNode(_component_el_form_item, { label: "基本工资" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input_number, {
                                modelValue: form.baseSalary,
                                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.baseSalary = $event),
                                min: 0,
                                precision: 2,
                                step: 500,
                                style: { "width": "100%" }
                              }, null, 8, ["modelValue"]),
                              _cache[39] || (_cache[39] = vue.createElementVNode("div", { class: "form-tip" }, "用于「工资表」按员工生成工资单时的默认值", -1))
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "入职日期" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.hireDate,
                                "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.hireDate = $event),
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
                  vue.createVNode(_component_el_form_item, { label: "身份证号" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.idCard,
                        "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => form.idCard = $event),
                        placeholder: "18 位身份证号"
                      }, null, 8, ["modelValue"])
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
                                "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => form.phone = $event)
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
                                "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => form.email = $event)
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
                          vue.createVNode(_component_el_form_item, { label: "开户行" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.bankName,
                                "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => form.bankName = $event)
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "工资卡号" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input, {
                                modelValue: form.bankAccount,
                                "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => form.bankAccount = $event)
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
                          form.id ? (vue.openBlock(), vue.createBlock(_component_el_form_item, {
                            key: 0,
                            label: "离职日期"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.leaveDate,
                                "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => form.leaveDate = $event),
                                type: "date",
                                "value-format": "YYYY-MM-DD",
                                style: { "width": "100%" }
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })) : vue.createCommentVNode("", true)
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 12 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "在职状态" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_switch, {
                                modelValue: form.status,
                                "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => form.status = $event),
                                "active-value": 1,
                                "inactive-value": 0,
                                "active-text": "在职",
                                "inactive-text": "离职"
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
                        "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => form.remark = $event),
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
          }, 8, ["modelValue", "title"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: debtVisible.value,
            "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => debtVisible.value = $event),
            title: "员工欠款明细",
            width: "980px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[24] || (_cache[24] = ($event) => debtVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[44] || (_cache[44] = [
                  vue.createTextVNode("关闭", -1)
                ])]),
                _: 1
              })
            ]),
            default: vue.withCtx(() => [
              debtData.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_descriptions, {
                  column: 5,
                  border: "",
                  size: "small",
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_descriptions_item, { label: "员工" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(debtData.value.employee?.name) + "（" + vue.toDisplayString(debtData.value.employee?.code) + "）", 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "借款总额" }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("span", _hoisted_8$4, vue.toDisplayString(vue.unref(formatAmount)(debtData.value.summary?.loanTotal ?? 0)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "已还现金/银行" }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("span", _hoisted_9$4, vue.toDisplayString(vue.unref(formatAmount)(debtData.value.summary?.repaidTotal ?? 0)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "报销等抵充" }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("span", _hoisted_10$4, vue.toDisplayString(vue.unref(formatAmount)(debtData.value.summary?.offsetTotal ?? 0)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "当前欠款" }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("span", _hoisted_11$4, vue.toDisplayString(vue.unref(formatAmount)(debtData.value.summary?.balance ?? 0)), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                _cache[42] || (_cache[42] = vue.createElementVNode("div", { class: "debt-section-title" }, "借款单", -1)),
                vue.createVNode(_component_el_table, {
                  data: debtData.value.loans ?? [],
                  size: "small",
                  border: "",
                  "max-height": "240px",
                  "empty-text": "暂无借款记录"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "loanNo",
                      label: "借款单号",
                      width: "140"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "loanDate",
                      label: "借款日期",
                      width: "110"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "reason",
                      label: "借款事由",
                      "min-width": "140"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.reason || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "借款金额",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_12$4, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "已还现金",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_13$4, vue.toDisplayString(vue.unref(formatAmount)(row.repaidAmount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "抵充金额",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_14$4, vue.toDisplayString(vue.unref(formatAmount)(row.offsetAmount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "未还金额",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", {
                          class: vue.normalizeClass(row.outstanding > 0 ? "debt-link-text" : "debt-clear")
                        }, vue.toDisplayString(vue.unref(formatAmount)(row.outstanding)), 3)
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
                          type: LOAN_STATUS_TAGS[row.status] ?? "info",
                          size: "small"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(LOAN_STATUS_LABELS[row.status] ?? row.status), 1)
                          ]),
                          _: 2
                        }, 1032, ["type"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                _cache[43] || (_cache[43] = vue.createElementVNode("div", { class: "debt-section-title" }, "还款 / 抵充流水", -1)),
                vue.createVNode(_component_el_table, {
                  data: debtData.value.settlements ?? [],
                  size: "small",
                  border: "",
                  "max-height": "240px",
                  "empty-text": "暂无还款记录"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "settleDate",
                      label: "核销日期",
                      width: "110"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "settleTypeLabel",
                      label: "途径",
                      width: "110"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "sourceNo",
                      label: "来源单据",
                      width: "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.sourceNo || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "loanNo",
                      label: "抵充借款单",
                      width: "140"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.loanNo || "无借款挂账"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "summary",
                      label: "摘要",
                      "min-width": "180",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "金额",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_15$4, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"])
              ], 64)) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: importVisible.value,
            "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => importVisible.value = $event),
            title: "导入员工花名册",
            width: "1080px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[26] || (_cache[26] = ($event) => importVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[48] || (_cache[48] = [
                  vue.createTextVNode("关闭", -1)
                ])]),
                _: 1
              }),
              importPreviewData.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_button, { onClick: backToUpload }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_icon, null, {
                      default: vue.withCtx(() => [
                        vue.createVNode(vue.unref(iconsVue.Back))
                      ]),
                      _: 1
                    }),
                    _cache[49] || (_cache[49] = vue.createTextVNode("重新选择文件", -1))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_button, {
                  type: "primary",
                  loading: importCommitting.value,
                  onClick: onImportCommit
                }, {
                  default: vue.withCtx(() => [..._cache[50] || (_cache[50] = [
                    vue.createTextVNode("确认导入", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"])
              ], 64)) : vue.createCommentVNode("", true)
            ]),
            default: vue.withCtx(() => [
              !importPreviewData.value ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_upload, {
                key: 0,
                drag: "",
                "auto-upload": false,
                limit: 1,
                accept: ".xlsx,.xls,.csv",
                "on-change": onImportFileChange,
                "on-remove": onImportFileRemove,
                "file-list": importFileList.value
              }, {
                tip: vue.withCtx(() => [..._cache[45] || (_cache[45] = [
                  vue.createElementVNode("div", { class: "el-upload__tip" }, "按表头关键词自动映射（姓名/性别/用工性质/身份证号/手机号/部门/岗位/开户银行/工资卡号/入职日期/基本工资等），选择文件后立即解析预览", -1)
                ])]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, { class: "el-icon--upload" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.UploadFilled))
                    ]),
                    _: 1
                  }),
                  _cache[46] || (_cache[46] = vue.createElementVNode("div", { class: "el-upload__text" }, [
                    vue.createTextVNode("拖拽 Excel / CSV 到此处，或"),
                    vue.createElementVNode("em", null, "点击选择")
                  ], -1))
                ]),
                _: 1
              }, 8, ["file-list"])), [
                [_directive_loading, importParsing.value]
              ]) : (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                vue.createElementVNode("div", _hoisted_16$4, [
                  vue.createVNode(_component_el_alert, {
                    type: importSummary.value.exists ? "warning" : "success",
                    closable: false,
                    "show-icon": "",
                    class: "import-head__alert",
                    title: importAlertTitle.value
                  }, null, 8, ["type", "title"])
                ]),
                vue.createVNode(_component_el_table, {
                  data: importRows.value,
                  size: "small",
                  "max-height": "440px",
                  "row-class-name": ({ row }) => row.exists ? "import-row--skip" : ""
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      type: "index",
                      label: "#",
                      width: "45",
                      align: "center"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "name",
                      label: "姓名",
                      width: "90"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "性别",
                      width: "60",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.genderLabel || genderLabel(row.gender)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "用工性质",
                      width: "80",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.employmentTypeLabel || "全职"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "idCard",
                      label: "身份证号",
                      width: "170"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.idCard || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "phone",
                      label: "手机号",
                      width: "120"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.phone || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "部门",
                      width: "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", null, vue.toDisplayString(row.departmentName || "-"), 1),
                        row.departmentWillCreate ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                          key: 0,
                          size: "small",
                          type: "warning",
                          class: "ml4"
                        }, {
                          default: vue.withCtx(() => [..._cache[47] || (_cache[47] = [
                            vue.createTextVNode("将创建", -1)
                          ])]),
                          _: 1
                        })) : vue.createCommentVNode("", true)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "position",
                      label: "岗位",
                      "min-width": "90"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.position || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "bankName",
                      label: "开户银行",
                      width: "110"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.bankName || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "bankAccount",
                      label: "工资卡号",
                      width: "140"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.bankAccount || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "message",
                      label: "说明",
                      "min-width": "130"
                    })
                  ]),
                  _: 1
                }, 8, ["data", "row-class-name"])
              ], 64))
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(BatchDialog, {
            modelValue: batchVisible.value,
            "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => batchVisible.value = $event),
            target: "employee",
            onSuccess: onBatchSuccess
          }, null, 8, ["modelValue"])
        ]);
      };
    }
  });
  const HrEmployeesPage = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-f05a515b"]]);
  const _hoisted_1$3 = { class: "page" };
  const _hoisted_2$3 = { class: "page-card" };
  const _hoisted_3$3 = { class: "page-toolbar" };
  const _hoisted_4$3 = { class: "amount amount--total" };
  const _hoisted_5$3 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_6$3 = { class: "page-pagination" };
  const _hoisted_7$3 = { class: "form-tip" };
  const _hoisted_8$3 = { class: "form-tip" };
  const _hoisted_9$3 = { class: "items-table" };
  const _hoisted_10$3 = { class: "cell" };
  const _hoisted_11$3 = { class: "cell" };
  const _hoisted_12$3 = { class: "cell" };
  const _hoisted_13$3 = { class: "text-center" };
  const _hoisted_14$3 = { class: "items-footer" };
  const _hoisted_15$3 = { class: "items-footer__total" };
  const _hoisted_16$3 = { class: "amount amount--total" };
  const _hoisted_17$3 = { class: "import-head" };
  const _hoisted_18$1 = { key: 1 };
  const _hoisted_19$1 = { class: "amount amount--total" };
  const _hoisted_20$1 = {
    key: 0,
    class: "import-warning"
  };
  const _hoisted_21$1 = { class: "amount amount--total" };
  const _hoisted_22$1 = { key: 0 };
  const _hoisted_23$1 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_24$1 = { class: "amount" };
  const _hoisted_25$1 = { class: "amount amount--total" };
  const _sfc_main$4 = /* @__PURE__ */ vue.defineComponent({
    __name: "expense-claims",
    setup(__props) {
      const PAY_METHODS = {
        advance: "员工垫付",
        cash: "现金支付",
        bank: "银行支付"
      };
      const PAY_METHOD_TAGS = { advance: "warning", cash: "primary", bank: "success" };
      const PAY_METHOD_HINTS = {
        advance: "审核时费用挂「其他应收款-员工」；冲抵借款型自动核销借款，直接付款型审核后可付款",
        cash: "审核时直接贷记「库存现金」",
        bank: "审核时贷记对应银行账户，付款时再冲减其他应收款"
      };
      const STATUS_LABELS = {
        draft: "草稿",
        approved: "已审核",
        paid: "已付款",
        rejected: "已驳回"
      };
      const STATUS_TAGS = {
        draft: "info",
        approved: "success",
        paid: "primary",
        rejected: "danger"
      };
      const dateRange = vue.ref(null);
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => {
          if (dateRange.value?.length === 2) {
            params.startDate = dateRange.value[0];
            params.endDate = dateRange.value[1];
          }
          return expenseClaimApi.list(params);
        },
        defaultParams: { page: 1, pageSize: 20, status: "", employeeId: "" }
      });
      const employeeOptions = vue.ref([]);
      const bankOptions = vue.ref([]);
      const expenseAccountOptions = vue.ref([]);
      const previewNo = vue.ref("");
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const editId = vue.ref("");
      const formRef = vue.ref();
      function newItem() {
        return { summary: "", accountId: "", amount: 0 };
      }
      const initialForm = {
        claimDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        employeeId: "",
        payMethod: "advance",
        claimType: "payment",
        bankAccountId: "",
        remark: "",
        items: [newItem()]
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        claimDate: [{ required: true, message: "请选择报销日期", trigger: "change" }],
        employeeId: [{ required: true, message: "请选择报销人", trigger: "change" }]
      };
      const dialogTitle = vue.computed(() => editId.value ? "编辑报销单" : "新增报销单");
      const totalAmount = vue.computed(
        () => form.items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0)
      );
      function onReset() {
        query.value.status = "";
        query.value.employeeId = "";
        dateRange.value = null;
        reset();
      }
      function onPayMethodChange() {
        if (form.payMethod === "advance") form.bankAccountId = "";
        else form.claimType = "payment";
      }
      async function onCreate() {
        editId.value = "";
        Object.assign(form, JSON.parse(JSON.stringify(initialForm)));
        try {
          previewNo.value = await expenseClaimApi.nextNo(form.claimDate);
        } catch {
          previewNo.value = "";
        }
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onEdit(row) {
        editId.value = row.id;
        const detail2 = await expenseClaimApi.detail(row.id);
        Object.assign(form, {
          claimDate: String(detail2.claimDate).slice(0, 10),
          employeeId: detail2.employeeId,
          payMethod: detail2.payMethod,
          claimType: detail2.claimType ?? "payment",
          bankAccountId: detail2.bankAccountId ?? "",
          remark: detail2.remark ?? "",
          items: (detail2.items ?? []).map((i) => ({
            summary: i.summary ?? "",
            accountId: i.accountId ?? "",
            amount: Number(i.amount ?? 0)
          }))
        });
        if (!form.items.length) form.items = [newItem()];
        previewNo.value = detail2.claimNo;
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        const items = form.items.filter((i) => (Number(i.amount) || 0) > 0);
        if (!items.length) {
          elementPlus.ElMessage.warning("请至少录入一条金额大于 0 的费用明细");
          return;
        }
        saving.value = true;
        try {
          const payload = { ...form, items };
          if (!payload.bankAccountId) delete payload.bankAccountId;
          if (!payload.remark) delete payload.remark;
          if (editId.value) await expenseClaimApi.update(editId.value, payload);
          else await expenseClaimApi.create(payload);
          ok(editId.value ? "修改成功" : "保存成功，审核后自动生成记账凭证");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      async function onApprove(row) {
        try {
          await elementPlus.ElMessageBox.confirm(
            `审核后将为「${row.claimNo}」生成记账凭证（${formatAmount(row.totalAmount)} 元），确认审核吗？`,
            "审核报销单",
            { type: "warning" }
          );
        } catch {
          return;
        }
        try {
          await expenseClaimApi.approve(row.id);
          ok("审核成功，已生成记账凭证");
          load();
        } catch {
        }
      }
      const payVisible = vue.ref(false);
      const payRow = vue.ref(null);
      const payAccountId = vue.ref("");
      const paying = vue.ref(false);
      function onPay(row) {
        payRow.value = row;
        payAccountId.value = row.bankAccountId ?? "";
        payVisible.value = true;
      }
      async function submitPay() {
        const row = payRow.value;
        if (!row) return;
        if (!payAccountId.value) {
          elementPlus.ElMessage.warning("请选择付款账户");
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(
            `确认支付 ${formatAmount(row.totalAmount)} 元给「${row.employeeName}」吗？`,
            "报销付款",
            { type: "warning" }
          );
        } catch {
          return;
        }
        paying.value = true;
        try {
          await expenseClaimApi.pay(row.id, { bankAccountId: payAccountId.value });
          ok("付款成功，已生成付款凭证");
          payVisible.value = false;
          load();
        } catch {
        } finally {
          paying.value = false;
        }
      }
      async function onReject(row) {
        let reason = "";
        try {
          const res = await elementPlus.ElMessageBox.prompt("请填写驳回原因", "驳回报销单", {
            inputValidator: (v) => v && v.trim() ? true : "请填写驳回原因"
          });
          reason = res.value ?? "";
        } catch {
          return;
        }
        try {
          await expenseClaimApi.reject(row.id, reason);
          ok("已驳回");
          load();
        } catch {
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`报销单「${row.claimNo}」`)) return;
        try {
          await expenseClaimApi.remove(row.id);
          ok("删除成功");
          load();
        } catch {
        }
      }
      const importVisible = vue.ref(false);
      const importFileList = vue.ref([]);
      const importParsing = vue.ref(false);
      const importPreviewData = vue.ref(null);
      const importRows = vue.ref([]);
      const importCommitting = vue.ref(false);
      const importUnmatchedCount = vue.computed(
        () => importRows.value.filter((r) => !r.employeeId).length
      );
      function onImportFileChange(_file, files) {
        importFileList.value = files;
        onImportParse();
      }
      function onImportFileRemove(_file, files) {
        importFileList.value = files;
      }
      async function onImportParse() {
        const raw = importFileList.value.find((f) => f.raw instanceof File)?.raw;
        if (!raw) return;
        importParsing.value = true;
        try {
          const res = await expenseClaimApi.importPreview(raw);
          importPreviewData.value = res;
          importRows.value = (res.rows ?? []).map((r) => ({ ...r }));
        } finally {
          importParsing.value = false;
        }
      }
      function backToUpload() {
        importPreviewData.value = null;
        importRows.value = [];
        importFileList.value = [];
      }
      function onImportEmployeeChange(row) {
        if (row.employeeId) row.message = "";
      }
      async function onImportCommit() {
        const rows = importRows.value.filter((r) => r.matched && r.employeeId);
        if (!rows.length) {
          elementPlus.ElMessage.warning("没有可导入的行，请先为未匹配的报销人选择员工档案");
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(
            `将生成 ${rows.length} 条报销单草稿，审核后才会生成凭证，确认导入吗？`,
            "确认导入",
            { type: "warning", confirmButtonText: "确认导入", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        importCommitting.value = true;
        try {
          const res = await expenseClaimApi.importCommit({
            rows: rows.map((r) => {
              const item = {
                employeeId: r.employeeId,
                claimDate: r.claimDate,
                amount: Number(r.amount ?? 0),
                payMethod: r.payMethod
              };
              if (r.claimNo) item.claimNo = r.claimNo;
              if (r.summary) item.summary = r.summary;
              return item;
            })
          });
          ok(`导入完成：生成 ${res.created} 条报销单草稿`);
          if (res.failed) elementPlus.ElMessage.warning(`有 ${res.failed} 行导入失败`);
          importVisible.value = false;
          backToUpload();
          load();
        } finally {
          importCommitting.value = false;
        }
      }
      const detailVisible = vue.ref(false);
      const detail = vue.ref(null);
      async function onView(row) {
        detail.value = await expenseClaimApi.detail(row.id);
        detailVisible.value = true;
      }
      function onExport() {
        exportExcel({
          filename: `报销单_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
          sheetName: "报销单",
          columns: [
            { title: "单号", prop: "claimNo", width: 14 },
            { title: "报销日期", prop: "claimDate", width: 12 },
            { title: "报销人", prop: "employeeName", width: 12 },
            { title: "部门", prop: "departmentName", width: 14 },
            { title: "支付方式", prop: "payMethod", width: 12, format: (r) => PAY_METHODS[r.payMethod] ?? "" },
            {
              title: "类型",
              prop: "claimType",
              width: 10,
              format: (r) => r.claimTypeLabel || (r.claimType === "loan_offset" ? "冲抵借款" : "直接付款")
            },
            { title: "金额合计", prop: "totalAmount", width: 15, amount: true },
            { title: "状态", prop: "statusLabel", width: 10 }
          ],
          rows: list.value
        });
        elementPlus.ElMessage.success("导出成功");
      }
      const selected = vue.ref([]);
      const pdfExporting = vue.ref(false);
      async function onPdfPackage() {
        const ids = selected.value.map((r) => r.id);
        const count = ids.length || total.value;
        if (!count) {
          elementPlus.ElMessage.warning("当前没有可导出的报销单");
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(
            ids.length ? `将把选中的 ${ids.length} 张报销单各生成一份 PDF（原始凭证存根）并打包为压缩包下载，解压后即可打印。继续吗？` : `未勾选单据时将按当前筛选条件打包全部 ${total.value} 张报销单 PDF，继续吗？`,
            "生成原始凭证 PDF",
            { type: "info", confirmButtonText: "生成并下载", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        pdfExporting.value = true;
        try {
          const payload = ids.length ? { ids } : {
            status: query.value.status || void 0,
            employeeId: query.value.employeeId || void 0,
            startDate: dateRange.value?.[0],
            endDate: dateRange.value?.[1]
          };
          await expenseClaimApi.downloadPdfPackage(payload);
          ok(`已生成 ${count} 张报销单 PDF 压缩包`);
        } finally {
          pdfExporting.value = false;
        }
      }
      vue.onMounted(async () => {
        employeeOptions.value = await employeeApi.options();
        bankOptions.value = await bankApi.options();
        const all = await accountApi.options();
        expenseAccountOptions.value = all.filter((a) => a.category === "profit" || a.category === "cost");
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_radio = vue.resolveComponent("el-radio");
        const _component_el_radio_group = vue.resolveComponent("el-radio-group");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_divider = vue.resolveComponent("el-divider");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _component_el_drawer = vue.resolveComponent("el-drawer");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$3, [
          vue.createElementVNode("div", _hoisted_2$3, [
            vue.createElementVNode("div", _hoisted_3$3, [
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).status,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).status = $event),
                placeholder: "单据状态",
                clearable: "",
                style: { "width": "130px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(STATUS_LABELS, (label, key) => {
                    return vue.createVNode(_component_el_option, {
                      key,
                      label,
                      value: key
                    }, null, 8, ["label", "value"]);
                  }), 64))
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).employeeId,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => vue.unref(query).employeeId = $event),
                placeholder: "报销人",
                clearable: "",
                filterable: "",
                style: { "width": "160px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employeeOptions.value, (e) => {
                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                      key: e.id,
                      label: `${e.code} ${e.name}`,
                      value: e.id
                    }, null, 8, ["label", "value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_date_picker, {
                modelValue: dateRange.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => dateRange.value = $event),
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
                  _cache[23] || (_cache[23] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: onReset }, {
                default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }),
              _cache[29] || (_cache[29] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, {
                loading: pdfExporting.value,
                onClick: onPdfPackage
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Printer))
                    ]),
                    _: 1
                  }),
                  _cache[25] || (_cache[25] = vue.createTextVNode("生成凭证PDF ", -1))
                ]),
                _: 1
              }, 8, ["loading"]),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[26] || (_cache[26] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              }),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                onClick: _cache[3] || (_cache[3] = ($event) => importVisible.value = true)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Upload))
                    ]),
                    _: 1
                  }),
                  _cache[27] || (_cache[27] = vue.createTextVNode("导入 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:expense-claim:create"]
              ]),
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
                  _cache[28] || (_cache[28] = vue.createTextVNode("新增报销单 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:expense-claim:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无报销单",
              onSelectionChange: _cache[4] || (_cache[4] = ($event) => selected.value = $event)
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  type: "selection",
                  width: "42"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "claimNo",
                  label: "单号",
                  width: "130"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "claimDate",
                  label: "报销日期",
                  width: "115"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "报销人",
                  width: "160"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.employeeName), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "departmentName",
                  label: "部门",
                  "min-width": "130"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.departmentName || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "支付方式",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: PAY_METHOD_TAGS[row.payMethod],
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(PAY_METHODS[row.payMethod]), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "类型",
                  width: "95"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      size: "small",
                      type: row.claimType === "loan_offset" ? "warning" : "primary"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.claimTypeLabel || (row.claimType === "loan_offset" ? "冲抵借款" : "直接付款")), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "金额合计",
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_4$3, vue.toDisplayString(vue.unref(formatAmount)(row.totalAmount)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "状态",
                  width: "110",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: STATUS_TAGS[row.status],
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.statusLabel), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "凭证",
                  width: "90",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.voucherId ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 0,
                      type: "success",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [..._cache[30] || (_cache[30] = [
                        vue.createTextVNode("已生成", -1)
                      ])]),
                      _: 1
                    })) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_5$3, "-"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "250",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onView(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[31] || (_cache[31] = [
                        vue.createTextVNode("查看", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"]),
                    row.status === "draft" ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "primary",
                        onClick: ($event) => onEdit(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[32] || (_cache[32] = [
                          vue.createTextVNode("编辑", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "hr:expense-claim:update"]
                      ]),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "success",
                        onClick: ($event) => onApprove(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[33] || (_cache[33] = [
                          vue.createTextVNode("审核", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "hr:expense-claim:approve"]
                      ]),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "info",
                        onClick: ($event) => onReject(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[34] || (_cache[34] = [
                          vue.createTextVNode("驳回", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "hr:expense-claim:approve"]
                      ])
                    ], 64)) : vue.createCommentVNode("", true),
                    row.status === "approved" && (row.payMethod !== "advance" || row.claimType === "payment") ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 1,
                      link: "",
                      type: "warning",
                      onClick: ($event) => onPay(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[35] || (_cache[35] = [
                        vue.createTextVNode(" 付款 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:expense-claim:pay"]
                    ]) : vue.createCommentVNode("", true),
                    row.status !== "paid" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 2,
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[36] || (_cache[36] = [
                        vue.createTextVNode(" 删除 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:expense-claim:delete"]
                    ]) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_6$3, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[5] || (_cache[5] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[6] || (_cache[6] = ($event) => vue.unref(query).pageSize = $event),
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
            "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => dialogVisible.value = $event),
            title: dialogTitle.value,
            width: "860px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[14] || (_cache[14] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[44] || (_cache[44] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[45] || (_cache[45] = [
                  vue.createTextVNode("保存草稿", -1)
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "报销单号" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_tag, { type: "info" }, {
                                default: vue.withCtx(() => [
                                  vue.createTextVNode(vue.toDisplayString(previewNo.value), 1)
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "报销日期",
                            prop: "claimDate"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.claimDate,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.claimDate = $event),
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "报销人",
                            prop: "employeeId"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.employeeId,
                                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.employeeId = $event),
                                filterable: "",
                                placeholder: "选择员工",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employeeOptions.value, (e) => {
                                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                                      key: e.id,
                                      label: `${e.code} ${e.name}`,
                                      value: e.id
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "支付方式" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.payMethod,
                                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.payMethod = $event),
                                style: { "width": "100%" },
                                onChange: onPayMethodChange
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(PAY_METHODS, (label, key) => {
                                    return vue.createVNode(_component_el_option, {
                                      key,
                                      label,
                                      value: key
                                    }, null, 8, ["label", "value"]);
                                  }), 64))
                                ]),
                                _: 1
                              }, 8, ["modelValue"]),
                              vue.createElementVNode("div", _hoisted_7$3, vue.toDisplayString(PAY_METHOD_HINTS[form.payMethod]), 1)
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      form.payMethod === "advance" ? (vue.openBlock(), vue.createBlock(_component_el_col, {
                        key: 0,
                        span: 8
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "报销类型" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_radio_group, {
                                modelValue: form.claimType,
                                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.claimType = $event)
                              }, {
                                default: vue.withCtx(() => [
                                  vue.createVNode(_component_el_radio, { value: "payment" }, {
                                    default: vue.withCtx(() => [..._cache[37] || (_cache[37] = [
                                      vue.createTextVNode("直接付款", -1)
                                    ])]),
                                    _: 1
                                  }),
                                  vue.createVNode(_component_el_radio, { value: "loan_offset" }, {
                                    default: vue.withCtx(() => [..._cache[38] || (_cache[38] = [
                                      vue.createTextVNode("冲抵借款", -1)
                                    ])]),
                                    _: 1
                                  })
                                ]),
                                _: 1
                              }, 8, ["modelValue"]),
                              vue.createElementVNode("div", _hoisted_8$3, vue.toDisplayString(form.claimType === "loan_offset" ? "审核时挂「其他应收款-员工」，按借款日期先后自动冲抵借款，无需付款" : "审核时挂「其他应收款-员工」，审核后点「付款」支付给员工"), 1)
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })) : vue.createCommentVNode("", true),
                      form.payMethod !== "advance" ? (vue.openBlock(), vue.createBlock(_component_el_col, {
                        key: 1,
                        span: 8
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "付款账户" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.bankAccountId,
                                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.bankAccountId = $event),
                                clearable: "",
                                filterable: "",
                                placeholder: "付款时选择",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(bankOptions.value, (b) => {
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
                          })
                        ]),
                        _: 1
                      })) : vue.createCommentVNode("", true)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["model"]),
              vue.createVNode(_component_el_divider, { "content-position": "left" }, {
                default: vue.withCtx(() => [..._cache[39] || (_cache[39] = [
                  vue.createTextVNode("费用明细", -1)
                ])]),
                _: 1
              }),
              vue.createElementVNode("table", _hoisted_9$3, [
                _cache[41] || (_cache[41] = vue.createElementVNode("thead", null, [
                  vue.createElementVNode("tr", null, [
                    vue.createElementVNode("th", { style: { "width": "200px" } }, "费用说明"),
                    vue.createElementVNode("th", { style: { "width": "260px" } }, "费用科目"),
                    vue.createElementVNode("th", { style: { "width": "140px" } }, "金额"),
                    vue.createElementVNode("th", { style: { "width": "60px" } }, "操作")
                  ])
                ], -1)),
                vue.createElementVNode("tbody", null, [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(form.items, (item, index) => {
                    return vue.openBlock(), vue.createElementBlock("tr", { key: index }, [
                      vue.createElementVNode("td", null, [
                        vue.createElementVNode("div", _hoisted_10$3, [
                          vue.createVNode(_component_el_input, {
                            modelValue: item.summary,
                            "onUpdate:modelValue": ($event) => item.summary = $event,
                            placeholder: "如：差旅费"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ])
                      ]),
                      vue.createElementVNode("td", null, [
                        vue.createElementVNode("div", _hoisted_11$3, [
                          vue.createVNode(_component_el_select, {
                            modelValue: item.accountId,
                            "onUpdate:modelValue": ($event) => item.accountId = $event,
                            filterable: "",
                            clearable: "",
                            placeholder: "默认取管理费用",
                            style: { "width": "100%" }
                          }, {
                            default: vue.withCtx(() => [
                              (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(expenseAccountOptions.value, (a) => {
                                return vue.openBlock(), vue.createBlock(_component_el_option, {
                                  key: a.id,
                                  label: `${a.code} ${a.fullName}`,
                                  value: a.id
                                }, null, 8, ["label", "value"]);
                              }), 128))
                            ]),
                            _: 1
                          }, 8, ["modelValue", "onUpdate:modelValue"])
                        ])
                      ]),
                      vue.createElementVNode("td", null, [
                        vue.createElementVNode("div", _hoisted_12$3, [
                          vue.createVNode(_component_el_input_number, {
                            modelValue: item.amount,
                            "onUpdate:modelValue": ($event) => item.amount = $event,
                            min: 0,
                            precision: 2,
                            controls: false,
                            style: { "width": "100%" }
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ])
                      ]),
                      vue.createElementVNode("td", _hoisted_13$3, [
                        vue.createVNode(_component_el_button, {
                          link: "",
                          type: "danger",
                          disabled: form.items.length <= 1,
                          onClick: ($event) => form.items.splice(index, 1)
                        }, {
                          default: vue.withCtx(() => [..._cache[40] || (_cache[40] = [
                            vue.createTextVNode(" 删除 ", -1)
                          ])]),
                          _: 1
                        }, 8, ["disabled", "onClick"])
                      ])
                    ]);
                  }), 128))
                ])
              ]),
              vue.createElementVNode("div", _hoisted_14$3, [
                vue.createVNode(_component_el_button, {
                  size: "small",
                  onClick: _cache[12] || (_cache[12] = ($event) => form.items.push(newItem()))
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_icon, null, {
                      default: vue.withCtx(() => [
                        vue.createVNode(vue.unref(iconsVue.Plus))
                      ]),
                      _: 1
                    }),
                    _cache[42] || (_cache[42] = vue.createTextVNode("增加费用行 ", -1))
                  ]),
                  _: 1
                }),
                vue.createElementVNode("span", _hoisted_15$3, [
                  _cache[43] || (_cache[43] = vue.createTextVNode(" 合计：", -1)),
                  vue.createElementVNode("b", _hoisted_16$3, vue.toDisplayString(vue.unref(formatAmount)(totalAmount.value)), 1)
                ])
              ]),
              vue.createVNode(_component_el_form, {
                "label-width": "100px",
                class: "mt12"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.remark = $event),
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
              })
            ]),
            _: 1
          }, 8, ["modelValue", "title"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: importVisible.value,
            "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => importVisible.value = $event),
            title: "导入报销单",
            width: "1040px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[16] || (_cache[16] = ($event) => importVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[49] || (_cache[49] = [
                  vue.createTextVNode("关闭", -1)
                ])]),
                _: 1
              }),
              importPreviewData.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_button, { onClick: backToUpload }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_icon, null, {
                      default: vue.withCtx(() => [
                        vue.createVNode(vue.unref(iconsVue.Back))
                      ]),
                      _: 1
                    }),
                    _cache[50] || (_cache[50] = vue.createTextVNode("重新选择文件", -1))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_button, {
                  type: "primary",
                  loading: importCommitting.value,
                  onClick: onImportCommit
                }, {
                  default: vue.withCtx(() => [..._cache[51] || (_cache[51] = [
                    vue.createTextVNode("确认导入", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"])
              ], 64)) : vue.createCommentVNode("", true)
            ]),
            default: vue.withCtx(() => [
              !importPreviewData.value ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_upload, {
                key: 0,
                drag: "",
                "auto-upload": false,
                limit: 1,
                accept: ".xlsx,.xls,.csv",
                "on-change": onImportFileChange,
                "on-remove": onImportFileRemove,
                "file-list": importFileList.value
              }, {
                tip: vue.withCtx(() => [..._cache[46] || (_cache[46] = [
                  vue.createElementVNode("div", { class: "el-upload__tip" }, "按表头关键词自动映射（单号/报销日期/报销人/支付方式/金额/费用说明等），选择文件后立即解析预览；未匹配的报销人可在预览中手动指定", -1)
                ])]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, { class: "el-icon--upload" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.UploadFilled))
                    ]),
                    _: 1
                  }),
                  _cache[47] || (_cache[47] = vue.createElementVNode("div", { class: "el-upload__text" }, [
                    vue.createTextVNode("拖拽 Excel / CSV 到此处，或"),
                    vue.createElementVNode("em", null, "点击选择")
                  ], -1))
                ]),
                _: 1
              }, 8, ["file-list"])), [
                [_directive_loading, importParsing.value]
              ]) : (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                vue.createElementVNode("div", _hoisted_17$3, [
                  vue.createVNode(_component_el_alert, {
                    type: importPreviewData.value.summary.unmatched || importPreviewData.value.summary.duplicates ? "warning" : "success",
                    closable: false,
                    "show-icon": "",
                    class: "import-head__alert",
                    title: `共 ${importPreviewData.value.summary.total} 行：匹配 ${importPreviewData.value.summary.matched} 行，未匹配 ${importPreviewData.value.summary.unmatched} 行，金额合计 ${vue.unref(formatAmount)(importPreviewData.value.summary.totalAmount)}`
                  }, null, 8, ["type", "title"])
                ]),
                vue.createVNode(_component_el_table, {
                  data: importRows.value,
                  size: "small",
                  "max-height": "440px"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      type: "index",
                      label: "#",
                      width: "45",
                      align: "center"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "单号",
                      width: "120"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.claimNoTaken ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                          key: 0,
                          size: "small",
                          type: "info"
                        }, {
                          default: vue.withCtx(() => [..._cache[48] || (_cache[48] = [
                            vue.createTextVNode("自动生成", -1)
                          ])]),
                          _: 1
                        })) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_18$1, vue.toDisplayString(row.claimNo || "-"), 1))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "claimDate",
                      label: "报销日期",
                      width: "105"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "报销人",
                      width: "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.matched ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                          vue.createTextVNode(vue.toDisplayString(row.employeeName), 1)
                        ], 64)) : (vue.openBlock(), vue.createBlock(_component_el_select, {
                          key: 1,
                          modelValue: row.employeeId,
                          "onUpdate:modelValue": ($event) => row.employeeId = $event,
                          filterable: "",
                          placeholder: "选择员工",
                          size: "small",
                          style: { "width": "100%" },
                          onChange: ($event) => onImportEmployeeChange(row)
                        }, {
                          default: vue.withCtx(() => [
                            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employeeOptions.value, (e) => {
                              return vue.openBlock(), vue.createBlock(_component_el_option, {
                                key: e.id,
                                label: `${e.code} ${e.name}`,
                                value: e.id
                              }, null, 8, ["label", "value"]);
                            }), 128))
                          ]),
                          _: 1
                        }, 8, ["modelValue", "onUpdate:modelValue", "onChange"]))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "支付方式",
                      width: "105"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.payMethodLabel || PAY_METHODS[row.payMethod]), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "金额",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_19$1, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "message",
                      label: "说明",
                      "min-width": "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", {
                          class: vue.normalizeClass({ "import-warning-text": row.duplicate })
                        }, vue.toDisplayString(row.message), 3)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                importUnmatchedCount.value ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_20$1, vue.toDisplayString(importUnmatchedCount.value) + " 行未匹配到员工档案，请在行内选择员工；未选择的行将被跳过。 ", 1)) : vue.createCommentVNode("", true)
              ], 64))
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_drawer, {
            modelValue: detailVisible.value,
            "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => detailVisible.value = $event),
            title: "报销单详情",
            size: "720px"
          }, {
            default: vue.withCtx(() => [
              detail.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_descriptions, {
                  column: 2,
                  border: ""
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_descriptions_item, { label: "单号" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.claimNo), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "状态" }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_tag, {
                          type: STATUS_TAGS[detail.value.status],
                          size: "small"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(detail.value.statusLabel), 1)
                          ]),
                          _: 1
                        }, 8, ["type"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "报销日期" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.claimDate), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "报销人" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.employeeName), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "部门" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.departmentName || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "支付方式" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(PAY_METHODS[detail.value.payMethod]), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "类型" }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_tag, {
                          size: "small",
                          type: detail.value.claimType === "loan_offset" ? "warning" : "primary"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(detail.value.claimTypeLabel || (detail.value.claimType === "loan_offset" ? "冲抵借款" : "直接付款")), 1)
                          ]),
                          _: 1
                        }, 8, ["type"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "金额合计" }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("span", _hoisted_21$1, vue.toDisplayString(vue.unref(formatAmount)(detail.value.totalAmount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "付款账户" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.bankAccountName || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, {
                      label: "备注",
                      span: 2
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.remark || "-"), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table, {
                  data: detail.value.items ?? [],
                  class: "mt12",
                  size: "small"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "summary",
                      label: "费用说明",
                      "min-width": "150"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "费用科目",
                      "min-width": "180"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.accountCode ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_22$1, vue.toDisplayString(row.accountCode) + " " + vue.toDisplayString(row.accountName), 1)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_23$1, "默认（管理费用）"))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "金额",
                      width: "130",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_24$1, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"])
              ], 64)) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: payVisible.value,
            "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => payVisible.value = $event),
            title: "报销付款",
            width: "440px"
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[21] || (_cache[21] = ($event) => payVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[52] || (_cache[52] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: paying.value,
                onClick: submitPay
              }, {
                default: vue.withCtx(() => [..._cache[53] || (_cache[53] = [
                  vue.createTextVNode("确认付款", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_form, {
                "label-width": "90px",
                onSubmit: _cache[20] || (_cache[20] = vue.withModifiers(() => {
                }, ["prevent"]))
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "报销单" }, {
                    default: vue.withCtx(() => [
                      vue.createElementVNode("span", null, vue.toDisplayString(payRow.value?.claimNo), 1),
                      payRow.value?.claimType ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                        key: 0,
                        size: "small",
                        class: "ml6",
                        type: payRow.value?.claimType === "loan_offset" ? "warning" : "primary"
                      }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(vue.toDisplayString(payRow.value?.claimTypeLabel || (payRow.value?.claimType === "loan_offset" ? "冲抵借款" : "直接付款")), 1)
                        ]),
                        _: 1
                      }, 8, ["type"])) : vue.createCommentVNode("", true)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "报销人" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(payRow.value?.employeeName), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "付款金额" }, {
                    default: vue.withCtx(() => [
                      vue.createElementVNode("span", _hoisted_25$1, vue.toDisplayString(vue.unref(formatAmount)(Number(payRow.value?.totalAmount ?? 0))) + " 元", 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "付款账户",
                    required: ""
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: payAccountId.value,
                        "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => payAccountId.value = $event),
                        filterable: "",
                        placeholder: "选择资金账户",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(bankOptions.value, (b) => {
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
  const HrExpenseClaimsPage = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-8619b50c"]]);
  const _hoisted_1$2 = { class: "page" };
  const _hoisted_2$2 = { class: "page-card" };
  const _hoisted_3$2 = { class: "page-toolbar" };
  const _hoisted_4$2 = { class: "amount amount--total" };
  const _hoisted_5$2 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_6$2 = { class: "page-pagination" };
  const _hoisted_7$2 = { class: "ml8" };
  const _hoisted_8$2 = { class: "ml8" };
  const _hoisted_9$2 = { class: "amount amount--total" };
  const _hoisted_10$2 = { class: "amount" };
  const _hoisted_11$2 = { class: "ml8" };
  const _hoisted_12$2 = { class: "amount amount--outstanding" };
  const _hoisted_13$2 = { class: "import-head" };
  const _hoisted_14$2 = { key: 1 };
  const _hoisted_15$2 = { class: "amount amount--total" };
  const _hoisted_16$2 = {
    key: 0,
    class: "import-warning"
  };
  const _hoisted_17$2 = { class: "amount amount--total" };
  const _sfc_main$3 = /* @__PURE__ */ vue.defineComponent({
    __name: "loans",
    setup(__props) {
      const PAY_METHODS = {
        cash: "现金",
        bank: "银行转账"
      };
      const PAY_METHOD_TAGS = { cash: "primary", bank: "success" };
      const STATUS_LABELS = {
        draft: "草稿",
        approved: "已借款",
        repaid: "已还款",
        rejected: "已驳回"
      };
      const STATUS_TAGS = {
        draft: "info",
        approved: "warning",
        repaid: "primary",
        rejected: "danger"
      };
      const dateRange = vue.ref(null);
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => {
          if (dateRange.value?.length === 2) {
            params.startDate = dateRange.value[0];
            params.endDate = dateRange.value[1];
          }
          return loanApi.list(params);
        },
        defaultParams: { page: 1, pageSize: 20, status: "", employeeId: "" }
      });
      const employeeOptions = vue.ref([]);
      const bankOptions = vue.ref([]);
      const previewNo = vue.ref("");
      const dialogVisible = vue.ref(false);
      const saving = vue.ref(false);
      const editId = vue.ref("");
      const formRef = vue.ref();
      const initialForm = {
        loanDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        employeeId: "",
        amount: 0,
        reason: "",
        payMethod: "cash",
        bankAccountId: "",
        remark: ""
      };
      const form = vue.reactive({ ...initialForm });
      const rules = {
        loanDate: [{ required: true, message: "请选择借款日期", trigger: "change" }],
        employeeId: [{ required: true, message: "请选择借款人", trigger: "change" }],
        amount: [{ required: true, message: "请输入借款金额", trigger: "blur" }]
      };
      const dialogTitle = vue.computed(() => editId.value ? "编辑借款单" : "新增借款单");
      function onReset() {
        query.value.status = "";
        query.value.employeeId = "";
        dateRange.value = null;
        reset();
      }
      function onPayMethodChange() {
        if (form.payMethod === "cash") form.bankAccountId = "";
      }
      async function onCreate() {
        editId.value = "";
        Object.assign(form, JSON.parse(JSON.stringify(initialForm)));
        try {
          previewNo.value = await loanApi.nextNo(form.loanDate);
        } catch {
          previewNo.value = "";
        }
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onEdit(row) {
        editId.value = row.id;
        const detail2 = await loanApi.detail(row.id);
        Object.assign(form, {
          loanDate: String(detail2.loanDate).slice(0, 10),
          employeeId: detail2.employeeId,
          amount: Number(detail2.amount ?? 0),
          reason: detail2.reason ?? "",
          payMethod: detail2.payMethod,
          bankAccountId: detail2.bankAccountId ?? "",
          remark: detail2.remark ?? ""
        });
        previewNo.value = detail2.loanNo;
        dialogVisible.value = true;
        vue.nextTick(() => formRef.value?.clearValidate());
      }
      async function onSubmit() {
        const valid = await formRef.value?.validate().catch(() => false);
        if (!valid) return;
        if ((Number(form.amount) || 0) <= 0) {
          elementPlus.ElMessage.warning("借款金额必须大于 0");
          return;
        }
        saving.value = true;
        try {
          const payload = { ...form };
          if (!payload.bankAccountId) delete payload.bankAccountId;
          if (!payload.reason) delete payload.reason;
          if (!payload.remark) delete payload.remark;
          if (editId.value) await loanApi.update(editId.value, payload);
          else await loanApi.create(payload);
          ok(editId.value ? "修改成功" : "保存成功，审核后自动发放借款并生成凭证");
          dialogVisible.value = false;
          load();
        } finally {
          saving.value = false;
        }
      }
      async function onApprove(row) {
        try {
          await elementPlus.ElMessageBox.confirm(
            `审核后将向「${row.employeeName}」发放借款 ${formatAmount(row.amount)} 元，并生成借款凭证，确认审核吗？`,
            "审核借款单",
            { type: "warning" }
          );
        } catch {
          return;
        }
        try {
          await loanApi.approve(row.id);
          ok("审核成功，已发放借款并生成凭证");
          load();
        } catch {
        }
      }
      const repayVisible = vue.ref(false);
      const repaying = vue.ref(false);
      const repayRow = vue.ref(null);
      const repayFormRef = vue.ref();
      const repayForm = vue.reactive({
        amount: void 0,
        repayMethod: "cash",
        bankAccountId: "",
        repayDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        remark: ""
      });
      const repayRules = {
        amount: [{ required: true, message: "请填写本次还款金额", trigger: "blur" }],
        repayMethod: [{ required: true, message: "请选择还款方式", trigger: "change" }],
        repayDate: [{ required: true, message: "请选择还款日期", trigger: "change" }]
      };
      function onRepay(row) {
        repayRow.value = row;
        Object.assign(repayForm, {
          amount: row.outstanding ?? row.amount,
          // 默认剩余欠款全额
          repayMethod: row.payMethod,
          bankAccountId: row.bankAccountId ?? "",
          repayDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          remark: ""
        });
        repayVisible.value = true;
        vue.nextTick(() => repayFormRef.value?.clearValidate());
      }
      async function onRepaySubmit() {
        const valid = await repayFormRef.value?.validate().catch(() => false);
        if (!valid) return;
        repaying.value = true;
        try {
          const payload = { ...repayForm };
          if (!payload.bankAccountId) delete payload.bankAccountId;
          if (!payload.remark) delete payload.remark;
          const res = await loanApi.repay(repayRow.value.id, payload);
          const cleared = res?.status === "repaid";
          ok(cleared ? "已还清，状态更新为「已还款」" : "部分还款成功，已生成还款凭证");
          repayVisible.value = false;
          load();
        } finally {
          repaying.value = false;
        }
      }
      async function onReject(row) {
        let reason = "";
        try {
          const res = await elementPlus.ElMessageBox.prompt("请填写驳回原因", "驳回借款单", {
            inputValidator: (v) => v && v.trim() ? true : "请填写驳回原因"
          });
          reason = res.value ?? "";
        } catch {
          return;
        }
        try {
          await loanApi.reject(row.id, reason);
          ok("已驳回");
          load();
        } catch {
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`借款单「${row.loanNo}」`)) return;
        try {
          await loanApi.remove(row.id);
          ok("删除成功");
          load();
        } catch {
        }
      }
      const importVisible = vue.ref(false);
      const importFileList = vue.ref([]);
      const importParsing = vue.ref(false);
      const importPreviewData = vue.ref(null);
      const importRows = vue.ref([]);
      const importCommitting = vue.ref(false);
      const importUnmatchedCount = vue.computed(
        () => importRows.value.filter((r) => !r.employeeId).length
      );
      function onImportFileChange(_file, files) {
        importFileList.value = files;
        onImportParse();
      }
      function onImportFileRemove(_file, files) {
        importFileList.value = files;
      }
      async function onImportParse() {
        const raw = importFileList.value.find((f) => f.raw instanceof File)?.raw;
        if (!raw) return;
        importParsing.value = true;
        try {
          const res = await loanApi.importPreview(raw);
          importPreviewData.value = res;
          importRows.value = (res.rows ?? []).map((r) => ({ ...r }));
        } finally {
          importParsing.value = false;
        }
      }
      function backToUpload() {
        importPreviewData.value = null;
        importRows.value = [];
        importFileList.value = [];
      }
      function onImportEmployeeChange(row) {
        if (row.employeeId) row.message = "";
      }
      async function onImportCommit() {
        const rows = importRows.value.filter((r) => r.matched && r.employeeId);
        if (!rows.length) {
          elementPlus.ElMessage.warning("没有可导入的行，请先为未匹配的借款人选择员工档案");
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(
            `将生成 ${rows.length} 条借款单草稿，审核后才会生成凭证，确认导入吗？`,
            "确认导入",
            { type: "warning", confirmButtonText: "确认导入", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        importCommitting.value = true;
        try {
          const res = await loanApi.importCommit({
            rows: rows.map((r) => {
              const item = {
                employeeId: r.employeeId,
                loanDate: r.loanDate,
                amount: Number(r.amount ?? 0),
                payMethod: r.payMethod
              };
              if (r.loanNo) item.loanNo = r.loanNo;
              if (r.reason) item.reason = r.reason;
              return item;
            })
          });
          ok(`导入完成：生成 ${res.created} 条借款单草稿`);
          if (res.failed) elementPlus.ElMessage.warning(`有 ${res.failed} 行导入失败`);
          importVisible.value = false;
          backToUpload();
          load();
        } finally {
          importCommitting.value = false;
        }
      }
      const detailVisible = vue.ref(false);
      const detail = vue.ref(null);
      async function onView(row) {
        detail.value = await loanApi.detail(row.id);
        detailVisible.value = true;
      }
      function onExport() {
        exportExcel({
          filename: `借款单_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
          sheetName: "借款单",
          columns: [
            { title: "单号", prop: "loanNo", width: 14 },
            { title: "借款日期", prop: "loanDate", width: 12 },
            { title: "借款人", prop: "employeeName", width: 12 },
            { title: "部门", prop: "departmentName", width: 14 },
            { title: "借款事由", prop: "reason", width: 20 },
            { title: "借款方式", prop: "payMethod", width: 12, format: (r) => PAY_METHODS[r.payMethod] ?? "" },
            { title: "借款金额", prop: "amount", width: 15, amount: true },
            { title: "状态", prop: "statusLabel", width: 10 }
          ],
          rows: list.value
        });
        elementPlus.ElMessage.success("导出成功");
      }
      const selected = vue.ref([]);
      const pdfExporting = vue.ref(false);
      async function onPdfPackage() {
        const ids = selected.value.map((r) => r.id);
        const count = ids.length || total.value;
        if (!count) {
          elementPlus.ElMessage.warning("当前没有可导出的借款单");
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(
            ids.length ? `将把选中的 ${ids.length} 张借款单各生成一份 PDF（原始凭证存根）并打包为压缩包下载，解压后即可打印。继续吗？` : `未勾选单据时将按当前筛选条件打包全部 ${total.value} 张借款单 PDF，继续吗？`,
            "生成原始凭证 PDF",
            { type: "info", confirmButtonText: "生成并下载", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        pdfExporting.value = true;
        try {
          const payload = ids.length ? { ids } : {
            status: query.value.status || void 0,
            employeeId: query.value.employeeId || void 0,
            startDate: dateRange.value?.[0],
            endDate: dateRange.value?.[1]
          };
          await loanApi.downloadPdfPackage(payload);
          ok(`已生成 ${count} 张借款单 PDF 压缩包`);
        } finally {
          pdfExporting.value = false;
        }
      }
      vue.onMounted(async () => {
        employeeOptions.value = await employeeApi.options();
        bankOptions.value = await bankApi.options();
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_col = vue.resolveComponent("el-col");
        const _component_el_row = vue.resolveComponent("el-row");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _component_el_drawer = vue.resolveComponent("el-drawer");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$2, [
          vue.createElementVNode("div", _hoisted_2$2, [
            vue.createElementVNode("div", _hoisted_3$2, [
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).status,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).status = $event),
                placeholder: "单据状态",
                clearable: "",
                style: { "width": "130px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(STATUS_LABELS, (label, key) => {
                    return vue.createVNode(_component_el_option, {
                      key,
                      label,
                      value: key
                    }, null, 8, ["label", "value"]);
                  }), 64))
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).employeeId,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => vue.unref(query).employeeId = $event),
                placeholder: "借款人",
                clearable: "",
                filterable: "",
                style: { "width": "160px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employeeOptions.value, (e) => {
                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                      key: e.id,
                      label: `${e.code} ${e.name}`,
                      value: e.id
                    }, null, 8, ["label", "value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_date_picker, {
                modelValue: dateRange.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => dateRange.value = $event),
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
                  _cache[27] || (_cache[27] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: onReset }, {
                default: vue.withCtx(() => [..._cache[28] || (_cache[28] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }),
              _cache[33] || (_cache[33] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, {
                loading: pdfExporting.value,
                onClick: onPdfPackage
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Printer))
                    ]),
                    _: 1
                  }),
                  _cache[29] || (_cache[29] = vue.createTextVNode("生成凭证PDF ", -1))
                ]),
                _: 1
              }, 8, ["loading"]),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[30] || (_cache[30] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              }),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                onClick: _cache[3] || (_cache[3] = ($event) => importVisible.value = true)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Upload))
                    ]),
                    _: 1
                  }),
                  _cache[31] || (_cache[31] = vue.createTextVNode("导入 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:loan:create"]
              ]),
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
                  _cache[32] || (_cache[32] = vue.createTextVNode("新增借款单 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:loan:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无借款单",
              onSelectionChange: _cache[4] || (_cache[4] = ($event) => selected.value = $event)
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  type: "selection",
                  width: "42"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "loanNo",
                  label: "单号",
                  width: "130"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "loanDate",
                  label: "借款日期",
                  width: "115"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "借款人",
                  width: "160"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.employeeName), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "departmentName",
                  label: "部门",
                  width: "130"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.departmentName || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "reason",
                  label: "借款事由",
                  "min-width": "160"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.reason || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "借款方式",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: PAY_METHOD_TAGS[row.payMethod],
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(PAY_METHODS[row.payMethod]), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "借款金额",
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_4$2, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "状态",
                  width: "110",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: STATUS_TAGS[row.status],
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.repaidAmount > 0 && row.status === "approved" ? "部分已还" : row.statusLabel), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "凭证",
                  width: "90",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.voucherId ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 0,
                      type: "success",
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [..._cache[34] || (_cache[34] = [
                        vue.createTextVNode("已生成", -1)
                      ])]),
                      _: 1
                    })) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_5$2, "-"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "250",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onView(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[35] || (_cache[35] = [
                        vue.createTextVNode("查看", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"]),
                    row.status === "draft" ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "primary",
                        onClick: ($event) => onEdit(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[36] || (_cache[36] = [
                          vue.createTextVNode("编辑", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "hr:loan:update"]
                      ]),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "success",
                        onClick: ($event) => onApprove(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[37] || (_cache[37] = [
                          vue.createTextVNode("审核", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "hr:loan:approve"]
                      ]),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "info",
                        onClick: ($event) => onReject(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[38] || (_cache[38] = [
                          vue.createTextVNode("驳回", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "hr:loan:approve"]
                      ])
                    ], 64)) : vue.createCommentVNode("", true),
                    row.status === "approved" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 1,
                      link: "",
                      type: "warning",
                      onClick: ($event) => onRepay(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[39] || (_cache[39] = [
                        vue.createTextVNode(" 还款 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:loan:repay"]
                    ]) : vue.createCommentVNode("", true),
                    row.status !== "repaid" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 2,
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[40] || (_cache[40] = [
                        vue.createTextVNode(" 删除 ", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:loan:delete"]
                    ]) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_6$2, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[5] || (_cache[5] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[6] || (_cache[6] = ($event) => vue.unref(query).pageSize = $event),
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
            "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => dialogVisible.value = $event),
            title: dialogTitle.value,
            width: "720px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[14] || (_cache[14] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[41] || (_cache[41] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSubmit
              }, {
                default: vue.withCtx(() => [..._cache[42] || (_cache[42] = [
                  vue.createTextVNode("保存草稿", -1)
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "借款单号" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_tag, { type: "info" }, {
                                default: vue.withCtx(() => [
                                  vue.createTextVNode(vue.toDisplayString(previewNo.value), 1)
                                ]),
                                _: 1
                              })
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "借款日期",
                            prop: "loanDate"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_date_picker, {
                                modelValue: form.loanDate,
                                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.loanDate = $event),
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "借款人",
                            prop: "employeeId"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.employeeId,
                                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.employeeId = $event),
                                filterable: "",
                                placeholder: "选择员工",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employeeOptions.value, (e) => {
                                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                                      key: e.id,
                                      label: `${e.code} ${e.name}`,
                                      value: e.id
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, {
                            label: "借款金额",
                            prop: "amount"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_input_number, {
                                modelValue: form.amount,
                                "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.amount = $event),
                                min: 0,
                                precision: 2,
                                controls: false,
                                style: { "width": "100%" }
                              }, null, 8, ["modelValue"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "借款方式" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.payMethod,
                                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.payMethod = $event),
                                style: { "width": "100%" },
                                onChange: onPayMethodChange
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(PAY_METHODS, (label, key) => {
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
                      vue.createVNode(_component_el_col, { span: 8 }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_form_item, { label: "放款账户" }, {
                            default: vue.withCtx(() => [
                              vue.createVNode(_component_el_select, {
                                modelValue: form.bankAccountId,
                                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.bankAccountId = $event),
                                clearable: "",
                                filterable: "",
                                placeholder: "未选则取默认科目",
                                style: { "width": "100%" }
                              }, {
                                default: vue.withCtx(() => [
                                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(bankOptions.value, (b) => {
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
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "借款事由" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.reason,
                        "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.reason = $event),
                        maxlength: "200",
                        "show-word-limit": "",
                        placeholder: "如：差旅费备用金"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.remark,
                        "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.remark = $event),
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
            modelValue: repayVisible.value,
            "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => repayVisible.value = $event),
            title: "借款还款",
            width: "520px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[22] || (_cache[22] = ($event) => repayVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[46] || (_cache[46] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: repaying.value,
                onClick: onRepaySubmit
              }, {
                default: vue.withCtx(() => [..._cache[47] || (_cache[47] = [
                  vue.createTextVNode("确认还款", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_form, {
                ref_key: "repayFormRef",
                ref: repayFormRef,
                model: repayForm,
                rules: repayRules,
                "label-width": "100px"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "借款单号" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_tag, { type: "info" }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(vue.toDisplayString(repayRow.value?.loanNo), 1)
                        ]),
                        _: 1
                      }),
                      vue.createElementVNode("span", _hoisted_7$2, "借款人：" + vue.toDisplayString(repayRow.value?.employeeName), 1),
                      vue.createElementVNode("span", _hoisted_8$2, [
                        _cache[43] || (_cache[43] = vue.createTextVNode("借款：", -1)),
                        vue.createElementVNode("b", _hoisted_9$2, vue.toDisplayString(vue.unref(formatAmount)(repayRow.value?.amount)), 1)
                      ])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "还款进度" }, {
                    default: vue.withCtx(() => [
                      vue.createElementVNode("span", null, [
                        _cache[45] || (_cache[45] = vue.createTextVNode(" 已还：", -1)),
                        vue.createElementVNode("b", _hoisted_10$2, vue.toDisplayString(vue.unref(formatAmount)(repayRow.value?.repaidAmount)), 1),
                        vue.createElementVNode("span", _hoisted_11$2, [
                          _cache[44] || (_cache[44] = vue.createTextVNode("剩余待还：", -1)),
                          vue.createElementVNode("b", _hoisted_12$2, vue.toDisplayString(vue.unref(formatAmount)(repayRow.value?.outstanding)), 1)
                        ])
                      ])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "本次还款",
                    prop: "amount"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input_number, {
                        modelValue: repayForm.amount,
                        "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => repayForm.amount = $event),
                        min: 0.01,
                        max: repayRow.value?.outstanding,
                        precision: 2,
                        step: 100,
                        style: { "width": "220px" }
                      }, null, 8, ["modelValue", "max"]),
                      vue.createVNode(_component_el_button, {
                        class: "ml8",
                        size: "small",
                        onClick: _cache[17] || (_cache[17] = ($event) => repayForm.amount = repayRow.value?.outstanding)
                      }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(" 全额还清（" + vue.toDisplayString(vue.unref(formatAmount)(repayRow.value?.outstanding)) + "） ", 1)
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "还款方式",
                    prop: "repayMethod"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: repayForm.repayMethod,
                        "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => repayForm.repayMethod = $event),
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(PAY_METHODS, (label, key) => {
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
                  }),
                  vue.createVNode(_component_el_form_item, { label: "回款账户" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: repayForm.bankAccountId,
                        "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => repayForm.bankAccountId = $event),
                        clearable: "",
                        filterable: "",
                        placeholder: "未选则取默认科目",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(bankOptions.value, (b) => {
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
                  vue.createVNode(_component_el_form_item, {
                    label: "还款日期",
                    prop: "repayDate"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_date_picker, {
                        modelValue: repayForm.repayDate,
                        "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => repayForm.repayDate = $event),
                        type: "date",
                        "value-format": "YYYY-MM-DD",
                        style: { "width": "100%" }
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "备注" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: repayForm.remark,
                        "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => repayForm.remark = $event),
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
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: importVisible.value,
            "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => importVisible.value = $event),
            title: "导入借款单",
            width: "1040px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[24] || (_cache[24] = ($event) => importVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[51] || (_cache[51] = [
                  vue.createTextVNode("关闭", -1)
                ])]),
                _: 1
              }),
              importPreviewData.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_button, { onClick: backToUpload }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_icon, null, {
                      default: vue.withCtx(() => [
                        vue.createVNode(vue.unref(iconsVue.Back))
                      ]),
                      _: 1
                    }),
                    _cache[52] || (_cache[52] = vue.createTextVNode("重新选择文件", -1))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_button, {
                  type: "primary",
                  loading: importCommitting.value,
                  onClick: onImportCommit
                }, {
                  default: vue.withCtx(() => [..._cache[53] || (_cache[53] = [
                    vue.createTextVNode("确认导入", -1)
                  ])]),
                  _: 1
                }, 8, ["loading"])
              ], 64)) : vue.createCommentVNode("", true)
            ]),
            default: vue.withCtx(() => [
              !importPreviewData.value ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_upload, {
                key: 0,
                drag: "",
                "auto-upload": false,
                limit: 1,
                accept: ".xlsx,.xls,.csv",
                "on-change": onImportFileChange,
                "on-remove": onImportFileRemove,
                "file-list": importFileList.value
              }, {
                tip: vue.withCtx(() => [..._cache[48] || (_cache[48] = [
                  vue.createElementVNode("div", { class: "el-upload__tip" }, "按表头关键词自动映射（单号/借款日期/借款人/借款事由/借款方式/金额等），选择文件后立即解析预览；未匹配的借款人可在预览中手动指定", -1)
                ])]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, { class: "el-icon--upload" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.UploadFilled))
                    ]),
                    _: 1
                  }),
                  _cache[49] || (_cache[49] = vue.createElementVNode("div", { class: "el-upload__text" }, [
                    vue.createTextVNode("拖拽 Excel / CSV 到此处，或"),
                    vue.createElementVNode("em", null, "点击选择")
                  ], -1))
                ]),
                _: 1
              }, 8, ["file-list"])), [
                [_directive_loading, importParsing.value]
              ]) : (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                vue.createElementVNode("div", _hoisted_13$2, [
                  vue.createVNode(_component_el_alert, {
                    type: importPreviewData.value.summary.unmatched || importPreviewData.value.summary.duplicates ? "warning" : "success",
                    closable: false,
                    "show-icon": "",
                    class: "import-head__alert",
                    title: `共 ${importPreviewData.value.summary.total} 行：匹配 ${importPreviewData.value.summary.matched} 行，未匹配 ${importPreviewData.value.summary.unmatched} 行，金额合计 ${vue.unref(formatAmount)(importPreviewData.value.summary.totalAmount)}`
                  }, null, 8, ["type", "title"])
                ]),
                vue.createVNode(_component_el_table, {
                  data: importRows.value,
                  size: "small",
                  "max-height": "440px"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      type: "index",
                      label: "#",
                      width: "45",
                      align: "center"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "单号",
                      width: "120"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.loanNoTaken ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                          key: 0,
                          size: "small",
                          type: "info"
                        }, {
                          default: vue.withCtx(() => [..._cache[50] || (_cache[50] = [
                            vue.createTextVNode("自动生成", -1)
                          ])]),
                          _: 1
                        })) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_14$2, vue.toDisplayString(row.loanNo || "-"), 1))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "loanDate",
                      label: "借款日期",
                      width: "105"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "借款人",
                      width: "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.matched ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                          vue.createTextVNode(vue.toDisplayString(row.employeeName), 1)
                        ], 64)) : (vue.openBlock(), vue.createBlock(_component_el_select, {
                          key: 1,
                          modelValue: row.employeeId,
                          "onUpdate:modelValue": ($event) => row.employeeId = $event,
                          filterable: "",
                          placeholder: "选择员工",
                          size: "small",
                          style: { "width": "100%" },
                          onChange: ($event) => onImportEmployeeChange(row)
                        }, {
                          default: vue.withCtx(() => [
                            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employeeOptions.value, (e) => {
                              return vue.openBlock(), vue.createBlock(_component_el_option, {
                                key: e.id,
                                label: `${e.code} ${e.name}`,
                                value: e.id
                              }, null, 8, ["label", "value"]);
                            }), 128))
                          ]),
                          _: 1
                        }, 8, ["modelValue", "onUpdate:modelValue", "onChange"]))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "reason",
                      label: "借款事由",
                      "min-width": "130"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.reason || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "借款方式",
                      width: "95"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.payMethodLabel || PAY_METHODS[row.payMethod]), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "金额",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_15$2, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "message",
                      label: "说明",
                      "min-width": "130"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", {
                          class: vue.normalizeClass({ "import-warning-text": row.duplicate })
                        }, vue.toDisplayString(row.message), 3)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                importUnmatchedCount.value ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_16$2, vue.toDisplayString(importUnmatchedCount.value) + " 行未匹配到员工档案，请在行内选择员工；未选择的行将被跳过。 ", 1)) : vue.createCommentVNode("", true)
              ], 64))
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_drawer, {
            modelValue: detailVisible.value,
            "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => detailVisible.value = $event),
            title: "借款单详情",
            size: "600px"
          }, {
            default: vue.withCtx(() => [
              detail.value ? (vue.openBlock(), vue.createBlock(_component_el_descriptions, {
                key: 0,
                column: 2,
                border: ""
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_descriptions_item, { label: "单号" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.loanNo), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "状态" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_tag, {
                        type: STATUS_TAGS[detail.value.status],
                        size: "small"
                      }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(vue.toDisplayString(detail.value.statusLabel), 1)
                        ]),
                        _: 1
                      }, 8, ["type"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "借款日期" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.loanDate), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "借款人" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.employeeName), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "部门" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.departmentName || "-"), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "借款方式" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(PAY_METHODS[detail.value.payMethod]), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "借款金额" }, {
                    default: vue.withCtx(() => [
                      vue.createElementVNode("span", _hoisted_17$2, vue.toDisplayString(vue.unref(formatAmount)(detail.value.amount)), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "已还 / 剩余" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(detail.value.repaidAmount)) + " / " + vue.toDisplayString(vue.unref(formatAmount)(detail.value.outstanding)), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "放款账户" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.bankAccountName || "默认科目"), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, {
                    label: "借款事由",
                    span: 2
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.reason || "-"), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "还款日期" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.repayDate || "-"), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "最近还款凭证" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.repayVoucherId ? "已生成" : "-"), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, { label: "制单人" }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.createdByName || "-"), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_descriptions_item, {
                    label: "备注",
                    span: 2
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(detail.value.remark || "-"), 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]);
      };
    }
  });
  const HrLoansPage = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-94629c04"]]);
  const _sfc_main$2 = /* @__PURE__ */ vue.defineComponent({
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
  const _hoisted_1$1 = { class: "page" };
  const _hoisted_2$1 = { class: "page-card" };
  const _hoisted_3$1 = { class: "page-toolbar" };
  const _hoisted_4$1 = { class: "amount amount--debit" };
  const _hoisted_5$1 = { class: "amount amount--credit" };
  const _hoisted_6$1 = { class: "amount amount--credit" };
  const _hoisted_7$1 = { class: "amount amount--total" };
  const _hoisted_8$1 = { class: "page-pagination" };
  const _hoisted_9$1 = { class: "page-toolbar" };
  const _hoisted_10$1 = { class: "amount" };
  const _hoisted_11$1 = { class: "amount" };
  const _hoisted_12$1 = { class: "amount" };
  const _hoisted_13$1 = { class: "amount" };
  const _hoisted_14$1 = { class: "amount amount--total" };
  const _hoisted_15$1 = { class: "amount" };
  const _hoisted_16$1 = { class: "amount" };
  const _hoisted_17$1 = { class: "amount" };
  const _hoisted_18 = { class: "amount" };
  const _hoisted_19 = { class: "amount" };
  const _hoisted_20 = { class: "amount amount--total" };
  const _hoisted_21 = { class: "import-head" };
  const _hoisted_22 = { class: "import-actions" };
  const _hoisted_23 = { class: "amount amount--total" };
  const _hoisted_24 = { class: "amount amount--total" };
  const _hoisted_25 = {
    key: 0,
    class: "import-warning"
  };
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "payrolls",
    setup(__props) {
      const STATUS_TAGS = { draft: "info", approved: "success", paid: "primary" };
      const router = vueRouter.useRouter();
      const { list, total, loading, query, load, search, handleSize, reset } = usePagedList({
        fetcher: (params) => payrollApi.list(params),
        defaultParams: { page: 1, pageSize: 20, status: "" }
      });
      const departmentOptions = vue.ref([]);
      const bankOptions = vue.ref([]);
      const generateVisible = vue.ref(false);
      const generating = vue.ref(false);
      const generateForm = vue.reactive({
        period: currentPeriod(),
        payDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        departmentId: ""
      });
      function onReset() {
        query.value.status = "";
        reset();
      }
      function openGenerate() {
        generateForm.period = currentPeriod();
        generateForm.payDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        generateForm.departmentId = "";
        generateVisible.value = true;
      }
      async function onGenerate() {
        generating.value = true;
        try {
          const payload = { period: generateForm.period, payDate: generateForm.payDate };
          if (generateForm.departmentId) payload.departmentId = generateForm.departmentId;
          await payrollApi.generate(payload);
          ok("生成成功，请核对明细后审核");
          generateVisible.value = false;
          load();
        } finally {
          generating.value = false;
        }
      }
      const importVisible = vue.ref(false);
      const importFileList = vue.ref([]);
      const importParsing = vue.ref(false);
      const importPreviewData = vue.ref(null);
      const importRows = vue.ref([]);
      const importCommitting = vue.ref(false);
      const employeeOptions = vue.ref([]);
      const importForm = vue.reactive({
        period: currentPeriod(),
        payDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
      });
      function onImportFileChange(_file, files) {
        importFileList.value = files;
      }
      function onImportFileRemove(_file, files) {
        importFileList.value = files;
      }
      async function onImportParse() {
        const raw = importFileList.value.find((f) => f.raw instanceof File)?.raw;
        if (!raw) {
          elementPlus.ElMessage.warning("请先选择工资表文件");
          return;
        }
        importParsing.value = true;
        try {
          const res = await payrollApi.importPreview(raw);
          importPreviewData.value = res;
          importRows.value = (res.rows ?? []).map((r) => ({ ...r }));
          importForm.period = currentPeriod();
          importForm.payDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        } finally {
          importParsing.value = false;
        }
      }
      function backToUpload() {
        importPreviewData.value = null;
        importRows.value = [];
        importFileList.value = [];
      }
      const unmatchableCount = vue.computed(
        () => importRows.value.filter((r) => !r.employeeId).length
      );
      function calcRowGross(row) {
        return Math.round(
          ((row.baseSalary ?? 0) + (row.performance ?? 0) + (row.allowance ?? 0) + (row.overtime ?? 0)) * 100
        ) / 100;
      }
      function calcRowNet(row) {
        const gross = calcRowGross(row);
        const deduct = (row.insurancePersonal ?? 0) + (row.fundPersonal ?? 0) + (row.tax ?? 0) + (row.otherDeduct ?? 0);
        return Math.round((gross - deduct) * 100) / 100;
      }
      async function onImportCommit() {
        const rows = importRows.value.filter((r) => r.employeeId);
        if (!rows.length) {
          elementPlus.ElMessage.warning("没有可导入的行，请先为未匹配员工选择档案");
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(
            `确认按 ${rows.length} 行生成 ${periodLabel(importForm.period)} 工资单草稿？导入后可继续编辑明细，审核计提后才生成凭证。`,
            "确认导入",
            { type: "warning", confirmButtonText: "确认导入", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        importCommitting.value = true;
        try {
          const payload = {
            period: importForm.period,
            payDate: importForm.payDate,
            remark: "工资表导入",
            rows: rows.map((r) => ({
              employeeId: r.employeeId,
              employeeName: r.employeeName,
              baseSalary: r.baseSalary ?? 0,
              performance: r.performance ?? 0,
              allowance: r.allowance ?? 0,
              overtime: r.overtime ?? 0,
              insurancePersonal: r.insurancePersonal ?? 0,
              fundPersonal: r.fundPersonal ?? 0,
              tax: r.tax ?? 0,
              otherDeduct: r.otherDeduct ?? 0
            }))
          };
          await payrollApi.importCommit(payload);
          ok("工资单草稿已生成，可在列表中编辑与审核");
          importVisible.value = false;
          backToUpload();
          load();
        } finally {
          importCommitting.value = false;
        }
      }
      const detailVisible = vue.ref(false);
      const detail = vue.ref(null);
      const payForm = vue.reactive({ bankAccountId: "" });
      const paying = vue.ref(false);
      async function onView(row) {
        detail.value = await payrollApi.detail(row.id);
        payForm.bankAccountId = detail.value?.bankAccountId ?? "";
        detailVisible.value = true;
      }
      async function onEdit(row) {
        if (row.status && row.status !== "draft") {
          elementPlus.ElMessage.warning("仅草稿状态的工资单可以编辑");
          return;
        }
        router.push(`/hr/payrolls/${row.id}/edit`);
      }
      async function onApprove(row) {
        try {
          await elementPlus.ElMessageBox.confirm(
            `审核后将按应发工资 ${formatAmount(row.totalGross)} 元生成「计提工资」凭证，确认吗？`,
            "审核工资单",
            { type: "warning" }
          );
        } catch {
          return;
        }
        try {
          await payrollApi.approve(row.id);
          ok("审核成功，已生成计提凭证");
          load();
        } catch {
        }
      }
      async function onPay(row) {
        let bankAccountId = row.bankAccountId;
        if (!bankAccountId) {
          elementPlus.ElMessage.warning("请先打开明细并选择发放账户");
          await onView(row);
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(`确认发放实发工资 ${formatAmount(row.totalNet)} 元吗？`, "发放工资", { type: "warning" });
        } catch {
          return;
        }
        try {
          await payrollApi.pay(row.id, { bankAccountId });
          ok("发放成功，已生成发放凭证");
          load();
        } catch {
        }
      }
      async function onPayNow() {
        if (!detail.value) return;
        paying.value = true;
        try {
          await payrollApi.pay(detail.value.id, { bankAccountId: payForm.bankAccountId || void 0 });
          ok("发放成功，已生成发放凭证");
          detailVisible.value = false;
          load();
        } finally {
          paying.value = false;
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`工资单「${row.payrollNo}」`)) return;
        try {
          await payrollApi.remove(row.id);
          ok("删除成功");
          load();
        } catch {
        }
      }
      function summaryMethod({ columns }) {
        return columns.map((_col, index) => {
          if (index === 0) return "合计";
          if (index <= 3) return "";
          const items = detail.value?.items ?? [];
          const sum = (field) => Math.round(items.reduce((acc, i) => acc + (Number(i[field]) || 0), 0) * 100) / 100;
          const map = {
            4: "baseSalary",
            5: "performance",
            6: "allowance",
            7: "overtime",
            8: null,
            9: "insurancePersonal",
            10: "fundPersonal",
            11: "tax",
            12: "otherDeduct",
            13: "loanDeduct",
            14: null
          };
          if (map[index] === null) {
            if (index === 8) return formatAmount(detail.value?.totalGross ?? 0);
            return formatAmount(detail.value?.totalNet ?? 0);
          }
          return formatAmount(sum(map[index]));
        });
      }
      function onExport() {
        const rows = [];
        for (const p of list.value) {
          rows.push({
            payrollNo: p.payrollNo,
            period: periodLabel(p.period),
            payDate: p.payDate,
            employeeCount: p.employeeCount,
            totalGross: p.totalGross,
            totalNet: p.totalNet,
            status: p.statusLabel
          });
        }
        exportExcel({
          filename: `工资单汇总_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.xlsx`,
          sheetName: "工资单汇总",
          columns: [
            { title: "工资单号", prop: "payrollNo", width: 14 },
            { title: "工资期间", prop: "period", width: 16 },
            { title: "发放日期", prop: "payDate", width: 12 },
            { title: "人数", prop: "employeeCount", width: 8 },
            { title: "应发合计", prop: "totalGross", width: 15, amount: true },
            { title: "实发合计", prop: "totalNet", width: 15, amount: true },
            { title: "状态", prop: "status", width: 10 }
          ],
          rows
        });
        elementPlus.ElMessage.success("导出成功");
      }
      const selected = vue.ref([]);
      const pdfExporting = vue.ref(false);
      async function onPdfPackage() {
        const ids = selected.value.map((r) => r.id);
        const count = ids.length || total.value;
        if (!count) {
          elementPlus.ElMessage.warning("当前没有可导出的工资单");
          return;
        }
        try {
          await elementPlus.ElMessageBox.confirm(
            ids.length ? `将把选中的 ${ids.length} 张工资单各生成一份 PDF（原始凭证存根）并打包为压缩包下载，解压后即可打印。继续吗？` : `未勾选工资单时将打包全部 ${total.value} 张工资表 PDF，继续吗？`,
            "生成原始凭证 PDF",
            { type: "info", confirmButtonText: "生成并下载", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        pdfExporting.value = true;
        try {
          const payload = ids.length ? { ids } : { status: query.value.status || void 0 };
          await payrollApi.downloadPdfPackage(payload);
          ok(`已生成 ${count} 张工资表 PDF 压缩包`);
        } finally {
          pdfExporting.value = false;
        }
      }
      vue.onMounted(async () => {
        departmentOptions.value = await departmentApi.options();
        bankOptions.value = await bankApi.options();
        employeeOptions.value = await employeeApi.options(true);
        load();
      });
      return (_ctx, _cache) => {
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
          vue.createElementVNode("div", _hoisted_2$1, [
            vue.createElementVNode("div", _hoisted_3$1, [
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).status,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).status = $event),
                placeholder: "单据状态",
                clearable: "",
                style: { "width": "130px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_option, {
                    label: "草稿",
                    value: "draft"
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "已审核",
                    value: "approved"
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "已发放",
                    value: "paid"
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
                  _cache[18] || (_cache[18] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: onReset }, {
                default: vue.withCtx(() => [..._cache[19] || (_cache[19] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }),
              _cache[24] || (_cache[24] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createVNode(_component_el_button, {
                loading: pdfExporting.value,
                onClick: onPdfPackage
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Printer))
                    ]),
                    _: 1
                  }),
                  _cache[20] || (_cache[20] = vue.createTextVNode("生成凭证PDF ", -1))
                ]),
                _: 1
              }, 8, ["loading"]),
              vue.createVNode(_component_el_button, { onClick: onExport }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Download))
                    ]),
                    _: 1
                  }),
                  _cache[21] || (_cache[21] = vue.createTextVNode("导出", -1))
                ]),
                _: 1
              }),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                onClick: _cache[1] || (_cache[1] = ($event) => importVisible.value = true)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Upload))
                    ]),
                    _: 1
                  }),
                  _cache[22] || (_cache[22] = vue.createTextVNode("导入 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:payroll:create"]
              ]),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                type: "primary",
                onClick: openGenerate
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Plus))
                    ]),
                    _: 1
                  }),
                  _cache[23] || (_cache[23] = vue.createTextVNode("生成工资单 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "hr:payroll:create"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无工资单",
              onSelectionChange: _cache[2] || (_cache[2] = ($event) => selected.value = $event)
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  type: "selection",
                  width: "42"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "payrollNo",
                  label: "工资单号",
                  width: "130"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "工资期间",
                  "min-width": "115"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(vue.unref(periodLabel)(row.period)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "payDate",
                  label: "发放日期",
                  width: "115"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "employeeCount",
                  label: "人数",
                  width: "80",
                  align: "center"
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "应发合计",
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_4$1, vue.toDisplayString(vue.unref(formatAmount)(row.totalGross)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "代扣合计",
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_5$1, vue.toDisplayString(vue.unref(formatAmount)(row.totalInsurance + row.totalFund + row.totalTax + row.totalOtherDeduct)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "扣回借款",
                  width: "130",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_6$1, vue.toDisplayString(vue.unref(formatAmount)(row.totalLoanDeduct ?? 0)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "实发合计",
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_7$1, vue.toDisplayString(vue.unref(formatAmount)(row.totalNet)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "状态",
                  width: "110",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      type: STATUS_TAGS[row.status],
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.statusLabel), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "250",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => onView(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                        vue.createTextVNode("查看明细", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"]),
                    row.status === "draft" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 0,
                      link: "",
                      type: "primary",
                      onClick: ($event) => onEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[26] || (_cache[26] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:payroll:update"]
                    ]) : vue.createCommentVNode("", true),
                    row.status === "draft" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 1,
                      link: "",
                      type: "success",
                      onClick: ($event) => onApprove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[27] || (_cache[27] = [
                        vue.createTextVNode("审核计提", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:payroll:approve"]
                    ]) : vue.createCommentVNode("", true),
                    row.status === "approved" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 2,
                      link: "",
                      type: "warning",
                      onClick: ($event) => onPay(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[28] || (_cache[28] = [
                        vue.createTextVNode("发放", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:payroll:pay"]
                    ]) : vue.createCommentVNode("", true),
                    row.status !== "paid" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 3,
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[29] || (_cache[29] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "hr:payroll:delete"]
                    ]) : vue.createCommentVNode("", true)
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
            modelValue: generateVisible.value,
            "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => generateVisible.value = $event),
            title: "生成工资单",
            width: "520px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[8] || (_cache[8] = ($event) => generateVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[30] || (_cache[30] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: generating.value,
                onClick: onGenerate
              }, {
                default: vue.withCtx(() => [..._cache[31] || (_cache[31] = [
                  vue.createTextVNode("生成", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_form, {
                model: generateForm,
                "label-width": "110px"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "工资期间" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_sfc_main$2, {
                        modelValue: generateForm.period,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => generateForm.period = $event),
                        width: "160px"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "发放日期" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_date_picker, {
                        modelValue: generateForm.payDate,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => generateForm.payDate = $event),
                        type: "date",
                        "value-format": "YYYY-MM-DD",
                        style: { "width": "100%" }
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "限定部门" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: generateForm.departmentId,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => generateForm.departmentId = $event),
                        clearable: "",
                        filterable: "",
                        placeholder: "不选则取全部在职员工",
                        style: { "width": "100%" }
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(departmentOptions.value, (d) => {
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
              }, 8, ["model"]),
              vue.createVNode(_component_el_alert, {
                type: "info",
                closable: false,
                "show-icon": "",
                title: "按在职员工的「基本工资」预生成工资明细；有未还清借款的员工自动按欠款余额预填「借款扣回」（欠款超过应发时按应发封顶），生成后可继续编辑。"
              })
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: detailVisible.value,
            "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => detailVisible.value = $event),
            title: "工资表明细",
            width: "1100px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[12] || (_cache[12] = ($event) => detailVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[34] || (_cache[34] = [
                  vue.createTextVNode("关闭", -1)
                ])]),
                _: 1
              }),
              detail.value?.status === "approved" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                key: 0,
                type: "primary",
                loading: paying.value,
                onClick: onPayNow
              }, {
                default: vue.withCtx(() => [..._cache[35] || (_cache[35] = [
                  vue.createTextVNode(" 确认发放 ", -1)
                ])]),
                _: 1
              }, 8, ["loading"])), [
                [_directive_permission, "hr:payroll:pay"]
              ]) : vue.createCommentVNode("", true)
            ]),
            default: vue.withCtx(() => [
              detail.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_descriptions, {
                  column: 4,
                  border: "",
                  size: "small",
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_descriptions_item, { label: "工资单号" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.payrollNo), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "工资期间" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(vue.unref(periodLabel)(detail.value.period)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "发放日期" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.payDate), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "状态" }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_tag, {
                          type: STATUS_TAGS[detail.value.status],
                          size: "small"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(detail.value.statusLabel), 1)
                          ]),
                          _: 1
                        }, 8, ["type"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "费用科目" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.expenseAccountName || "默认 6602 管理费用"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "薪酬科目" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.payableAccountName || "默认 2211.01 工资"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "代扣挂账" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.deductAccountName || "默认 2241 其他应付款"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "个税科目" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.taxAccountName || "默认 2221.04 个税"), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                vue.createElementVNode("div", _hoisted_9$1, [
                  detail.value?.status === "draft" ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                    key: 0,
                    size: "small",
                    onClick: _cache[10] || (_cache[10] = ($event) => onEdit(detail.value))
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_icon, null, {
                        default: vue.withCtx(() => [
                          vue.createVNode(vue.unref(iconsVue.Edit))
                        ]),
                        _: 1
                      }),
                      _cache[32] || (_cache[32] = vue.createTextVNode("编辑明细 ", -1))
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  _cache[33] || (_cache[33] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
                  vue.createVNode(_component_el_select, {
                    modelValue: payForm.bankAccountId,
                    "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => payForm.bankAccountId = $event),
                    size: "small",
                    placeholder: "发放账户",
                    filterable: "",
                    style: { "width": "220px" }
                  }, {
                    default: vue.withCtx(() => [
                      (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(bankOptions.value, (b) => {
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
                vue.createVNode(_component_el_table, {
                  data: detail.value.items ?? [],
                  size: "small",
                  "show-summary": "",
                  "summary-method": summaryMethod,
                  "max-height": "460px"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      type: "index",
                      label: "#",
                      width: "50",
                      align: "center"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "employeeCode",
                      label: "工号",
                      width: "90"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "employeeName",
                      label: "姓名",
                      width: "90"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "departmentName",
                      label: "部门",
                      width: "110"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createTextVNode(vue.toDisplayString(row.departmentName || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "基本",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_10$1, vue.toDisplayString(vue.unref(formatAmount)(row.baseSalary)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "绩效",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_11$1, vue.toDisplayString(vue.unref(formatAmount)(row.performance)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "补贴",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_12$1, vue.toDisplayString(vue.unref(formatAmount)(row.allowance)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "加班",
                      width: "110",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_13$1, vue.toDisplayString(vue.unref(formatAmount)(row.overtime)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "应发",
                      width: "120",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_14$1, vue.toDisplayString(vue.unref(formatAmount)(row.gross)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "社保",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_15$1, vue.toDisplayString(vue.unref(formatAmount)(row.insurancePersonal)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "公积金",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_16$1, vue.toDisplayString(vue.unref(formatAmount)(row.fundPersonal)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "个税",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_17$1, vue.toDisplayString(vue.unref(formatAmount)(row.tax)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "其他代扣",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_18, vue.toDisplayString(vue.unref(formatAmount)(row.otherDeduct)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "借款扣回",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_19, vue.toDisplayString(vue.unref(formatAmount)(row.loanDeduct ?? 0)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "实发",
                      width: "120",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_20, vue.toDisplayString(vue.unref(formatAmount)(row.net)), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"])
              ], 64)) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: importVisible.value,
            "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => importVisible.value = $event),
            title: "导入工资表",
            width: "980px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[16] || (_cache[16] = ($event) => importVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[43] || (_cache[43] = [
                  vue.createTextVNode("关闭", -1)
                ])]),
                _: 1
              }),
              !importPreviewData.value ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                key: 0,
                type: "primary",
                disabled: !importFileList.value.length,
                loading: importParsing.value,
                onClick: onImportParse
              }, {
                default: vue.withCtx(() => [..._cache[44] || (_cache[44] = [
                  vue.createTextVNode("解析预览", -1)
                ])]),
                _: 1
              }, 8, ["disabled", "loading"])) : vue.createCommentVNode("", true)
            ]),
            default: vue.withCtx(() => [
              !importPreviewData.value ? (vue.openBlock(), vue.createBlock(_component_el_upload, {
                key: 0,
                drag: "",
                "auto-upload": false,
                limit: 1,
                accept: ".xlsx,.xls,.csv,image/jpeg,image/png,image/webp,application/pdf",
                "on-change": onImportFileChange,
                "on-remove": onImportFileRemove,
                "file-list": importFileList.value
              }, {
                tip: vue.withCtx(() => [..._cache[36] || (_cache[36] = [
                  vue.createElementVNode("div", { class: "el-upload__tip" }, "表格按表头关键词自动映射（姓名/基本工资/绩效/补贴/社保/公积金/个税等）；图片与 PDF 走 OCR，识别结果需人工核对", -1)
                ])]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, { class: "el-icon--upload" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.UploadFilled))
                    ]),
                    _: 1
                  }),
                  _cache[37] || (_cache[37] = vue.createElementVNode("div", { class: "el-upload__text" }, [
                    vue.createTextVNode("拖拽 Excel / CSV / 工资表图片 / PDF 到此处，或"),
                    vue.createElementVNode("em", null, "点击选择")
                  ], -1))
                ]),
                _: 1
              }, 8, ["file-list"])) : (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                vue.createElementVNode("div", _hoisted_21, [
                  vue.createVNode(_component_el_form, {
                    inline: "",
                    class: "import-form"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_form_item, { label: "工资期间" }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_sfc_main$2, {
                            modelValue: importForm.period,
                            "onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => importForm.period = $event),
                            width: "150px"
                          }, null, 8, ["modelValue"])
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_form_item, { label: "发放日期" }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_date_picker, {
                            modelValue: importForm.payDate,
                            "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => importForm.payDate = $event),
                            type: "date",
                            "value-format": "YYYY-MM-DD",
                            style: { "width": "150px" }
                          }, null, 8, ["modelValue"])
                        ]),
                        _: 1
                      }),
                      vue.createVNode(_component_el_form_item, null, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_button, {
                            type: "primary",
                            loading: importCommitting.value,
                            onClick: onImportCommit
                          }, {
                            default: vue.withCtx(() => [..._cache[38] || (_cache[38] = [
                              vue.createTextVNode("确认导入", -1)
                            ])]),
                            _: 1
                          }, 8, ["loading"])
                        ]),
                        _: 1
                      })
                    ]),
                    _: 1
                  }),
                  vue.createElementVNode("div", _hoisted_22, [
                    vue.createVNode(_component_el_button, { onClick: backToUpload }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_icon, null, {
                          default: vue.withCtx(() => [
                            vue.createVNode(vue.unref(iconsVue.Back))
                          ]),
                          _: 1
                        }),
                        _cache[39] || (_cache[39] = vue.createTextVNode("重新选择文件", -1))
                      ]),
                      _: 1
                    })
                  ])
                ]),
                vue.createVNode(_component_el_alert, {
                  type: importPreviewData.value.summary.unmatched ? "warning" : "success",
                  closable: false,
                  "show-icon": "",
                  class: "mb12",
                  title: `共 ${importPreviewData.value.summary.total} 行，匹配员工 ${importPreviewData.value.summary.matched} 人，未匹配 ${importPreviewData.value.summary.unmatched} 人；应发合计 ${vue.unref(formatAmount)(importPreviewData.value.summary.totalGross)}，实发合计 ${vue.unref(formatAmount)(importPreviewData.value.summary.totalNet)}`
                }, null, 8, ["type", "title"]),
                vue.createVNode(_component_el_table, {
                  data: importRows.value,
                  size: "small",
                  "max-height": "440px"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      type: "index",
                      label: "#",
                      width: "45",
                      align: "center"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "姓名",
                      width: "120"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.matched ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                          vue.createTextVNode(vue.toDisplayString(row.employeeName), 1)
                        ], 64)) : (vue.openBlock(), vue.createBlock(_component_el_select, {
                          key: 1,
                          modelValue: row.employeeId,
                          "onUpdate:modelValue": ($event) => row.employeeId = $event,
                          filterable: "",
                          placeholder: "选择员工",
                          size: "small",
                          style: { "width": "100%" }
                        }, {
                          default: vue.withCtx(() => [
                            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(employeeOptions.value, (e) => {
                              return vue.openBlock(), vue.createBlock(_component_el_option, {
                                key: e.id,
                                label: `${e.name}（${e.code}）`,
                                value: e.id
                              }, null, 8, ["label", "value"]);
                            }), 128))
                          ]),
                          _: 1
                        }, 8, ["modelValue", "onUpdate:modelValue"]))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "匹配",
                      width: "80",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.fromOcr ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                          key: 0,
                          size: "small",
                          type: "warning"
                        }, {
                          default: vue.withCtx(() => [..._cache[40] || (_cache[40] = [
                            vue.createTextVNode("OCR", -1)
                          ])]),
                          _: 1
                        })) : vue.createCommentVNode("", true),
                        row.matched ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                          key: 1,
                          size: "small",
                          type: "success"
                        }, {
                          default: vue.withCtx(() => [..._cache[41] || (_cache[41] = [
                            vue.createTextVNode("已匹配", -1)
                          ])]),
                          _: 1
                        })) : (vue.openBlock(), vue.createBlock(_component_el_tag, {
                          key: 2,
                          size: "small",
                          type: "danger"
                        }, {
                          default: vue.withCtx(() => [..._cache[42] || (_cache[42] = [
                            vue.createTextVNode("未匹配", -1)
                          ])]),
                          _: 1
                        }))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "基本工资",
                      width: "110"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.baseSalary,
                          "onUpdate:modelValue": ($event) => row.baseSalary = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "绩效",
                      width: "100"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.performance,
                          "onUpdate:modelValue": ($event) => row.performance = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "补贴",
                      width: "100"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.allowance,
                          "onUpdate:modelValue": ($event) => row.allowance = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "加班",
                      width: "100"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.overtime,
                          "onUpdate:modelValue": ($event) => row.overtime = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "社保",
                      width: "95"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.insurancePersonal,
                          "onUpdate:modelValue": ($event) => row.insurancePersonal = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "公积金",
                      width: "95"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.fundPersonal,
                          "onUpdate:modelValue": ($event) => row.fundPersonal = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "个税",
                      width: "90"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.tax,
                          "onUpdate:modelValue": ($event) => row.tax = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "其他代扣",
                      width: "90"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.otherDeduct,
                          "onUpdate:modelValue": ($event) => row.otherDeduct = $event,
                          min: 0,
                          precision: 2,
                          controls: false,
                          size: "small",
                          style: { "width": "100%" }
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "应发",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_23, vue.toDisplayString(vue.unref(formatAmount)(calcRowGross(row))), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "实发",
                      width: "100",
                      align: "right"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createElementVNode("span", _hoisted_24, vue.toDisplayString(vue.unref(formatAmount)(calcRowNet(row))), 1)
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                unmatchableCount.value ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_25, vue.toDisplayString(unmatchableCount.value) + " 行未指定员工，确认导入前请先为每行选择员工；未选择的行将被跳过。 ", 1)) : vue.createCommentVNode("", true)
              ], 64))
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]);
      };
    }
  });
  const HrPayrollsPage = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-e2e37025"]]);
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-card" };
  const _hoisted_3 = { class: "edit-head" };
  const _hoisted_4 = { class: "edit-head__left" };
  const _hoisted_5 = { class: "edit-head__right" };
  const _hoisted_6 = { class: "page-toolbar" };
  const _hoisted_7 = { class: "edit-total" };
  const _hoisted_8 = { class: "edit-total" };
  const _hoisted_9 = { class: "amount amount--debit" };
  const _hoisted_10 = { class: "edit-total" };
  const _hoisted_11 = { class: "amount amount--credit" };
  const _hoisted_12 = { class: "edit-total" };
  const _hoisted_13 = { class: "amount amount--total" };
  const _hoisted_14 = { class: "amount amount--total" };
  const _hoisted_15 = { class: "amount amount--total" };
  const _hoisted_16 = { class: "edit-foot" };
  const _hoisted_17 = {
    key: 0,
    class: "add-empty"
  };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "payroll-edit",
    setup(__props) {
      const STATUS_TAGS = { draft: "info", approved: "success", paid: "primary" };
      const route = vueRouter.useRoute();
      const router = vueRouter.useRouter();
      const id = String(route.params.id ?? "");
      const loading = vue.ref(false);
      const saving = vue.ref(false);
      const readonly = vue.computed(() => meta.status !== "draft");
      const meta = vue.reactive({
        payrollNo: "",
        period: 0,
        payDate: "",
        status: "draft",
        statusLabel: "",
        remark: "",
        expenseAccountId: "",
        payableAccountId: "",
        deductAccountId: "",
        taxAccountId: "",
        bankAccountId: ""
      });
      const items = vue.ref([]);
      const accountOptions = vue.ref([]);
      const bankOptions = vue.ref([]);
      const employeeOptions = vue.ref([]);
      const outstandingMap = vue.ref(/* @__PURE__ */ new Map());
      function round2(n) {
        return Math.round(n * 100) / 100;
      }
      function calcGross(row) {
        return round2(
          (row.baseSalary ?? 0) + (row.performance ?? 0) + (row.allowance ?? 0) + (row.overtime ?? 0)
        );
      }
      function rowDeduct(row) {
        return round2(
          (row.insurancePersonal ?? 0) + (row.fundPersonal ?? 0) + (row.tax ?? 0) + (row.otherDeduct ?? 0) + (row.loanDeduct ?? 0)
        );
      }
      function calcNet(row) {
        return round2(calcGross(row) - rowDeduct(row));
      }
      const totals = vue.computed(() => {
        const sum = (fn) => round2(items.value.reduce((acc, row) => acc + fn(row), 0));
        return {
          count: items.value.length,
          gross: sum(calcGross),
          deduct: sum(rowDeduct),
          net: sum(calcNet)
        };
      });
      function goBack() {
        router.push("/hr/payrolls");
      }
      async function load() {
        if (!id) {
          elementPlus.ElMessage.error("缺少工资单参数");
          goBack();
          return;
        }
        loading.value = true;
        try {
          const data = await payrollApi.detail(id);
          Object.assign(meta, {
            payrollNo: data.payrollNo ?? "",
            period: data.period ?? 0,
            payDate: data.payDate ?? "",
            status: data.status ?? "draft",
            statusLabel: data.statusLabel ?? "",
            remark: data.remark ?? "",
            expenseAccountId: data.expenseAccountId ?? "",
            payableAccountId: data.payableAccountId ?? "",
            deductAccountId: data.deductAccountId ?? "",
            taxAccountId: data.taxAccountId ?? "",
            bankAccountId: data.bankAccountId ?? ""
          });
          items.value = (data.items ?? []).map((i) => ({
            employeeId: i.employeeId,
            employeeCode: i.employeeCode,
            employeeName: i.employeeName,
            departmentName: i.departmentName ?? "",
            baseSalary: Number(i.baseSalary ?? 0),
            performance: Number(i.performance ?? 0),
            allowance: Number(i.allowance ?? 0),
            overtime: Number(i.overtime ?? 0),
            insurancePersonal: Number(i.insurancePersonal ?? 0),
            fundPersonal: Number(i.fundPersonal ?? 0),
            tax: Number(i.tax ?? 0),
            otherDeduct: Number(i.otherDeduct ?? 0),
            loanDeduct: Number(i.loanDeduct ?? 0)
          }));
        } finally {
          loading.value = false;
        }
      }
      const addVisible = vue.ref(false);
      const adding = vue.ref(false);
      const addEmployeeId = vue.ref("");
      const addableEmployees = vue.computed(() => {
        const used = new Set(items.value.map((i) => i.employeeId));
        return employeeOptions.value.filter((e) => !used.has(e.id));
      });
      function openAdd() {
        addEmployeeId.value = "";
        addVisible.value = true;
      }
      async function confirmAdd() {
        const opt = employeeOptions.value.find((e) => e.id === addEmployeeId.value);
        if (!opt) {
          elementPlus.ElMessage.warning("请选择员工");
          return;
        }
        adding.value = true;
        try {
          let baseSalary = 0;
          let departmentName = "";
          try {
            const detail = await employeeApi.detail(opt.id);
            baseSalary = Number(detail.baseSalary ?? 0);
            departmentName = detail.departmentName ?? "";
          } catch {
          }
          items.value.push({
            employeeId: opt.id,
            employeeCode: opt.code,
            employeeName: opt.name,
            departmentName,
            baseSalary,
            performance: 0,
            allowance: 0,
            overtime: 0,
            insurancePersonal: 0,
            fundPersonal: 0,
            tax: 0,
            otherDeduct: 0,
            // 自动带出员工欠款：扣回金额 = min(欠款余额, 应发工资)
            loanDeduct: round2(Math.min(outstandingMap.value.get(opt.id) ?? 0, baseSalary))
          });
          addVisible.value = false;
        } finally {
          adding.value = false;
        }
      }
      function removeItem(index) {
        items.value.splice(index, 1);
      }
      function summaryMethod({ columns }) {
        return columns.map((_col, index) => {
          const sumField = (field) => round2(items.value.reduce((acc, row) => acc + (Number(row[field]) || 0), 0));
          switch (index) {
            case 0:
              return "合计";
            case 1:
            case 2:
            case 3:
            case 13:
            case 16:
              return "";
            case 4:
              return formatAmount(sumField("baseSalary"));
            case 5:
              return formatAmount(sumField("performance"));
            case 6:
              return formatAmount(sumField("allowance"));
            case 7:
              return formatAmount(sumField("overtime"));
            case 8:
              return formatAmount(totals.value.gross);
            case 9:
              return formatAmount(sumField("insurancePersonal"));
            case 10:
              return formatAmount(sumField("fundPersonal"));
            case 11:
              return formatAmount(sumField("tax"));
            case 12:
              return formatAmount(sumField("otherDeduct"));
            case 14:
              return formatAmount(sumField("loanDeduct"));
            case 15:
              return formatAmount(totals.value.net);
            default:
              return "";
          }
        });
      }
      async function onSave() {
        if (readonly.value) return;
        if (!items.value.length) {
          elementPlus.ElMessage.warning("请至少录入一名员工的工资");
          return;
        }
        const seen = /* @__PURE__ */ new Set();
        for (const row of items.value) {
          if (!row.employeeId) {
            elementPlus.ElMessage.error("存在未指定员工的行，请检查");
            return;
          }
          if (seen.has(row.employeeId)) {
            elementPlus.ElMessage.error("存在重复的员工，请检查");
            return;
          }
          seen.add(row.employeeId);
          const gross = calcGross(row);
          const deduct = rowDeduct(row);
          if (deduct > gross) {
            elementPlus.ElMessage.error(
              `员工「${row.employeeName}」的代扣合计（${formatAmount(deduct)}）超过应发工资（${formatAmount(gross)}）`
            );
            return;
          }
        }
        if (!meta.period) {
          elementPlus.ElMessage.warning("请选择工资期间");
          return;
        }
        if (!meta.payDate) {
          elementPlus.ElMessage.warning("请选择发放日期");
          return;
        }
        saving.value = true;
        try {
          const payload = {
            period: meta.period,
            payDate: meta.payDate,
            expenseAccountId: meta.expenseAccountId || void 0,
            payableAccountId: meta.payableAccountId || void 0,
            deductAccountId: meta.deductAccountId || void 0,
            taxAccountId: meta.taxAccountId || void 0,
            bankAccountId: meta.bankAccountId || void 0,
            remark: meta.remark || void 0,
            items: items.value.map((row) => ({
              employeeId: row.employeeId,
              baseSalary: row.baseSalary ?? 0,
              performance: row.performance ?? 0,
              allowance: row.allowance ?? 0,
              overtime: row.overtime ?? 0,
              insurancePersonal: row.insurancePersonal ?? 0,
              fundPersonal: row.fundPersonal ?? 0,
              tax: row.tax ?? 0,
              otherDeduct: row.otherDeduct ?? 0,
              loanDeduct: row.loanDeduct ?? 0
            }))
          };
          await payrollApi.update(id, payload);
          ok("保存成功");
          router.push("/hr/payrolls");
        } finally {
          saving.value = false;
        }
      }
      vue.onMounted(async () => {
        await load();
        try {
          const [accounts, banks, employees] = await Promise.all([
            accountApi.options(),
            bankApi.options(),
            employeeApi.options(true)
          ]);
          accountOptions.value = accounts;
          bankOptions.value = banks;
          employeeOptions.value = employees;
        } catch {
        }
        try {
          const balances = await loanApi.employeeBalances({ page: 1, pageSize: 500 });
          const map = /* @__PURE__ */ new Map();
          for (const b of balances?.list ?? []) {
            if (Number(b.balance ?? 0) > 0) map.set(b.employeeId, Number(b.balance));
          }
          outstandingMap.value = map;
        } catch {
        }
      });
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.withDirectives((vue.openBlock(), vue.createElementBlock("div", _hoisted_2, [
            vue.createElementVNode("div", _hoisted_3, [
              vue.createElementVNode("div", _hoisted_4, [
                vue.createVNode(_component_el_button, {
                  link: "",
                  onClick: goBack
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_icon, null, {
                      default: vue.withCtx(() => [
                        vue.createVNode(vue.unref(iconsVue.ArrowLeft))
                      ]),
                      _: 1
                    }),
                    _cache[11] || (_cache[11] = vue.createTextVNode("返回 ", -1))
                  ]),
                  _: 1
                }),
                _cache[12] || (_cache[12] = vue.createElementVNode("span", { class: "edit-head__title" }, "编辑工资明细", -1)),
                meta.payrollNo ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                  key: 0,
                  type: "info",
                  size: "small"
                }, {
                  default: vue.withCtx(() => [
                    vue.createTextVNode(vue.toDisplayString(meta.payrollNo), 1)
                  ]),
                  _: 1
                })) : vue.createCommentVNode("", true),
                meta.statusLabel ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                  key: 1,
                  type: STATUS_TAGS[meta.status],
                  size: "small"
                }, {
                  default: vue.withCtx(() => [
                    vue.createTextVNode(vue.toDisplayString(meta.statusLabel), 1)
                  ]),
                  _: 1
                }, 8, ["type"])) : vue.createCommentVNode("", true)
              ]),
              vue.createElementVNode("div", _hoisted_5, [
                vue.createVNode(_component_el_button, { onClick: goBack }, {
                  default: vue.withCtx(() => [..._cache[13] || (_cache[13] = [
                    vue.createTextVNode("取消", -1)
                  ])]),
                  _: 1
                }),
                vue.createVNode(_component_el_button, {
                  type: "primary",
                  loading: saving.value,
                  disabled: readonly.value,
                  onClick: onSave
                }, {
                  default: vue.withCtx(() => [..._cache[14] || (_cache[14] = [
                    vue.createTextVNode(" 保存 ", -1)
                  ])]),
                  _: 1
                }, 8, ["loading", "disabled"])
              ])
            ]),
            readonly.value ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
              key: 0,
              type: "warning",
              closable: false,
              "show-icon": "",
              class: "mb12",
              title: `当前工资单状态为「${meta.statusLabel}」，仅草稿状态可编辑，本页仅可查看。`
            }, null, 8, ["title"])) : (vue.openBlock(), vue.createBlock(_component_el_alert, {
              key: 1,
              type: "info",
              closable: false,
              "show-icon": "",
              class: "mb12",
              title: "修改后保存为草稿；「审核计提」生成 借：工资费用 / 贷：应付职工薪酬，「发放」生成 借：应付职工薪酬 / 贷：银行及代扣项。"
            })),
            vue.createVNode(_component_el_form, {
              inline: true,
              class: "edit-form",
              disabled: readonly.value
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_form_item, { label: "工资期间" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_sfc_main$2, {
                      modelValue: meta.period,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => meta.period = $event),
                      width: "150px"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "发放日期" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_date_picker, {
                      modelValue: meta.payDate,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => meta.payDate = $event),
                      type: "date",
                      "value-format": "YYYY-MM-DD",
                      style: { "width": "150px" }
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "备注" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_input, {
                      modelValue: meta.remark,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => meta.remark = $event),
                      placeholder: "选填",
                      maxlength: "200",
                      style: { "width": "220px" }
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["disabled"]),
            vue.createVNode(_component_el_form, {
              inline: true,
              class: "edit-form",
              disabled: readonly.value
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_form_item, { label: "费用科目" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_select, {
                      modelValue: meta.expenseAccountId,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => meta.expenseAccountId = $event),
                      clearable: "",
                      filterable: "",
                      placeholder: "默认 6602",
                      style: { "width": "220px" }
                    }, {
                      default: vue.withCtx(() => [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptions.value, (a) => {
                          return vue.openBlock(), vue.createBlock(_component_el_option, {
                            key: a.id,
                            label: `${a.code} ${a.fullName}`,
                            value: a.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "薪酬科目" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_select, {
                      modelValue: meta.payableAccountId,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => meta.payableAccountId = $event),
                      clearable: "",
                      filterable: "",
                      placeholder: "默认 2211.01",
                      style: { "width": "220px" }
                    }, {
                      default: vue.withCtx(() => [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptions.value, (a) => {
                          return vue.openBlock(), vue.createBlock(_component_el_option, {
                            key: a.id,
                            label: `${a.code} ${a.fullName}`,
                            value: a.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "代扣挂账" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_select, {
                      modelValue: meta.deductAccountId,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => meta.deductAccountId = $event),
                      clearable: "",
                      filterable: "",
                      placeholder: "默认 2241",
                      style: { "width": "220px" }
                    }, {
                      default: vue.withCtx(() => [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptions.value, (a) => {
                          return vue.openBlock(), vue.createBlock(_component_el_option, {
                            key: a.id,
                            label: `${a.code} ${a.fullName}`,
                            value: a.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "个税科目" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_select, {
                      modelValue: meta.taxAccountId,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => meta.taxAccountId = $event),
                      clearable: "",
                      filterable: "",
                      placeholder: "默认 2221.04",
                      style: { "width": "220px" }
                    }, {
                      default: vue.withCtx(() => [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptions.value, (a) => {
                          return vue.openBlock(), vue.createBlock(_component_el_option, {
                            key: a.id,
                            label: `${a.code} ${a.fullName}`,
                            value: a.id
                          }, null, 8, ["label", "value"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "发放账户" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_select, {
                      modelValue: meta.bankAccountId,
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => meta.bankAccountId = $event),
                      clearable: "",
                      filterable: "",
                      placeholder: "默认 1002 银行存款",
                      style: { "width": "240px" }
                    }, {
                      default: vue.withCtx(() => [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(bankOptions.value, (b) => {
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
                })
              ]),
              _: 1
            }, 8, ["disabled"]),
            vue.createElementVNode("div", _hoisted_6, [
              vue.createVNode(_component_el_button, {
                type: "primary",
                plain: "",
                disabled: readonly.value,
                onClick: openAdd
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Plus))
                    ]),
                    _: 1
                  }),
                  _cache[15] || (_cache[15] = vue.createTextVNode("添加员工 ", -1))
                ]),
                _: 1
              }, 8, ["disabled"]),
              _cache[20] || (_cache[20] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.createElementVNode("span", _hoisted_7, [
                _cache[16] || (_cache[16] = vue.createTextVNode("人数 ", -1)),
                vue.createElementVNode("b", null, vue.toDisplayString(items.value.length), 1)
              ]),
              vue.createElementVNode("span", _hoisted_8, [
                _cache[17] || (_cache[17] = vue.createTextVNode("应发合计 ", -1)),
                vue.createElementVNode("b", _hoisted_9, vue.toDisplayString(vue.unref(formatAmount)(totals.value.gross)), 1)
              ]),
              vue.createElementVNode("span", _hoisted_10, [
                _cache[18] || (_cache[18] = vue.createTextVNode("代扣合计 ", -1)),
                vue.createElementVNode("b", _hoisted_11, vue.toDisplayString(vue.unref(formatAmount)(totals.value.deduct)), 1)
              ]),
              vue.createElementVNode("span", _hoisted_12, [
                _cache[19] || (_cache[19] = vue.createTextVNode("实发合计 ", -1)),
                vue.createElementVNode("b", _hoisted_13, vue.toDisplayString(vue.unref(formatAmount)(totals.value.net)), 1)
              ])
            ]),
            vue.createVNode(_component_el_table, {
              data: items.value,
              border: "",
              size: "small",
              "show-summary": "",
              "summary-method": summaryMethod,
              "max-height": "calc(100vh - 420px)",
              "empty-text": "暂无员工明细，点击「添加员工」录入"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  type: "index",
                  label: "#",
                  width: "50",
                  align: "center"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "employeeCode",
                  label: "工号",
                  width: "100"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "employeeName",
                  label: "姓名",
                  width: "90"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "departmentName",
                  label: "部门",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.departmentName || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "基本工资",
                  width: "130"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.baseSalary,
                      "onUpdate:modelValue": ($event) => row.baseSalary = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "绩效",
                  width: "120"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.performance,
                      "onUpdate:modelValue": ($event) => row.performance = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "补贴",
                  width: "120"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.allowance,
                      "onUpdate:modelValue": ($event) => row.allowance = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "加班费",
                  width: "120"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.overtime,
                      "onUpdate:modelValue": ($event) => row.overtime = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "应发",
                  width: "120",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_14, vue.toDisplayString(vue.unref(formatAmount)(calcGross(row))), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "个人社保",
                  width: "120"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.insurancePersonal,
                      "onUpdate:modelValue": ($event) => row.insurancePersonal = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "个人公积金",
                  width: "120"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.fundPersonal,
                      "onUpdate:modelValue": ($event) => row.fundPersonal = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "个税",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.tax,
                      "onUpdate:modelValue": ($event) => row.tax = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "其他代扣",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.otherDeduct,
                      "onUpdate:modelValue": ($event) => row.otherDeduct = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "欠款余额",
                  width: "100",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", {
                      class: vue.normalizeClass({ "loan-outstanding": (outstandingMap.value.get(row.employeeId) ?? 0) > 0 })
                    }, vue.toDisplayString(vue.unref(formatAmount)(outstandingMap.value.get(row.employeeId) ?? 0)), 3)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "借款扣回",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: row.loanDeduct,
                      "onUpdate:modelValue": ($event) => row.loanDeduct = $event,
                      min: 0,
                      precision: 2,
                      controls: false,
                      disabled: readonly.value,
                      style: { "width": "100%" }
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "实发",
                  width: "120",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_15, vue.toDisplayString(vue.unref(formatAmount)(calcNet(row))), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "80",
                  align: "center"
                }, {
                  default: vue.withCtx(({ $index }) => [
                    vue.createVNode(_component_el_button, {
                      link: "",
                      type: "danger",
                      disabled: readonly.value,
                      onClick: ($event) => removeItem($index)
                    }, {
                      default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                        vue.createTextVNode("移除", -1)
                      ])]),
                      _: 1
                    }, 8, ["disabled", "onClick"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"]),
            vue.createElementVNode("div", _hoisted_16, [
              vue.createVNode(_component_el_button, { onClick: goBack }, {
                default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                disabled: readonly.value,
                onClick: onSave
              }, {
                default: vue.withCtx(() => [..._cache[23] || (_cache[23] = [
                  vue.createTextVNode("保存", -1)
                ])]),
                _: 1
              }, 8, ["loading", "disabled"])
            ])
          ])), [
            [_directive_loading, loading.value]
          ]),
          vue.createVNode(_component_el_dialog, {
            modelValue: addVisible.value,
            "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => addVisible.value = $event),
            title: "添加员工",
            width: "420px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[9] || (_cache[9] = ($event) => addVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                disabled: !addEmployeeId.value,
                loading: adding.value,
                onClick: confirmAdd
              }, {
                default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                  vue.createTextVNode("添加", -1)
                ])]),
                _: 1
              }, 8, ["disabled", "loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_select, {
                modelValue: addEmployeeId.value,
                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => addEmployeeId.value = $event),
                filterable: "",
                placeholder: "搜索并选择员工",
                style: { "width": "100%" }
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(addableEmployees.value, (e) => {
                    return vue.openBlock(), vue.createBlock(_component_el_option, {
                      key: e.id,
                      label: `${e.name}（${e.code}）`,
                      value: e.id
                    }, null, 8, ["label", "value"]);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"]),
              !addableEmployees.value.length ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_17, "没有可添加的在职员工（可能已全部录入）")) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue"])
        ]);
      };
    }
  });
  const HrPayrollEditPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-a74c1d23"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("hr", {
    components: {
      HrEmployeesPage,
      HrExpenseClaimsPage,
      HrLoansPage,
      HrPayrollsPage,
      HrPayrollEditPage
    }
  });
})(Vue, ElementPlus, ElementPlusIconsVue, axios, dayjs, XLSX, VueRouter);
