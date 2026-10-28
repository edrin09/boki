(function(vue, vueRouter, elementPlus, iconsVue, axios2) {
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
  const receiptApi = {
    /** 票据列表 */
    list: (params) => get("/receipts", params),
    detail: (id) => get(`/receipts/${id}`),
    /** 上传并识别票据（支持多文件 / 整个文件夹） */
    upload: (files, paths) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      if (paths?.length) paths.forEach((p) => form.append("paths", p ?? ""));
      return post("/receipts/upload", form);
    },
    remove: (id) => del(`/receipts/${id}`),
    /** 修正识别结果（票据类型/进销项方向），仅未入账票据 */
    update: (id, data) => put(`/receipts/${id}`, data),
    /** 待确认工作台列表 */
    pending: (params) => get("/receipts/pending", params),
    /** 生成凭证草稿 */
    generateDraft: (id) => post(`/receipts/${id}/draft`),
    /** 修改凭证草稿（改科目/改金额） */
    updateDraft: (id, data) => put(`/receipts/${id}/draft`, data),
    /** 确认入账 */
    confirm: (id) => post(`/receipts/${id}/confirm`),
    /** 批量确认入账 */
    confirmBatch: (ids) => post("/receipts/confirm-batch", { ids }),
    /** 驳回票据 */
    reject: (id, reason) => post(`/receipts/${id}/reject`, { reason }),
    /** 票据原图地址（带鉴权，需 responseType=blob 拉取） */
    fileUrl: (id) => `/receipts/${id}/file`
  };
  const classifyRuleApi = {
    list: (params) => get("/receipts/rules", params),
    detail: (id) => get(`/receipts/rules/${id}`),
    create: (data) => post("/receipts/rules", data),
    update: (id, data) => put(`/receipts/rules/${id}`, data),
    toggle: (id, enabled) => put(`/receipts/rules/${id}/toggle`, { enabled }),
    remove: (id) => del(`/receipts/rules/${id}`)
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
  const _hoisted_1$2 = { class: "page" };
  const _hoisted_2$2 = { class: "page-card" };
  const _hoisted_3$2 = { class: "page-toolbar" };
  const _hoisted_4$2 = ["onClick"];
  const _hoisted_5$2 = { class: "amount amount--total" };
  const _hoisted_6$1 = {
    key: 0,
    class: "cell-sub"
  };
  const _hoisted_7$1 = {
    key: 0,
    class: "cell-sub"
  };
  const _hoisted_8$1 = { class: "page-pagination" };
  const _hoisted_9$1 = {
    key: 0,
    class: "result-panel"
  };
  const _hoisted_10$1 = { class: "result-summary" };
  const _hoisted_11$1 = { class: "suggest-line" };
  const _hoisted_12$1 = { class: "text-muted" };
  const _hoisted_13$1 = { class: "entry-line text-muted" };
  const _hoisted_14$1 = { class: "suggest-line" };
  const _hoisted_15$1 = { class: "entry-line text-muted" };
  const _hoisted_16$1 = {
    key: 2,
    class: "text-muted"
  };
  const _hoisted_17$1 = {
    key: 3,
    class: "text-danger"
  };
  const _hoisted_18$1 = { key: 0 };
  const _hoisted_19$1 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_20$1 = { class: "result-actions" };
  const _hoisted_21$1 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_22$1 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_23$1 = ["src"];
  const MAX_UPLOAD$1 = 20;
  const _sfc_main$2 = /* @__PURE__ */ vue.defineComponent({
    __name: "list",
    setup(__props) {
      const router = vueRouter.useRouter();
      const STATUS_META = {
        parsed: { label: "待处理", type: "warning" },
        drafted: { label: "草稿待确认", type: "warning" },
        confirmed: { label: "已入账", type: "success" },
        rejected: { label: "已驳回", type: "info" },
        duplicate: { label: "重复", type: "info" },
        failed: { label: "解析失败", type: "danger" }
      };
      const typeOptions = [
        { type: "invoice", typeName: "增值税发票" },
        { type: "payroll", typeName: "工资表" },
        { type: "bank_statement", typeName: "银行对账单" },
        { type: "id_card", typeName: "身份证" },
        { type: "business_license", typeName: "营业执照" },
        { type: "train_ticket", typeName: "火车票" },
        { type: "receipt", typeName: "通用收据" },
        { type: "unknown", typeName: "未识别" }
      ];
      const statusOptions = [
        { label: "待处理", value: "parsed" },
        { label: "草稿待确认", value: "drafted" },
        { label: "已入账", value: "confirmed" },
        { label: "已驳回", value: "rejected" },
        { label: "解析失败", value: "failed" }
      ];
      const dateRange = vue.ref(null);
      const { list, total, loading, query, load, search, handleSize, reset: onReset } = usePagedList({
        fetcher: (params) => receiptApi.list(params),
        defaultParams: { page: 1, pageSize: 20 }
      });
      function onDateChange(val) {
        if (val) {
          query.value.startDate = val[0];
          query.value.endDate = val[1];
        } else {
          delete query.value.startDate;
          delete query.value.endDate;
        }
        search();
      }
      const uploadVisible = vue.ref(false);
      const uploading = vue.ref(false);
      const fileList = vue.ref([]);
      const results = vue.ref([]);
      const draftedResults = vue.computed(() => results.value.filter((r) => r.drafted));
      const pendingResults = vue.computed(() => results.value.filter((r) => r.status === "parsed" && !r.drafted));
      const otherResults = vue.computed(() => results.value.filter((r) => r.status !== "parsed"));
      function onFileChange(_file, files) {
        fileList.value = files;
        results.value = [];
      }
      function onFileRemove(_file, files) {
        fileList.value = files;
        results.value = [];
      }
      const UPLOAD_EXT = /\.(jpe?g|png|webp|bmp|tiff|pdf)$/i;
      async function onUpload() {
        const items = fileList.value.filter((f) => f.raw instanceof File);
        if (!items.length) return;
        const supported = items.filter((f) => UPLOAD_EXT.test(f.name));
        const skippedFiles = items.filter((f) => !UPLOAD_EXT.test(f.name));
        const dirLike = items.filter((f) => !/\.[a-z0-9]{2,5}$/i.test(f.name));
        if (!supported.length && dirLike.length) {
          const names = dirLike.slice(0, 3).map((f) => f.name).join("、");
          elementPlus.ElMessage.error(
            `「${names}」看起来是个文件夹，不是发票文件：拖拽文件夹读不到里面的票，请点上传区里的「点击选择文件夹」按钮`
          );
          return;
        }
        if (!supported.length) {
          const names = skippedFiles.slice(0, 5).map((f) => f.name).join("、");
          elementPlus.ElMessage.error(
            `所选文件夹里没有可记账的票据：共 ${items.length} 个文件，均不是 jpg/png/webp/bmp/tiff/pdf（${names}${skippedFiles.length > 5 ? " 等" : ""}）`
          );
          return;
        }
        if (skippedFiles.length > 0) {
          elementPlus.ElMessage.info(
            `已从文件夹中跳过 ${skippedFiles.length} 个非票据文件（xlsx/docx 等），本次上传 ${supported.length} 个票据`
          );
        }
        const raws = supported.map((f) => f.raw);
        const paths = supported.map((f) => f.raw.webkitRelativePath || null);
        uploading.value = true;
        try {
          const batches = Math.ceil(raws.length / MAX_UPLOAD$1);
          const merged = [];
          let failedCount = 0;
          for (let i = 0; i < batches; i++) {
            const start = i * MAX_UPLOAD$1;
            const slice = raws.slice(start, start + MAX_UPLOAD$1);
            const slicePaths = paths.slice(start, start + MAX_UPLOAD$1);
            try {
              const res = await receiptApi.upload(slice, slicePaths);
              if (res?.length) merged.push(...res);
            } catch {
              failedCount += slice.length;
            }
          }
          results.value = merged;
          const drafted = draftedResults.value.length;
          const pending = pendingResults.value.length;
          if (drafted > 0) {
            elementPlus.ElMessage.success(
              `识别完成：${drafted} 个已自动生成凭证${pending ? `，${pending} 个需人工确认` : ""}`
            );
          } else if (pending > 0) {
            elementPlus.ElMessage.warning(`识别完成：${pending} 个单据需人工确认，原因见下方`);
          } else {
            elementPlus.ElMessage.info("识别完成：没有新增可记账的单据");
          }
          await load();
          if (failedCount > 0) {
            elementPlus.ElMessage.error(`${failedCount} 个票据上传失败（分批重试一遍即可），已成功的 ${merged.length} 个结果见下方`);
          }
        } finally {
          uploading.value = false;
        }
      }
      function onUploadClose() {
        fileList.value = [];
        results.value = [];
      }
      const detailVisible = vue.ref(false);
      const detail = vue.ref(null);
      async function openDetail(row) {
        detail.value = await receiptApi.detail(row.id);
        detailVisible.value = true;
      }
      const imageVisible = vue.ref(false);
      const imageUrl = vue.ref("");
      const imageName = vue.ref("");
      const isPdf = vue.ref(false);
      async function openImage(row) {
        try {
          const res = await service.get(receiptApi.fileUrl(row.id), { responseType: "blob" });
          const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
          isPdf.value = blob.type === "application/pdf" || /\.pdf$/i.test(row.fileName ?? "");
          imageUrl.value = URL.createObjectURL(blob);
          imageName.value = row.fileName;
          imageVisible.value = true;
        } catch {
          elementPlus.ElMessage.error("无法加载票据原图");
        }
      }
      function goWorkbench(row) {
        uploadVisible.value = false;
        router.push("/receipts/workbench");
      }
      async function onRemove(row) {
        if (!await confirmDelete(`票据「${row.fileName}」`)) return;
        await receiptApi.remove(row.id);
        ok("票据已删除");
        await load();
      }
      return (_ctx, _cache) => {
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_tooltip = vue.resolveComponent("el-tooltip");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _component_el_image = vue.resolveComponent("el-image");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$2, [
          vue.createElementVNode("div", _hoisted_2$2, [
            vue.createElementVNode("div", _hoisted_3$2, [
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).receiptType,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).receiptType = $event),
                placeholder: "票据类型",
                clearable: "",
                style: { "width": "140px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(typeOptions, (t) => {
                    return vue.createVNode(_component_el_option, {
                      key: t.type,
                      label: t.typeName,
                      value: t.type
                    }, null, 8, ["label", "value"]);
                  }), 64))
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).status,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => vue.unref(query).status = $event),
                placeholder: "处理状态",
                clearable: "",
                style: { "width": "140px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(statusOptions, (s) => {
                    return vue.createVNode(_component_el_option, {
                      key: s.value,
                      label: s.label,
                      value: s.value
                    }, null, 8, ["label", "value"]);
                  }), 64))
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_date_picker, {
                modelValue: dateRange.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => dateRange.value = $event),
                type: "daterange",
                "value-format": "YYYY-MM-DD",
                "range-separator": "至",
                "start-placeholder": "开票开始",
                "end-placeholder": "开票结束",
                style: { "width": "260px" },
                onChange: onDateChange
              }, null, 8, ["modelValue"]),
              vue.createVNode(_component_el_input, {
                modelValue: vue.unref(query).keyword,
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => vue.unref(query).keyword = $event),
                placeholder: "文件名 / 购销方 / 内容",
                clearable: "",
                style: { "width": "180px" },
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
                  _cache[11] || (_cache[11] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: vue.unref(onReset) }, {
                default: vue.withCtx(() => [..._cache[12] || (_cache[12] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }, 8, ["onClick"]),
              _cache[14] || (_cache[14] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                type: "primary",
                onClick: _cache[4] || (_cache[4] = ($event) => uploadVisible.value = true)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Upload))
                    ]),
                    _: 1
                  }),
                  _cache[13] || (_cache[13] = vue.createTextVNode("上传票据 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "receipt:list"]
              ])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无票据"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "fileName",
                  label: "文件",
                  "min-width": "200",
                  "show-overflow-tooltip": ""
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", {
                      class: "link",
                      onClick: ($event) => openImage(row)
                    }, vue.toDisplayString(row.fileName), 9, _hoisted_4$2)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "类型",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", null, vue.toDisplayString(row.receiptTypeName), 1),
                    row.confidence != null ? (vue.openBlock(), vue.createBlock(_component_el_tooltip, {
                      key: 0,
                      content: `识别置信度 ${(row.confidence * 100).toFixed(1)}%`,
                      placement: "top"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("span", {
                          class: vue.normalizeClass(["confidence", { "confidence--low": row.confidence < 0.6 }])
                        }, vue.toDisplayString((row.confidence * 100).toFixed(0)) + "%", 3)
                      ]),
                      _: 2
                    }, 1032, ["content"])) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "开票日期",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.issueDate || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "金额",
                  width: "130",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_5$2, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "销售方",
                  "min-width": "200",
                  "show-overflow-tooltip": ""
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("div", null, vue.toDisplayString(row.sellerName || "-"), 1),
                    row.sellerTaxNo ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_6$1, vue.toDisplayString(row.sellerTaxNo), 1)) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "购买方",
                  "min-width": "200",
                  "show-overflow-tooltip": ""
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("div", null, vue.toDisplayString(row.buyerName || "-"), 1),
                    row.buyerTaxNo ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_7$1, vue.toDisplayString(row.buyerTaxNo), 1)) : vue.createCommentVNode("", true)
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
                      type: STATUS_META[row.status]?.type,
                      size: "small"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(STATUS_META[row.status]?.label ?? row.status), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "175",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_button, {
                      link: "",
                      type: "primary",
                      onClick: ($event) => openDetail(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
                        vue.createTextVNode("详情", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"]),
                    row.status === "parsed" || row.status === "drafted" ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 0,
                      link: "",
                      type: "primary",
                      onClick: ($event) => goWorkbench()
                    }, {
                      default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                        vue.createTextVNode("待确认", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])) : vue.createCommentVNode("", true),
                    row.status !== "confirmed" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 1,
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "receipt:delete"]
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
            modelValue: uploadVisible.value,
            "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => uploadVisible.value = $event),
            title: "上传票据，AI 自动识别并记账",
            width: "760px",
            "destroy-on-close": "",
            onClosed: onUploadClose
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[7] || (_cache[7] = ($event) => uploadVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[20] || (_cache[20] = [
                  vue.createTextVNode("关闭", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                disabled: !fileList.value.length,
                loading: uploading.value,
                onClick: onUpload
              }, {
                default: vue.withCtx(() => [
                  vue.createTextVNode(vue.toDisplayString(results.value.length ? "重新识别" : "开始识别"), 1)
                ]),
                _: 1
              }, 8, ["disabled", "loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_upload, {
                drag: "",
                multiple: "",
                directory: "",
                "auto-upload": false,
                "on-change": onFileChange,
                "on-remove": onFileRemove,
                "file-list": fileList.value
              }, {
                tip: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                  vue.createElementVNode("div", { class: "el-upload__tip" }, [
                    vue.createTextVNode(" 支持 jpg/png/webp/bmp/tiff/pdf，单文件 ≤ 20MB，数量不限（超过 20 个自动分批）。 "),
                    vue.createElementVNode("strong", null, "可直接选整个文件夹"),
                    vue.createTextVNode("，系统递归读取并按文件夹名智能判断用途（采购/报销/工资/银行）与归属人； 识别结果进入「待确认」。 ")
                  ], -1)
                ])]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, { class: "el-icon--upload" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.UploadFilled))
                    ]),
                    _: 1
                  }),
                  _cache[19] || (_cache[19] = vue.createElementVNode("div", { class: "el-upload__text" }, [
                    vue.createTextVNode("拖拽文件到此处，或"),
                    vue.createElementVNode("em", null, "点击选择文件夹")
                  ], -1))
                ]),
                _: 1
              }, 8, ["file-list"]),
              results.value.length ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_9$1, [
                vue.createElementVNode("div", _hoisted_10$1, [
                  vue.createVNode(_component_el_tag, {
                    type: "success",
                    size: "small"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode("凭证已就绪 " + vue.toDisplayString(draftedResults.value.length), 1)
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_tag, {
                    type: "warning",
                    size: "small"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode("待人工 " + vue.toDisplayString(pendingResults.value.length), 1)
                    ]),
                    _: 1
                  }),
                  otherResults.value.length ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                    key: 0,
                    type: "info",
                    size: "small"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode("其他 " + vue.toDisplayString(otherResults.value.length), 1)
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true)
                ]),
                vue.createVNode(_component_el_table, {
                  data: results.value,
                  size: "small",
                  "max-height": "260"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "fileName",
                      label: "文件",
                      "min-width": "160",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "识别结果",
                      width: "120"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_tag, {
                          size: "small",
                          type: row.bookable ? "success" : row.status === "duplicate" ? "info" : "warning"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(row.receiptTypeName || "未识别"), 1)
                          ]),
                          _: 2
                        }, 1032, ["type"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "AI 判断",
                      "min-width": "260"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.drafted && row.draft ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                          vue.createElementVNode("div", _hoisted_11$1, [
                            vue.createVNode(_component_el_tag, {
                              size: "small",
                              type: "success"
                            }, {
                              default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                                vue.createTextVNode("凭证已就绪", -1)
                              ])]),
                              _: 1
                            }),
                            vue.createElementVNode("span", _hoisted_12$1, "记" + vue.toDisplayString(row.draft.voucherNo) + " · " + vue.toDisplayString(row.draft.voucherDate), 1)
                          ]),
                          vue.createElementVNode("div", _hoisted_13$1, vue.toDisplayString(row.draft.entries.map((e) => `${Number(e.debit) ? "借" : "贷"} ${e.accountName} ${Number(e.debit || e.credit)}`).join("；")), 1)
                        ], 64)) : row.suggestKindLabel ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                          vue.createElementVNode("div", _hoisted_14$1, [
                            vue.createVNode(_component_el_tag, {
                              size: "small",
                              type: "warning"
                            }, {
                              default: vue.withCtx(() => [
                                vue.createTextVNode(vue.toDisplayString(row.suggestKindLabel), 1)
                              ]),
                              _: 2
                            }, 1024)
                          ]),
                          vue.createElementVNode("div", _hoisted_15$1, vue.toDisplayString(row.draftMessage || row.blockReason), 1)
                        ], 64)) : row.status === "duplicate" ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_16$1, vue.toDisplayString(row.message || "重复票据"), 1)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_17$1, vue.toDisplayString(row.blockReason || row.message || "需人工处理"), 1))
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "置信度",
                      width: "80",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        row.confidence != null ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_18$1, vue.toDisplayString((row.confidence * 100).toFixed(0)) + "%", 1)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_19$1, "-"))
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                vue.createElementVNode("div", _hoisted_20$1, [
                  draftedResults.value.length ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                    key: 0,
                    type: "primary",
                    size: "small",
                    onClick: goWorkbench
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_icon, null, {
                        default: vue.withCtx(() => [
                          vue.createVNode(vue.unref(iconsVue.Right))
                        ]),
                        _: 1
                      }),
                      vue.createTextVNode("去确认入账（" + vue.toDisplayString(draftedResults.value.length) + "） ", 1)
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  pendingResults.value.length ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_21$1, " 待人工的单据尚未入账，可在工作台核对或手工生成凭证 ")) : vue.createCommentVNode("", true)
                ])
              ])) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: detailVisible.value,
            "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => detailVisible.value = $event),
            title: "票据详情",
            width: "720px",
            "destroy-on-close": ""
          }, {
            default: vue.withCtx(() => [
              detail.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_descriptions, {
                  column: 2,
                  border: "",
                  size: "small",
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_descriptions_item, { label: "文件" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.fileName), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "状态" }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_tag, {
                          type: STATUS_META[detail.value.status]?.type,
                          size: "small"
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(STATUS_META[detail.value.status]?.label ?? detail.value.status), 1)
                          ]),
                          _: 1
                        }, 8, ["type"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "类型" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.receiptTypeName), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "开票日期" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.issueDate || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "金额" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(detail.value.amount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "税额" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(vue.unref(formatAmount)(detail.value.taxAmount)), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "销售方" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.sellerName || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "销售方税号" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.sellerTaxNo || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "购买方" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.buyerName || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "购买方税号" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.buyerTaxNo || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "发票代码" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.invoiceCode || "-"), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "发票号码" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.invoiceNo || "-"), 1)
                      ]),
                      _: 1
                    }),
                    detail.value.confirmedByName ? (vue.openBlock(), vue.createBlock(_component_el_descriptions_item, {
                      key: 0,
                      label: "确认人"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.confirmedByName), 1)
                      ]),
                      _: 1
                    })) : vue.createCommentVNode("", true),
                    detail.value.rejectReason ? (vue.openBlock(), vue.createBlock(_component_el_descriptions_item, {
                      key: 1,
                      label: "驳回原因"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(detail.value.rejectReason), 1)
                      ]),
                      _: 1
                    })) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table, {
                  data: detail.value.fields ?? [],
                  size: "small",
                  "max-height": "300"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      prop: "label",
                      label: "字段",
                      width: "180"
                    }),
                    vue.createVNode(_component_el_table_column, {
                      prop: "value",
                      label: "识别值",
                      "min-width": "220",
                      "show-overflow-tooltip": ""
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "置信度",
                      width: "90",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ row: f }) => [
                        f.confidence != null ? (vue.openBlock(), vue.createElementBlock("span", {
                          key: 0,
                          class: vue.normalizeClass({ "text-danger": f.confidence < 0.6 })
                        }, vue.toDisplayString((f.confidence * 100).toFixed(1)) + "% ", 3)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_22$1, "-"))
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
            modelValue: imageVisible.value,
            "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => imageVisible.value = $event),
            title: imageName.value,
            width: "720px",
            "destroy-on-close": ""
          }, {
            default: vue.withCtx(() => [
              isPdf.value && imageUrl.value ? (vue.openBlock(), vue.createElementBlock("iframe", {
                key: 0,
                src: imageUrl.value,
                style: { "width": "100%", "height": "70vh", "border": "none" }
              }, null, 8, _hoisted_23$1)) : imageUrl.value ? (vue.openBlock(), vue.createBlock(_component_el_image, {
                key: 1,
                src: imageUrl.value,
                fit: "contain",
                style: { "width": "100%", "max-height": "70vh" },
                "preview-src-list": [imageUrl.value]
              }, null, 8, ["src", "preview-src-list"])) : vue.createCommentVNode("", true)
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
  const ReceiptListPage = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-e89d1117"]]);
  const _hoisted_1$1 = { class: "page" };
  const _hoisted_2$1 = { class: "page-card" };
  const _hoisted_3$1 = { class: "ai-upload" };
  const _hoisted_4$1 = {
    key: 0,
    class: "ai-result"
  };
  const _hoisted_5$1 = { class: "result-summary" };
  const _hoisted_6 = { class: "folder-line" };
  const _hoisted_7 = { class: "folder-path text-muted" };
  const _hoisted_8 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_9 = { class: "suggest-line" };
  const _hoisted_10 = { class: "text-muted" };
  const _hoisted_11 = { class: "entry-line text-muted" };
  const _hoisted_12 = {
    key: 1,
    class: "suggest-line"
  };
  const _hoisted_13 = { class: "text-muted" };
  const _hoisted_14 = { class: "suggest-line" };
  const _hoisted_15 = { class: "entry-line text-muted" };
  const _hoisted_16 = {
    key: 3,
    class: "text-muted"
  };
  const _hoisted_17 = { key: 0 };
  const _hoisted_18 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_19 = { class: "page-toolbar" };
  const _hoisted_20 = ["onClick"];
  const _hoisted_21 = { class: "amount amount--total" };
  const _hoisted_22 = { class: "suggest-line" };
  const _hoisted_23 = { class: "suggest-text" };
  const _hoisted_24 = {
    key: 0,
    class: "suggest-sub"
  };
  const _hoisted_25 = {
    key: 1,
    class: "suggest-sub"
  };
  const _hoisted_26 = {
    key: 1,
    class: "text-muted"
  };
  const _hoisted_27 = {
    key: 2,
    class: "suggest-sub text-danger"
  };
  const _hoisted_28 = { class: "suggest-sub" };
  const _hoisted_29 = {
    key: 0,
    class: "suggest-sub"
  };
  const _hoisted_30 = { class: "text-muted" };
  const _hoisted_31 = {
    key: 2,
    class: "text-muted"
  };
  const _hoisted_32 = { class: "page-pagination" };
  const _hoisted_33 = ["src"];
  const MAX_UPLOAD = 20;
  const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
    __name: "workbench",
    setup(__props) {
      const SUGGEST_TAG = {
        input_vat: "danger",
        output_vat: "success",
        expense: "warning",
        bank_fee: "info",
        payroll: "success",
        unknown: "info"
      };
      const { list, total, loading, query, load, handleSize } = usePagedList({
        fetcher: (params) => receiptApi.pending(params),
        defaultParams: { page: 1, pageSize: 20 }
      });
      const fileList = vue.ref([]);
      const uploading = vue.ref(false);
      const uploadProgress = vue.ref("");
      const results = vue.ref([]);
      const draftedResults = vue.computed(() => results.value.filter((r) => r.drafted));
      const pendingResults = vue.computed(() => results.value.filter((r) => r.status === "parsed" && !r.drafted));
      const otherResults = vue.computed(() => results.value.filter((r) => r.status !== "parsed"));
      const folderResults = vue.computed(() => results.value.filter((r) => r.folder));
      function onFileChange(_f, files) {
        fileList.value = files;
        results.value = [];
      }
      function onFileRemove(_f, files) {
        fileList.value = files;
        results.value = [];
      }
      function clearResults() {
        results.value = [];
        fileList.value = [];
      }
      const UPLOAD_EXT = /\.(jpe?g|png|webp|bmp|tiff|pdf)$/i;
      function normalizeUploadResult(r) {
        const pick = (k) => {
          const f = (r.fields || []).find((x) => x.key === k);
          const v = f?.value;
          return v === void 0 || v === null || v === "" ? null : v;
        };
        const total2 = pick("total_amount") ?? pick("amount");
        return {
          ...r,
          id: r.receiptId ?? r.id,
          amount: r.amount ?? (total2 === null ? null : Number(total2)),
          issueDate: r.issueDate ?? pick("issue_date"),
          // 表格的「归类建议」列读 suggestion；后端只给 suggestKind/suggestKindLabel/blockReason
          suggestion: r.suggestKind || r.bookable === false ? {
            kind: r.suggestKind ?? "unknown",
            kindLabel: r.suggestKindLabel ?? (r.bookable === false ? "需人工" : "已归类"),
            message: r.bookable === false ? r.blockReason || "需人工处理" : r.drafted ? "AI 已自动生成凭证" : "可一键生成凭证",
            counterparty: pick("seller_name") ?? pick("buyer_name"),
            hitChain: null
          } : null
        };
      }
      async function onUpload() {
        const items = fileList.value.filter((f) => f.raw instanceof File);
        if (!items.length) return;
        const supported = items.filter((f) => UPLOAD_EXT.test(f.name));
        const skippedFiles = items.filter((f) => !UPLOAD_EXT.test(f.name));
        const dirLike = items.filter((f) => !/\.[a-z0-9]{2,5}$/i.test(f.name));
        if (!supported.length && dirLike.length) {
          const names = dirLike.slice(0, 3).map((f) => f.name).join("、");
          elementPlus.ElMessage.error(
            `「${names}」看起来是个文件夹，不是发票文件：拖拽文件夹读不到里面的票，请点上传区里的「点击选择文件夹」按钮`
          );
          return;
        }
        if (!supported.length) {
          const names = skippedFiles.slice(0, 5).map((f) => f.name).join("、");
          elementPlus.ElMessage.error(
            `所选文件夹里没有可记账的票据：共 ${items.length} 个文件，均不是 jpg/png/webp/bmp/tiff/pdf（${names}${skippedFiles.length > 5 ? " 等" : ""}）`
          );
          return;
        }
        if (skippedFiles.length > 0) {
          elementPlus.ElMessage.info(
            `已从文件夹中跳过 ${skippedFiles.length} 个非票据文件（xlsx/docx 等），本次上传 ${supported.length} 个票据`
          );
        }
        const raws = supported.map((f) => f.raw);
        const paths = supported.map((f) => f.raw.webkitRelativePath || null);
        uploading.value = true;
        try {
          const batches = Math.ceil(raws.length / MAX_UPLOAD);
          const merged = [];
          let failedCount = 0;
          for (let i = 0; i < batches; i++) {
            const start = i * MAX_UPLOAD;
            const slice = raws.slice(start, start + MAX_UPLOAD);
            const slicePaths = paths.slice(start, start + MAX_UPLOAD);
            uploadProgress.value = batches > 1 ? `AI 识别中 ${i + 1}/${batches} 批（${start + 1}-${start + slice.length} / ${raws.length}）` : "";
            try {
              const res = await receiptApi.upload(slice, slicePaths);
              if (res?.length) merged.push(...res);
            } catch {
              failedCount += slice.length;
            }
          }
          uploadProgress.value = "";
          results.value = merged.map(normalizeUploadResult);
          const drafted = draftedResults.value.length;
          const pending = pendingResults.value.length;
          const byFolder = folderResults.value.length;
          if (drafted > 0) {
            const folderTip = byFolder ? `，其中 ${byFolder} 个按目录判定` : "";
            elementPlus.ElMessage.success(`AI 已生成 ${drafted} 张凭证${folderTip}${pending ? `，${pending} 个需人工确认` : ""}`);
          } else if (pending > 0) {
            elementPlus.ElMessage.warning(`${pending} 个单据需人工确认，原因见上方`);
          } else {
            elementPlus.ElMessage.info("没有新增可记账的单据");
          }
          await load();
          if (failedCount > 0) {
            elementPlus.ElMessage.error(`${failedCount} 个票据上传失败（分批重试一遍即可），已成功的 ${merged.length} 个结果见下方`);
          }
        } finally {
          uploading.value = false;
          uploadProgress.value = "";
        }
      }
      const accountOptions = vue.ref([]);
      async function loadAccounts() {
        try {
          accountOptions.value = await accountApi.options();
        } catch {
          accountOptions.value = [];
        }
      }
      const selected = vue.ref([]);
      const confirming = vue.ref(false);
      const selectedDrafted = vue.computed(() => selected.value.filter((r) => r.status === "drafted"));
      function onSelectionChange(rows) {
        selected.value = rows;
      }
      async function onConfirmBatch() {
        const ids = selectedDrafted.value.map((r) => r.id);
        if (!ids.length) return;
        try {
          await elementPlus.ElMessageBox.confirm(`确定批量确认 ${ids.length} 张票据入账？确认后进入账簿与报表。`, "批量确认", {
            type: "warning",
            confirmButtonText: "确认入账",
            cancelButtonText: "取消"
          });
        } catch {
          return;
        }
        confirming.value = true;
        try {
          const res = await receiptApi.confirmBatch(ids);
          if (res.failed > 0) {
            elementPlus.ElMessage.warning(`成功 ${res.success} 张，失败 ${res.failed} 张：${res.results.filter((r) => !r.success).map((r) => r.message).join("；")}`);
          } else {
            ok(`已确认入账 ${res.success} 张票据`);
          }
          await load();
        } finally {
          confirming.value = false;
        }
      }
      const draftingId = vue.ref("");
      async function onGenerateDraft(row) {
        if (row.status === "drafted") {
          try {
            await elementPlus.ElMessageBox.confirm("将按最新识别与归类重新生成凭证草稿，现有草稿（含手工修改）会被覆盖。继续？", "重新生成草稿", {
              type: "warning",
              confirmButtonText: "重新生成",
              cancelButtonText: "取消"
            });
          } catch {
            return;
          }
        }
        draftingId.value = row.id;
        try {
          const res = await receiptApi.generateDraft(row.id);
          const updated = res;
          if (updated.claims && updated.claims.length) {
            ok(`已生成报销单草稿：${updated.claims.map((c) => `${c.claimNo}（${c.claimTypeLabel}）`).join("、")}，确认入账时自动审核报销单`);
          } else if (updated.draft) {
            ok("凭证草稿已生成，借贷平衡");
          }
          await load();
        } finally {
          draftingId.value = "";
        }
      }
      const editVisible = vue.ref(false);
      const editing = vue.ref(null);
      const draftForm = vue.reactive({ voucherDate: "", entries: [] });
      const savingDraft = vue.ref(false);
      const debitTotal = vue.computed(() => draftForm.entries.reduce((s, e) => s + (Number(e.debit) || 0), 0));
      const creditTotal = vue.computed(() => draftForm.entries.reduce((s, e) => s + (Number(e.credit) || 0), 0));
      const balanceOk = vue.computed(() => draftForm.entries.length >= 2 && Math.abs(debitTotal.value - creditTotal.value) < 5e-3);
      function openEditDraft(row) {
        editing.value = row;
        draftForm.voucherDate = row.draft?.voucherDate || row.issueDate || "";
        draftForm.entries = (row.draft?.entries ?? []).map((e) => ({
          summary: e.summary ?? "",
          accountId: e.accountId,
          // 辅助核算必须原样带出：应付账款/费用类科目缺往来单位或部门会被后端拒绝
          partnerId: e.partnerId ?? null,
          departmentId: e.departmentId ?? null,
          projectId: e.projectId ?? null,
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0
        }));
        editVisible.value = true;
      }
      function removeEntry(index) {
        if (draftForm.entries.length <= 2) return;
        draftForm.entries.splice(index, 1);
      }
      async function onSaveDraft() {
        if (!balanceOk.value) {
          elementPlus.ElMessage.warning("借贷不平，无法保存");
          return;
        }
        savingDraft.value = true;
        try {
          await receiptApi.updateDraft(editing.value.id, {
            voucherDate: draftForm.voucherDate,
            entries: draftForm.entries
          });
          ok("草稿已保存");
          editVisible.value = false;
          await load();
        } finally {
          savingDraft.value = false;
        }
      }
      async function onConfirm(row) {
        try {
          await elementPlus.ElMessageBox.confirm(`确定「${row.fileName}」确认入账？`, "确认入账", {
            type: "warning",
            confirmButtonText: "确认入账",
            cancelButtonText: "取消"
          });
        } catch {
          return;
        }
        await receiptApi.confirm(row.id);
        ok("已确认入账");
        await load();
      }
      const rejectVisible = vue.ref(false);
      const rejectTarget = vue.ref(null);
      const rejectReason = vue.ref("");
      const rejecting = vue.ref(false);
      function onReject(row) {
        rejectTarget.value = row;
        rejectReason.value = "";
        rejectVisible.value = true;
      }
      async function onRejectConfirm() {
        rejecting.value = true;
        try {
          await receiptApi.reject(rejectTarget.value.id, rejectReason.value || void 0);
          ok("已驳回，该票据不会生成凭证");
          rejectVisible.value = false;
          await load();
        } finally {
          rejecting.value = false;
        }
      }
      const TYPE_OPTIONS = [
        { type: "invoice", typeName: "增值税发票" },
        { type: "payroll", typeName: "工资表" },
        { type: "bank_statement", typeName: "银行对账单" },
        { type: "train_ticket", typeName: "火车票" },
        { type: "receipt", typeName: "通用收据" },
        { type: "unknown", typeName: "未识别" }
      ];
      const correctVisible = vue.ref(false);
      const correcting = vue.ref(false);
      const correctingRow = vue.ref(null);
      const correctForm = vue.reactive({
        receiptType: "",
        direction: null
      });
      function openCorrect(row) {
        correctingRow.value = row;
        correctForm.receiptType = row.receiptType || "unknown";
        correctForm.direction = row.directionOverride ?? null;
        correctVisible.value = true;
      }
      function onCorrectTypeChange(type) {
        if (type !== "invoice") correctForm.direction = null;
      }
      async function onCorrectSave() {
        if (!correctingRow.value) return;
        correcting.value = true;
        try {
          await receiptApi.update(correctingRow.value.id, {
            receiptType: correctForm.receiptType,
            direction: correctForm.direction ?? void 0
          });
          ok("识别结果已修正，已重新评估能否自动入账");
          correctVisible.value = false;
          await load();
        } finally {
          correcting.value = false;
        }
      }
      async function onRemove(row) {
        try {
          await elementPlus.ElMessageBox.confirm(
            `确定删除票据「${row.fileName}」？删除后识别记录与原文件不可恢复。`,
            "删除票据",
            { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        await receiptApi.remove(row.id);
        ok("票据已删除");
        await load();
      }
      const imageVisible = vue.ref(false);
      const imageUrl = vue.ref("");
      const imageName = vue.ref("");
      const isPdf = vue.ref(false);
      async function openImage(row) {
        try {
          const res = await service.get(receiptApi.fileUrl(row.id), { responseType: "blob" });
          const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
          isPdf.value = blob.type === "application/pdf" || /\.pdf$/i.test(row.fileName ?? "");
          imageUrl.value = URL.createObjectURL(blob);
          imageName.value = row.fileName;
          imageVisible.value = true;
        } catch {
          elementPlus.ElMessage.error("无法加载票据原图");
        }
      }
      vue.onMounted(loadAccounts);
      return (_ctx, _cache) => {
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_upload = vue.resolveComponent("el-upload");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_tooltip = vue.resolveComponent("el-tooltip");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_descriptions_item = vue.resolveComponent("el-descriptions-item");
        const _component_el_date_picker = vue.resolveComponent("el-date-picker");
        const _component_el_descriptions = vue.resolveComponent("el-descriptions");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_image = vue.resolveComponent("el-image");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
          vue.createElementVNode("div", _hoisted_2$1, [
            vue.createElementVNode("div", _hoisted_3$1, [
              vue.createVNode(_component_el_upload, {
                drag: "",
                multiple: "",
                directory: "",
                "auto-upload": false,
                "on-change": onFileChange,
                "on-remove": onFileRemove,
                "file-list": fileList.value
              }, {
                tip: vue.withCtx(() => [..._cache[13] || (_cache[13] = [
                  vue.createElementVNode("div", { class: "el-upload__tip" }, [
                    vue.createTextVNode(" 支持 jpg/png/webp/bmp/tiff/pdf，单文件 ≤ 20MB，数量不限（超过 20 个自动分批）。 "),
                    vue.createElementVNode("strong", null, "可直接选整个文件夹"),
                    vue.createTextVNode("，系统递归读取其中全部票据； 并按"),
                    vue.createElementVNode("strong", null, "文件夹名"),
                    vue.createTextVNode("智能判断用途（采购 / 报销 / 工资 / 银行）与归属人， 例如「采购单/张三/」即识别为「采购 · 张三」。 ")
                  ], -1)
                ])]),
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, { class: "el-icon--upload" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.UploadFilled))
                    ]),
                    _: 1
                  }),
                  _cache[14] || (_cache[14] = vue.createElementVNode("div", { class: "el-upload__text" }, [
                    vue.createTextVNode(" 拖拽发票、工资表、银行对账单到此处，或"),
                    vue.createElementVNode("em", null, "点击选择文件夹")
                  ], -1))
                ]),
                _: 1
              }, 8, ["file-list"]),
              fileList.value.length ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                key: 0,
                type: "primary",
                class: "ai-upload__go",
                loading: uploading.value,
                onClick: onUpload
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.MagicStick))
                    ]),
                    _: 1
                  }),
                  vue.createTextVNode(vue.toDisplayString(uploading.value ? uploadProgress.value || "AI 识别中…" : `AI 识别并生成凭证（${fileList.value.length}）`), 1)
                ]),
                _: 1
              }, 8, ["loading"])) : vue.createCommentVNode("", true)
            ]),
            results.value.length ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_4$1, [
              vue.createElementVNode("div", _hoisted_5$1, [
                vue.createVNode(_component_el_tag, {
                  type: "success",
                  size: "small"
                }, {
                  default: vue.withCtx(() => [
                    vue.createTextVNode("凭证已就绪 " + vue.toDisplayString(draftedResults.value.length), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_tag, {
                  type: "warning",
                  size: "small"
                }, {
                  default: vue.withCtx(() => [
                    vue.createTextVNode("待人工 " + vue.toDisplayString(pendingResults.value.length), 1)
                  ]),
                  _: 1
                }),
                otherResults.value.length ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                  key: 0,
                  type: "info",
                  size: "small"
                }, {
                  default: vue.withCtx(() => [
                    vue.createTextVNode("其他 " + vue.toDisplayString(otherResults.value.length), 1)
                  ]),
                  _: 1
                })) : vue.createCommentVNode("", true),
                vue.createVNode(_component_el_button, {
                  size: "small",
                  onClick: clearResults
                }, {
                  default: vue.withCtx(() => [..._cache[15] || (_cache[15] = [
                    vue.createTextVNode("清空结果", -1)
                  ])]),
                  _: 1
                })
              ]),
              vue.createVNode(_component_el_table, {
                data: results.value,
                size: "small",
                "max-height": "240"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_table_column, {
                    prop: "fileName",
                    label: "文件",
                    "min-width": "150",
                    "show-overflow-tooltip": ""
                  }),
                  folderResults.value.length ? (vue.openBlock(), vue.createBlock(_component_el_table_column, {
                    key: 0,
                    label: "目录判定",
                    width: "150"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      row.folder ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                        vue.createElementVNode("div", _hoisted_6, [
                          vue.createVNode(_component_el_tag, {
                            size: "small",
                            type: "primary"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createTextVNode(vue.toDisplayString(row.folder.purposeLabel), 1)
                            ]),
                            _: 2
                          }, 1024),
                          row.folder.ownerName ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                            key: 0,
                            size: "small",
                            class: "ml6"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createTextVNode(vue.toDisplayString(row.folder.ownerName), 1)
                            ]),
                            _: 2
                          }, 1024)) : vue.createCommentVNode("", true)
                        ]),
                        vue.createElementVNode("div", _hoisted_7, vue.toDisplayString(row.folder.path), 1)
                      ], 64)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_8, "-"))
                    ]),
                    _: 1
                  })) : vue.createCommentVNode("", true),
                  vue.createVNode(_component_el_table_column, {
                    label: "识别",
                    width: "110"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      vue.createVNode(_component_el_tag, {
                        size: "small",
                        type: row.drafted ? "success" : row.status === "duplicate" ? "info" : "warning"
                      }, {
                        default: vue.withCtx(() => [
                          vue.createTextVNode(vue.toDisplayString(row.receiptTypeName || "未识别"), 1)
                        ]),
                        _: 2
                      }, 1032, ["type"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "AI 判断",
                    "min-width": "280"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      row.drafted && row.draft ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                        vue.createElementVNode("div", _hoisted_9, [
                          vue.createVNode(_component_el_tag, {
                            size: "small",
                            type: "success"
                          }, {
                            default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                              vue.createTextVNode("凭证已生成", -1)
                            ])]),
                            _: 1
                          }),
                          vue.createElementVNode("span", _hoisted_10, "记" + vue.toDisplayString(row.draft.voucherNo) + " · " + vue.toDisplayString(row.draft.voucherDate), 1)
                        ]),
                        vue.createElementVNode("div", _hoisted_11, vue.toDisplayString(row.draft.entries.map((e) => `${Number(e.debit) ? "借" : "贷"} ${e.accountName} ${Number(e.debit || e.credit)}`).join("；")), 1)
                      ], 64)) : row.drafted && row.claims && row.claims.length ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_12, [
                        vue.createVNode(_component_el_tag, {
                          size: "small",
                          type: "success"
                        }, {
                          default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
                            vue.createTextVNode("报销单已生成", -1)
                          ])]),
                          _: 1
                        }),
                        vue.createElementVNode("span", _hoisted_13, vue.toDisplayString(row.claims.map((c) => `${c.claimNo}（${c.claimTypeLabel} ${Number(c.totalAmount)}）`).join("、")), 1)
                      ])) : row.suggestKindLabel ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 2 }, [
                        vue.createElementVNode("div", _hoisted_14, [
                          vue.createVNode(_component_el_tag, {
                            size: "small",
                            type: "warning"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createTextVNode(vue.toDisplayString(row.suggestKindLabel), 1)
                            ]),
                            _: 2
                          }, 1024)
                        ]),
                        vue.createElementVNode("div", _hoisted_15, vue.toDisplayString(row.draftMessage || row.blockReason), 1)
                      ], 64)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_16, vue.toDisplayString(row.blockReason || row.message || "需人工处理"), 1))
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_table_column, {
                    label: "置信度",
                    width: "80",
                    align: "center"
                  }, {
                    default: vue.withCtx(({ row }) => [
                      row.confidence != null ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_17, vue.toDisplayString((row.confidence * 100).toFixed(0)) + "%", 1)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_18, "-"))
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["data"]),
              draftedResults.value.length ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                key: 0,
                type: "primary",
                size: "small",
                class: "mt8",
                onClick: vue.unref(load)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Refresh))
                    ]),
                    _: 1
                  }),
                  _cache[18] || (_cache[18] = vue.createTextVNode("刷新下方列表，确认入账 ", -1))
                ]),
                _: 1
              }, 8, ["onClick"])) : vue.createCommentVNode("", true)
            ])) : vue.createCommentVNode("", true),
            vue.createElementVNode("div", _hoisted_19, [
              _cache[20] || (_cache[20] = vue.createElementVNode("div", { class: "page-toolbar__hint" }, [
                vue.createElementVNode("strong", null, "待确认入账"),
                vue.createElementVNode("span", { class: "text-muted" }, "AI 已生成凭证草稿，核对科目与金额后点「确认入账」即可计入账簿。")
              ], -1)),
              vue.createVNode(_component_el_button, {
                type: "primary",
                disabled: !selectedDrafted.value.length,
                loading: confirming.value,
                onClick: onConfirmBatch
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Select))
                    ]),
                    _: 1
                  }),
                  vue.createTextVNode("批量确认入账（" + vue.toDisplayString(selectedDrafted.value.length) + "） ", 1)
                ]),
                _: 1
              }, 8, ["disabled", "loading"]),
              vue.createVNode(_component_el_button, { onClick: vue.unref(load) }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Refresh))
                    ]),
                    _: 1
                  }),
                  _cache[19] || (_cache[19] = vue.createTextVNode("刷新", -1))
                ]),
                _: 1
              }, 8, ["onClick"])
            ]),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无待确认票据",
              "row-key": "id",
              onSelectionChange
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  type: "selection",
                  width: "45",
                  selectable: (row) => row.status === "drafted"
                }, null, 8, ["selectable"]),
                vue.createVNode(_component_el_table_column, {
                  prop: "fileName",
                  label: "票据文件",
                  "min-width": "200",
                  "show-overflow-tooltip": ""
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", {
                      class: "link",
                      onClick: ($event) => openImage(row)
                    }, vue.toDisplayString(row.fileName), 9, _hoisted_20),
                    row.status === "drafted" ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 0,
                      type: "warning",
                      size: "small",
                      class: "ml6"
                    }, {
                      default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                        vue.createTextVNode("草稿", -1)
                      ])]),
                      _: 1
                    })) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "类型",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", null, vue.toDisplayString(row.receiptTypeName), 1),
                    row.confidence != null ? (vue.openBlock(), vue.createBlock(_component_el_tooltip, {
                      key: 0,
                      content: `识别置信度 ${(row.confidence * 100).toFixed(1)}%`,
                      placement: "top"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createElementVNode("span", {
                          class: vue.normalizeClass(["confidence", { "confidence--low": row.confidence < 0.6 }])
                        }, vue.toDisplayString((row.confidence * 100).toFixed(0)) + "%", 3)
                      ]),
                      _: 2
                    }, 1032, ["content"])) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "开票日期",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createTextVNode(vue.toDisplayString(row.issueDate || "-"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "金额",
                  width: "140",
                  align: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", _hoisted_21, vue.toDisplayString(vue.unref(formatAmount)(row.amount)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "归类建议",
                  "min-width": "260"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.suggestion ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                      vue.createElementVNode("div", _hoisted_22, [
                        vue.createVNode(_component_el_tag, {
                          size: "small",
                          type: SUGGEST_TAG[row.suggestion.kind]
                        }, {
                          default: vue.withCtx(() => [
                            vue.createTextVNode(vue.toDisplayString(row.suggestion.kindLabel), 1)
                          ]),
                          _: 2
                        }, 1032, ["type"]),
                        vue.createElementVNode("span", _hoisted_23, vue.toDisplayString(row.suggestion.message), 1)
                      ]),
                      row.suggestion.counterparty ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_24, "对手：" + vue.toDisplayString(row.suggestion.counterparty), 1)) : vue.createCommentVNode("", true),
                      row.suggestion.hitChain?.length ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_25, [
                        _cache[22] || (_cache[22] = vue.createTextVNode(" 命中：", -1)),
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(row.suggestion.hitChain, (h) => {
                          return vue.openBlock(), vue.createBlock(_component_el_tag, {
                            key: `${h.ruleName}-${h.priority}`,
                            size: "small",
                            type: "info",
                            class: "mr4"
                          }, {
                            default: vue.withCtx(() => [
                              vue.createTextVNode(vue.toDisplayString(h.ruleName), 1)
                            ]),
                            _: 2
                          }, 1024);
                        }), 128))
                      ])) : vue.createCommentVNode("", true)
                    ], 64)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_26, "无法自动归类")),
                    row.blockReason ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_27, vue.toDisplayString(row.blockReason), 1)) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "凭证草稿",
                  "min-width": "180"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.draft ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                      vue.createElementVNode("div", _hoisted_28, vue.toDisplayString(row.draft.voucherDate) + " 记" + vue.toDisplayString(row.draft.voucherNo), 1),
                      row.draft.entries ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_29, [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(row.draft.entries, (e, i) => {
                          return vue.openBlock(), vue.createElementBlock("span", {
                            key: i,
                            class: "entry-line"
                          }, [
                            vue.createTextVNode(vue.toDisplayString(e.debit ? `借 ${e.accountCode}` : `贷 ${e.accountCode}`) + " ", 1),
                            vue.createElementVNode("span", _hoisted_30, vue.toDisplayString(vue.unref(formatAmount)(e.debit || e.credit)), 1)
                          ]);
                        }), 128))
                      ])) : vue.createCommentVNode("", true)
                    ], 64)) : row.claims && row.claims.length ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                      (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(row.claims, (c) => {
                        return vue.openBlock(), vue.createElementBlock("div", {
                          key: c.id,
                          class: "suggest-sub"
                        }, " 报销单 " + vue.toDisplayString(c.claimNo) + "（" + vue.toDisplayString(c.claimTypeLabel) + " " + vue.toDisplayString(vue.unref(formatAmount)(Number(c.totalAmount))) + "） ", 1);
                      }), 128)),
                      _cache[23] || (_cache[23] = vue.createElementVNode("div", { class: "suggest-sub text-muted" }, "可到「报销单」调整明细后回此确认入账", -1))
                    ], 64)) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_31, "未生成"))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "操作",
                  width: "330",
                  fixed: "right"
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.bookable === false ? (vue.openBlock(), vue.createBlock(_component_el_tooltip, {
                      key: 0,
                      content: "该单据无法自动生成凭证，请查看左侧原因；可先「修正识别」纠正类型或方向",
                      placement: "top"
                    }, {
                      default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                        vue.createElementVNode("span", { class: "disabled-hint" }, "不可自动入账", -1)
                      ])]),
                      _: 1
                    })) : vue.createCommentVNode("", true),
                    row.status === "parsed" ? (vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 1,
                      link: "",
                      type: "primary",
                      onClick: ($event) => openCorrect(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
                        vue.createTextVNode("修正识别", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])) : vue.createCommentVNode("", true),
                    row.status === "parsed" && !row.drafted && row.bookable !== false ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 2,
                      link: "",
                      type: "primary",
                      loading: draftingId.value === row.id,
                      onClick: ($event) => onGenerateDraft(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[26] || (_cache[26] = [
                        vue.createTextVNode("生成草稿", -1)
                      ])]),
                      _: 1
                    }, 8, ["loading", "onClick"])), [
                      [_directive_permission, "receipt:confirm"]
                    ]) : vue.createCommentVNode("", true),
                    row.drafted ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 3 }, [
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "primary",
                        loading: draftingId.value === row.id,
                        onClick: ($event) => onGenerateDraft(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[27] || (_cache[27] = [
                          vue.createTextVNode("重新生成", -1)
                        ])]),
                        _: 1
                      }, 8, ["loading", "onClick"])), [
                        [_directive_permission, "receipt:confirm"]
                      ]),
                      row.draft ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        key: 0,
                        link: "",
                        type: "primary",
                        onClick: ($event) => openEditDraft(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[28] || (_cache[28] = [
                          vue.createTextVNode("修改草稿", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "receipt:confirm"]
                      ]) : vue.createCommentVNode("", true),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "success",
                        onClick: ($event) => onConfirm(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[29] || (_cache[29] = [
                          vue.createTextVNode("确认入账", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "receipt:confirm"]
                      ]),
                      vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                        link: "",
                        type: "danger",
                        onClick: ($event) => onReject(row)
                      }, {
                        default: vue.withCtx(() => [..._cache[30] || (_cache[30] = [
                          vue.createTextVNode("驳回", -1)
                        ])]),
                        _: 1
                      }, 8, ["onClick"])), [
                        [_directive_permission, "receipt:confirm"]
                      ])
                    ], 64)) : vue.createCommentVNode("", true),
                    row.status === "parsed" || row.status === "drafted" ? vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      key: 4,
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[31] || (_cache[31] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "receipt:delete"]
                    ]) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["data"])), [
              [_directive_loading, vue.unref(loading)]
            ]),
            vue.createElementVNode("div", _hoisted_32, [
              vue.createVNode(_component_el_pagination, {
                "current-page": vue.unref(query).page,
                "onUpdate:currentPage": _cache[0] || (_cache[0] = ($event) => vue.unref(query).page = $event),
                "page-size": vue.unref(query).pageSize,
                "onUpdate:pageSize": _cache[1] || (_cache[1] = ($event) => vue.unref(query).pageSize = $event),
                "page-sizes": [10, 20, 50],
                total: vue.unref(total),
                layout: "total, sizes, prev, pager, next",
                onCurrentChange: vue.unref(load),
                onSizeChange: vue.unref(handleSize)
              }, null, 8, ["current-page", "page-size", "total", "onCurrentChange", "onSizeChange"])
            ])
          ]),
          vue.createVNode(_component_el_dialog, {
            modelValue: editVisible.value,
            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => editVisible.value = $event),
            title: "修改凭证草稿",
            width: "860px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[3] || (_cache[3] = ($event) => editVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[33] || (_cache[33] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                disabled: !balanceOk.value,
                loading: savingDraft.value,
                onClick: onSaveDraft
              }, {
                default: vue.withCtx(() => [..._cache[34] || (_cache[34] = [
                  vue.createTextVNode("保存草稿", -1)
                ])]),
                _: 1
              }, 8, ["disabled", "loading"])
            ]),
            default: vue.withCtx(() => [
              editing.value ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 0 }, [
                vue.createVNode(_component_el_descriptions, {
                  column: 3,
                  border: "",
                  size: "small",
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_descriptions_item, { label: "票据" }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(editing.value.fileName), 1)
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "日期" }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_date_picker, {
                          modelValue: draftForm.voucherDate,
                          "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => draftForm.voucherDate = $event),
                          type: "date",
                          "value-format": "YYYY-MM-DD",
                          style: { "width": "150px" }
                        }, null, 8, ["modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_descriptions_item, { label: "凭证字号" }, {
                      default: vue.withCtx(() => [..._cache[32] || (_cache[32] = [
                        vue.createTextVNode("记", -1)
                      ])]),
                      _: 1
                    })
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table, {
                  data: draftForm.entries,
                  size: "small",
                  class: "mb12"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_table_column, {
                      label: "摘要",
                      "min-width": "160"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input, {
                          modelValue: row.summary,
                          "onUpdate:modelValue": ($event) => row.summary = $event,
                          size: "small",
                          maxlength: "200"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "会计科目",
                      "min-width": "230"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_select, {
                          modelValue: row.accountId,
                          "onUpdate:modelValue": ($event) => row.accountId = $event,
                          filterable: "",
                          size: "small",
                          style: { "width": "100%" }
                        }, {
                          default: vue.withCtx(() => [
                            (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptions.value, (acc) => {
                              return vue.openBlock(), vue.createBlock(_component_el_option, {
                                key: acc.id,
                                label: `${acc.code} ${acc.fullName}`,
                                value: acc.id
                              }, null, 8, ["label", "value"]);
                            }), 128))
                          ]),
                          _: 1
                        }, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    vue.createVNode(_component_el_table_column, {
                      label: "借方金额",
                      width: "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.debit,
                          "onUpdate:modelValue": ($event) => row.debit = $event,
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
                      label: "贷方金额",
                      width: "150"
                    }, {
                      default: vue.withCtx(({ row }) => [
                        vue.createVNode(_component_el_input_number, {
                          modelValue: row.credit,
                          "onUpdate:modelValue": ($event) => row.credit = $event,
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
                      label: "删除",
                      width: "60",
                      align: "center"
                    }, {
                      default: vue.withCtx(({ $index }) => [
                        vue.createVNode(_component_el_button, {
                          link: "",
                          type: "danger",
                          disabled: draftForm.entries.length <= 2,
                          onClick: ($event) => removeEntry($index)
                        }, {
                          default: vue.withCtx(() => [
                            vue.createVNode(_component_el_icon, null, {
                              default: vue.withCtx(() => [
                                vue.createVNode(vue.unref(iconsVue.Delete))
                              ]),
                              _: 1
                            })
                          ]),
                          _: 1
                        }, 8, ["disabled", "onClick"])
                      ]),
                      _: 1
                    })
                  ]),
                  _: 1
                }, 8, ["data"]),
                vue.createElementVNode("div", {
                  class: vue.normalizeClass(["balance-bar", { "balance-bar--ok": balanceOk.value }])
                }, [
                  vue.createTextVNode(" 借方合计 " + vue.toDisplayString(vue.unref(formatAmount)(debitTotal.value)) + "　贷方合计 " + vue.toDisplayString(vue.unref(formatAmount)(creditTotal.value)) + " ", 1),
                  vue.createVNode(_component_el_tag, {
                    type: balanceOk.value ? "success" : "danger",
                    size: "small"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createTextVNode(vue.toDisplayString(balanceOk.value ? "借贷平衡" : "借贷不平"), 1)
                    ]),
                    _: 1
                  }, 8, ["type"])
                ], 2)
              ], 64)) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: rejectVisible.value,
            "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => rejectVisible.value = $event),
            title: "驳回票据",
            width: "460px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[6] || (_cache[6] = ($event) => rejectVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[35] || (_cache[35] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "danger",
                loading: rejecting.value,
                onClick: onRejectConfirm
              }, {
                default: vue.withCtx(() => [..._cache[36] || (_cache[36] = [
                  vue.createTextVNode("确认驳回", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_form, { "label-position": "top" }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "驳回原因（可选）" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: rejectReason.value,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => rejectReason.value = $event),
                        type: "textarea",
                        rows: 3,
                        maxlength: "200",
                        "show-word-limit": "",
                        placeholder: "例如：发票不清晰 / 非本公司票据 / 需要人工补录"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: correctVisible.value,
            "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => correctVisible.value = $event),
            title: "修正识别结果",
            width: "460px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[10] || (_cache[10] = ($event) => correctVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[38] || (_cache[38] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: correcting.value,
                onClick: onCorrectSave
              }, {
                default: vue.withCtx(() => [..._cache[39] || (_cache[39] = [
                  vue.createTextVNode("保存修正", -1)
                ])]),
                _: 1
              }, 8, ["loading"])
            ]),
            default: vue.withCtx(() => [
              vue.createVNode(_component_el_form, { "label-position": "top" }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, { label: "票据类型" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: correctForm.receiptType,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => correctForm.receiptType = $event),
                        style: { "width": "100%" },
                        onChange: onCorrectTypeChange
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(TYPE_OPTIONS, (t) => {
                            return vue.createVNode(_component_el_option, {
                              key: t.type,
                              label: t.typeName,
                              value: t.type
                            }, null, 8, ["label", "value"]);
                          }), 64))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "进项 / 销项方向（增值税发票适用）" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: correctForm.direction,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => correctForm.direction = $event),
                        style: { "width": "100%" },
                        clearable: "",
                        placeholder: "跟随识别（默认）"
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_option, {
                            label: "进项（本公司为购买方）",
                            value: "input"
                          }),
                          vue.createVNode(_component_el_option, {
                            label: "销项（本公司为销售方）",
                            value: "output"
                          })
                        ]),
                        _: 1
                      }, 8, ["modelValue"]),
                      _cache[37] || (_cache[37] = vue.createElementVNode("div", {
                        class: "text-muted",
                        style: { "font-size": "12px", "line-height": "1.6" }
                      }, " 方向判定错误（进项/销项颠倒或无法判定）时可在此人工指定，保存后重新参与自动记账。 ", -1))
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
            ]),
            _: 1
          }, 8, ["modelValue"]),
          vue.createVNode(_component_el_dialog, {
            modelValue: imageVisible.value,
            "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => imageVisible.value = $event),
            title: imageName.value,
            width: "720px",
            "destroy-on-close": ""
          }, {
            default: vue.withCtx(() => [
              isPdf.value && imageUrl.value ? (vue.openBlock(), vue.createElementBlock("iframe", {
                key: 0,
                src: imageUrl.value,
                style: { "width": "100%", "height": "70vh", "border": "none" }
              }, null, 8, _hoisted_33)) : imageUrl.value ? (vue.openBlock(), vue.createBlock(_component_el_image, {
                key: 1,
                src: imageUrl.value,
                fit: "contain",
                style: { "width": "100%", "max-height": "70vh" },
                "preview-src-list": [imageUrl.value]
              }, null, 8, ["src", "preview-src-list"])) : vue.createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["modelValue", "title"])
        ]);
      };
    }
  });
  const ReceiptWorkbenchPage = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-55d8225a"]]);
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-card" };
  const _hoisted_3 = { class: "page-toolbar" };
  const _hoisted_4 = { class: "text-muted" };
  const _hoisted_5 = { class: "page-pagination" };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "rules",
    setup(__props) {
      const { list, total, loading, query, load, search, handleSize, reset: onReset } = usePagedList({
        fetcher: (params) => classifyRuleApi.list(params),
        defaultParams: { page: 1, pageSize: 20 }
      });
      const accountOptions = vue.ref([]);
      const accountNameMap = vue.ref({});
      function accountName(code) {
        return accountNameMap.value[code] ?? "";
      }
      async function loadAccounts() {
        try {
          accountOptions.value = await accountApi.options();
          accountNameMap.value = Object.fromEntries(accountOptions.value.map((a) => [a.code, a.name ?? ""]));
        } catch {
          accountOptions.value = [];
        }
      }
      const dialogVisible = vue.ref(false);
      const isEdit = vue.ref(false);
      const saving = vue.ref(false);
      const formRef = vue.ref();
      const empty = () => ({
        ruleName: "",
        matchType: "keyword",
        matchValue: "",
        kind: "expense",
        targetAccountCode: "",
        priority: 0,
        enabled: 1
      });
      const form = vue.reactive(empty());
      const editId = vue.ref("");
      const rules = {
        ruleName: [{ required: true, message: "请填写规则名称", trigger: "blur" }],
        matchType: [{ required: true, message: "请选择匹配方式", trigger: "change" }],
        matchValue: [{ required: true, message: "请填写匹配值", trigger: "blur" }],
        kind: [{ required: true, message: "请选择凭证模板", trigger: "change" }],
        targetAccountCode: [{ required: true, message: "请选择目标科目", trigger: "change" }]
      };
      function openCreate() {
        isEdit.value = false;
        editId.value = "";
        Object.assign(form, empty());
        dialogVisible.value = true;
      }
      function openEdit(row) {
        isEdit.value = true;
        editId.value = row.id;
        Object.assign(form, {
          ruleName: row.ruleName,
          matchType: row.matchType,
          matchValue: row.matchValue,
          kind: row.kind,
          targetAccountCode: row.targetAccountCode,
          priority: row.priority,
          enabled: row.enabled
        });
        dialogVisible.value = true;
      }
      async function onSave() {
        await formRef.value?.validate();
        saving.value = true;
        try {
          const payload = { ...form };
          if (isEdit.value) {
            await classifyRuleApi.update(editId.value, payload);
            ok("规则已更新");
          } else {
            await classifyRuleApi.create(payload);
            ok("规则已创建");
          }
          dialogVisible.value = false;
          await load();
        } finally {
          saving.value = false;
        }
      }
      async function onToggle(row) {
        try {
          await classifyRuleApi.toggle(row.id, row.enabled);
          ok(row.enabled === 1 ? "规则已启用" : "规则已停用");
        } catch {
          row.enabled = row.enabled === 1 ? 0 : 1;
        }
      }
      async function onRemove(row) {
        if (!await confirmDelete(`归类规则「${row.ruleName}」`)) return;
        await classifyRuleApi.remove(row.id);
        ok("规则已删除");
        await load();
      }
      vue.onMounted(loadAccounts);
      return (_ctx, _cache) => {
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_pagination = vue.resolveComponent("el-pagination");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_radio = vue.resolveComponent("el-radio");
        const _component_el_radio_group = vue.resolveComponent("el-radio-group");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_form = vue.resolveComponent("el-form");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        const _directive_permission = vue.resolveDirective("permission");
        const _directive_loading = vue.resolveDirective("loading");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createElementVNode("div", _hoisted_2, [
            vue.createElementVNode("div", _hoisted_3, [
              vue.createVNode(_component_el_select, {
                modelValue: vue.unref(query).matchType,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => vue.unref(query).matchType = $event),
                placeholder: "匹配方式",
                clearable: "",
                style: { "width": "130px" },
                onChange: vue.unref(search)
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_option, {
                    label: "关键词",
                    value: "keyword"
                  }),
                  vue.createVNode(_component_el_option, {
                    label: "交易对手",
                    value: "partner"
                  })
                ]),
                _: 1
              }, 8, ["modelValue", "onChange"]),
              vue.createVNode(_component_el_input, {
                modelValue: vue.unref(query).keyword,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => vue.unref(query).keyword = $event),
                placeholder: "规则名称 / 匹配值 / 科目",
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
                  _cache[12] || (_cache[12] = vue.createTextVNode("查询", -1))
                ]),
                _: 1
              }, 8, ["onClick"]),
              vue.createVNode(_component_el_button, { onClick: vue.unref(onReset) }, {
                default: vue.withCtx(() => [..._cache[13] || (_cache[13] = [
                  vue.createTextVNode("重置", -1)
                ])]),
                _: 1
              }, 8, ["onClick"]),
              _cache[15] || (_cache[15] = vue.createElementVNode("div", { class: "page-toolbar__spacer" }, null, -1)),
              vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                type: "primary",
                onClick: openCreate
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_icon, null, {
                    default: vue.withCtx(() => [
                      vue.createVNode(vue.unref(iconsVue.Plus))
                    ]),
                    _: 1
                  }),
                  _cache[14] || (_cache[14] = vue.createTextVNode("新增规则 ", -1))
                ]),
                _: 1
              })), [
                [_directive_permission, "receipt:rule"]
              ])
            ]),
            vue.createVNode(_component_el_alert, {
              type: "info",
              closable: false,
              "show-icon": "",
              class: "mb12",
              title: "关键词规则匹配票据全文；交易对手规则匹配销售方/购买方名称。按优先级从高到低取第一条兼容规则，确认入账时若改过科目会自动回写新规则。"
            }),
            vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_table, {
              data: vue.unref(list),
              "empty-text": "暂无归类规则"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_table_column, {
                  prop: "ruleName",
                  label: "规则名称",
                  "min-width": "180",
                  "show-overflow-tooltip": ""
                }, {
                  default: vue.withCtx(({ row }) => [
                    row.learned ? (vue.openBlock(), vue.createBlock(_component_el_tag, {
                      key: 0,
                      size: "small",
                      type: "warning",
                      class: "mr4"
                    }, {
                      default: vue.withCtx(() => [..._cache[16] || (_cache[16] = [
                        vue.createTextVNode("自动学习", -1)
                      ])]),
                      _: 1
                    })) : vue.createCommentVNode("", true),
                    vue.createTextVNode(vue.toDisplayString(row.ruleName), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "匹配方式",
                  width: "110"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      size: "small",
                      type: row.matchType === "keyword" ? "primary" : "success"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.matchType === "keyword" ? "关键词" : "交易对手"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "matchValue",
                  label: "匹配值",
                  "min-width": "180",
                  "show-overflow-tooltip": ""
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "模板",
                  width: "90"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_tag, {
                      size: "small",
                      type: row.kind === "income" ? "success" : "warning"
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(row.kind === "income" ? "收入" : "费用"), 1)
                      ]),
                      _: 2
                    }, 1032, ["type"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "目标科目",
                  width: "160"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createElementVNode("span", null, vue.toDisplayString(row.targetAccountCode), 1),
                    vue.createElementVNode("span", _hoisted_4, vue.toDisplayString(accountName(row.targetAccountCode)), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "priority",
                  label: "优先级",
                  width: "80",
                  align: "center"
                }),
                vue.createVNode(_component_el_table_column, {
                  prop: "hitCount",
                  label: "命中次数",
                  width: "90",
                  align: "center",
                  sortable: ""
                }),
                vue.createVNode(_component_el_table_column, {
                  label: "启用",
                  width: "80",
                  align: "center"
                }, {
                  default: vue.withCtx(({ row }) => [
                    vue.createVNode(_component_el_switch, {
                      modelValue: row.enabled,
                      "onUpdate:modelValue": ($event) => row.enabled = $event,
                      "active-value": 1,
                      "inactive-value": 0,
                      onChange: ($event) => onToggle(row)
                    }, null, 8, ["modelValue", "onUpdate:modelValue", "onChange"])
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
                      onClick: ($event) => openEdit(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[17] || (_cache[17] = [
                        vue.createTextVNode("编辑", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "receipt:rule"]
                    ]),
                    vue.withDirectives((vue.openBlock(), vue.createBlock(_component_el_button, {
                      link: "",
                      type: "danger",
                      onClick: ($event) => onRemove(row)
                    }, {
                      default: vue.withCtx(() => [..._cache[18] || (_cache[18] = [
                        vue.createTextVNode("删除", -1)
                      ])]),
                      _: 1
                    }, 8, ["onClick"])), [
                      [_directive_permission, "receipt:rule"]
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
            "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => dialogVisible.value = $event),
            title: isEdit.value ? "编辑归类规则" : "新增归类规则",
            width: "560px",
            "destroy-on-close": ""
          }, {
            footer: vue.withCtx(() => [
              vue.createVNode(_component_el_button, {
                onClick: _cache[10] || (_cache[10] = ($event) => dialogVisible.value = false)
              }, {
                default: vue.withCtx(() => [..._cache[24] || (_cache[24] = [
                  vue.createTextVNode("取消", -1)
                ])]),
                _: 1
              }),
              vue.createVNode(_component_el_button, {
                type: "primary",
                loading: saving.value,
                onClick: onSave
              }, {
                default: vue.withCtx(() => [..._cache[25] || (_cache[25] = [
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
                "label-width": "90px"
              }, {
                default: vue.withCtx(() => [
                  vue.createVNode(_component_el_form_item, {
                    label: "规则名称",
                    prop: "ruleName"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.ruleName,
                        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.ruleName = $event),
                        maxlength: "100",
                        placeholder: "例如：快递费、XX商贸有限公司"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "匹配方式",
                    prop: "matchType"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_radio_group, {
                        modelValue: form.matchType,
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.matchType = $event)
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_radio, { value: "keyword" }, {
                            default: vue.withCtx(() => [..._cache[19] || (_cache[19] = [
                              vue.createTextVNode("关键词（匹配全文）", -1)
                            ])]),
                            _: 1
                          }),
                          vue.createVNode(_component_el_radio, { value: "partner" }, {
                            default: vue.withCtx(() => [..._cache[20] || (_cache[20] = [
                              vue.createTextVNode("交易对手名称", -1)
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
                    label: "匹配值",
                    prop: "matchValue"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input, {
                        modelValue: form.matchValue,
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.matchValue = $event),
                        maxlength: "300",
                        placeholder: "关键词支持逗号分隔多个，如：快递,顺丰,物流"
                      }, null, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, {
                    label: "凭证模板",
                    prop: "kind"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_radio_group, {
                        modelValue: form.kind,
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.kind = $event)
                      }, {
                        default: vue.withCtx(() => [
                          vue.createVNode(_component_el_radio, { value: "expense" }, {
                            default: vue.withCtx(() => [..._cache[21] || (_cache[21] = [
                              vue.createTextVNode("费用（进项/费用票据）", -1)
                            ])]),
                            _: 1
                          }),
                          vue.createVNode(_component_el_radio, { value: "income" }, {
                            default: vue.withCtx(() => [..._cache[22] || (_cache[22] = [
                              vue.createTextVNode("收入（销项发票）", -1)
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
                    label: "目标科目",
                    prop: "targetAccountCode"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_select, {
                        modelValue: form.targetAccountCode,
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.targetAccountCode = $event),
                        filterable: "",
                        style: { "width": "100%" },
                        placeholder: "选择明细科目（叶子科目）"
                      }, {
                        default: vue.withCtx(() => [
                          (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(accountOptions.value, (acc) => {
                            return vue.openBlock(), vue.createBlock(_component_el_option, {
                              key: acc.code,
                              label: `${acc.code} ${acc.fullName}`,
                              value: acc.code
                            }, null, 8, ["label", "value"]);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    _: 1
                  }),
                  vue.createVNode(_component_el_form_item, { label: "优先级" }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_input_number, {
                        modelValue: form.priority,
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.priority = $event),
                        min: 0,
                        max: 999
                      }, null, 8, ["modelValue"]),
                      _cache[23] || (_cache[23] = vue.createElementVNode("span", { class: "text-muted form-tip" }, "数字越大越优先命中", -1))
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
  const ReceiptRulesPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-1bfdfd4a"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("receipts", {
    components: {
      ReceiptListPage,
      ReceiptWorkbenchPage,
      ReceiptRulesPage
    }
  });
})(Vue, VueRouter, ElementPlus, ElementPlusIconsVue, axios);
