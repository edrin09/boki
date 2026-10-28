(function(vue, iconsVue, elementPlus, axios2) {
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
  async function download(url, params, filename) {
    const res = await service.get(url, { params, responseType: "blob" });
    const blob = new Blob([res.data]);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename ?? "download";
    link.click();
    URL.revokeObjectURL(link.href);
  }
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
  function ok(message = "操作成功") {
    elementPlus.ElMessage.success(message);
  }
  const _hoisted_1 = { class: "page" };
  const _hoisted_2 = { class: "page-card page-card--narrow" };
  const _hoisted_3 = { class: "form-hint" };
  const _hoisted_4 = {
    key: 0,
    class: "text-muted"
  };
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "index",
    setup(__props) {
      const formRef = vue.ref();
      const saving = vue.ref(false);
      const testing = vue.ref(false);
      const providers = vue.ref([]);
      const apiKeyMasked = vue.ref(null);
      const form = vue.reactive({
        provider: "custom",
        baseURL: "",
        apiKey: "",
        model: "",
        enabled: false,
        temperature: 0.2,
        timeoutMs: 15e3
      });
      const preset = vue.computed(() => providers.value.find((p) => p.id === form.provider));
      const providerName = vue.computed(() => preset.value?.name ?? form.provider);
      const ready = vue.computed(() => form.enabled && !!form.baseURL && !!form.model);
      const hasKey = vue.computed(() => Boolean(apiKeyMasked.value));
      function onProviderChange() {
        const p = preset.value;
        if (!p || p.id === "custom") return;
        form.baseURL = p.baseURL;
        form.model = p.model;
      }
      async function load() {
        try {
          const data = await systemApi.aiConfig();
          providers.value = data?.providers ?? [];
          form.provider = data?.provider ?? "custom";
          form.baseURL = data?.baseURL ?? "";
          form.model = data?.model ?? "";
          form.enabled = Boolean(data?.enabled);
          form.temperature = data?.temperature ?? 0.2;
          form.timeoutMs = data?.timeoutMs ?? 15e3;
          apiKeyMasked.value = data?.apiKeyMasked ?? null;
        } catch {
        }
      }
      async function onSave() {
        await formRef.value?.validate();
        saving.value = true;
        try {
          await systemApi.saveAiConfig({
            provider: form.provider,
            baseURL: form.baseURL,
            model: form.model,
            enabled: form.enabled,
            temperature: form.temperature,
            timeoutMs: form.timeoutMs,
            ...form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}
          });
          form.apiKey = "";
          await load();
          ok("AI模型设置已保存");
        } finally {
          saving.value = false;
        }
      }
      async function onTest() {
        if (!form.baseURL || !form.model) {
          elementPlus.ElMessage.warning("请先填写接口地址和模型名称");
          return;
        }
        testing.value = true;
        try {
          await onSave();
          const result = await systemApi.testAi();
          elementPlus.ElMessage.success(`连接成功：${result.model}，耗时 ${result.latencyMs}ms`);
        } catch {
        } finally {
          testing.value = false;
        }
      }
      vue.onMounted(load);
      return (_ctx, _cache) => {
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_switch = vue.resolveComponent("el-switch");
        const _component_el_form_item = vue.resolveComponent("el-form-item");
        const _component_el_option = vue.resolveComponent("el-option");
        const _component_el_select = vue.resolveComponent("el-select");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_divider = vue.resolveComponent("el-divider");
        const _component_el_slider = vue.resolveComponent("el-slider");
        const _component_el_input_number = vue.resolveComponent("el-input-number");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_form = vue.resolveComponent("el-form");
        return vue.openBlock(), vue.createElementBlock("div", _hoisted_1, [
          vue.createElementVNode("div", _hoisted_2, [
            _cache[14] || (_cache[14] = vue.createElementVNode("div", { class: "page-title" }, "AI模型设置", -1)),
            vue.createVNode(_component_el_alert, {
              type: "info",
              closable: false,
              "show-icon": "",
              class: "mb12",
              title: "接入任意 OpenAI 兼容大模型接口后，语音助手与人工智能能力自动增强：自由说法的指令由模型理解，未接入或模型不可用时自动回退现有规则引擎，功能不受影响。"
            }),
            vue.createVNode(_component_el_alert, {
              type: ready.value ? "success" : "warning",
              closable: false,
              "show-icon": "",
              class: "mb12",
              title: ready.value ? `已接入：${providerName.value} · ${form.model}。说话更自由，回复更自然。` : "未接入大模型，语音助手按关键词匹配工作（现状）。可获取/自部署模型后在此开启。"
            }, null, 8, ["type", "title"]),
            vue.createVNode(_component_el_form, {
              ref_key: "formRef",
              ref: formRef,
              model: form,
              "label-width": "110px"
            }, {
              default: vue.withCtx(() => [
                vue.createVNode(_component_el_form_item, { label: "启用AI增强" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_switch, {
                      modelValue: form.enabled,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.enabled = $event)
                    }, null, 8, ["modelValue"]),
                    vue.createElementVNode("span", _hoisted_3, vue.toDisplayString(form.enabled ? "已开启：接入后自动启用" : "已关闭：保持现状"), 1)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "厂商" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_select, {
                      modelValue: form.provider,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.provider = $event),
                      placeholder: "选择厂商或自部署方式",
                      style: { "width": "100%" },
                      onChange: onProviderChange
                    }, {
                      default: vue.withCtx(() => [
                        (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(providers.value, (p) => {
                          return vue.openBlock(), vue.createBlock(_component_el_option, {
                            key: p.id,
                            value: p.id,
                            label: `${p.name}${p.local ? "（本地）" : ""}`
                          }, null, 8, ["value", "label"]);
                        }), 128))
                      ]),
                      _: 1
                    }, 8, ["modelValue"]),
                    preset.value?.remark ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_4, vue.toDisplayString(preset.value.remark), 1)) : vue.createCommentVNode("", true)
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, {
                  label: "接口地址",
                  prop: "baseURL"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_input, {
                      modelValue: form.baseURL,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.baseURL = $event),
                      placeholder: "OpenAI 兼容 Base URL，如 https://api.deepseek.com/v1"
                    }, null, 8, ["modelValue"]),
                    _cache[7] || (_cache[7] = vue.createElementVNode("div", { class: "text-muted" }, "系统会向该地址下的 /chat/completions 发起请求，结尾不需要带斜杠", -1))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "API Key" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_input, {
                      modelValue: form.apiKey,
                      "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.apiKey = $event),
                      type: "password",
                      "show-password": "",
                      autocomplete: "new-password",
                      placeholder: hasKey.value ? `已保存（${apiKeyMasked.value}），留空保持不变` : preset.value?.keyRequired ? "必填" : "本地部署可留空"
                    }, null, 8, ["modelValue", "placeholder"]),
                    _cache[8] || (_cache[8] = vue.createElementVNode("div", { class: "text-muted" }, "Key 只保存在本机数据库，不上传任何第三方（除你填写的厂商）", -1))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, {
                  label: "模型名称",
                  prop: "model"
                }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_input, {
                      modelValue: form.model,
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.model = $event),
                      placeholder: "如 qwen-plus / deepseek-chat / qwen2.5:1.5b-instruct"
                    }, null, 8, ["modelValue"])
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_divider, { "content-position": "left" }, {
                  default: vue.withCtx(() => [..._cache[9] || (_cache[9] = [
                    vue.createTextVNode("高级", -1)
                  ])]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "生成温度" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_slider, {
                      modelValue: form.temperature,
                      "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.temperature = $event),
                      min: 0,
                      max: 1,
                      step: 0.05,
                      "show-input": "",
                      style: { "max-width": "420px" }
                    }, null, 8, ["modelValue"]),
                    _cache[10] || (_cache[10] = vue.createElementVNode("div", { class: "text-muted" }, "财务场景建议低温（0~0.3），回答更稳定", -1))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, { label: "请求超时" }, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_input_number, {
                      modelValue: form.timeoutMs,
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.timeoutMs = $event),
                      min: 3e3,
                      max: 6e4,
                      step: 1e3,
                      style: { "width": "200px" }
                    }, null, 8, ["modelValue"]),
                    _cache[11] || (_cache[11] = vue.createElementVNode("span", { class: "unit" }, "ms", -1))
                  ]),
                  _: 1
                }),
                vue.createVNode(_component_el_form_item, null, {
                  default: vue.withCtx(() => [
                    vue.createVNode(_component_el_button, {
                      loading: testing.value,
                      onClick: onTest
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_icon, null, {
                          default: vue.withCtx(() => [
                            vue.createVNode(vue.unref(iconsVue.Connection))
                          ]),
                          _: 1
                        }),
                        _cache[12] || (_cache[12] = vue.createTextVNode("测试连接 ", -1))
                      ]),
                      _: 1
                    }, 8, ["loading"]),
                    vue.createVNode(_component_el_button, {
                      type: "primary",
                      loading: saving.value,
                      onClick: onSave
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_icon, null, {
                          default: vue.withCtx(() => [
                            vue.createVNode(vue.unref(iconsVue.Check))
                          ]),
                          _: 1
                        }),
                        _cache[13] || (_cache[13] = vue.createTextVNode("保存 ", -1))
                      ]),
                      _: 1
                    }, 8, ["loading"])
                  ]),
                  _: 1
                })
              ]),
              _: 1
            }, 8, ["model"])
          ])
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
  const SystemAiPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0eaa9f5a"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("ai", {
    components: {
      SystemAiPage
    }
  });
})(Vue, ElementPlusIconsVue, ElementPlus, axios);
