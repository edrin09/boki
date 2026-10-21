(function(vue, elementPlus, iconsVue, axios2, dayjs2, pinia) {
  "use strict";
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
  async function download(url, params, filename) {
    const res = await service.get(url, { params, responseType: "blob" });
    const blob = new Blob([res.data]);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename ?? "download";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  const TARGET_RATE = 16e3;
  const FINAL_TIMEOUT_MS = 3e3;
  async function startStreamingVoice(opts) {
    const token = getToken();
    if (!token) throw new Error("未登录，无法使用语音识别");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${location.host}/api/voice/stream?token=${encodeURIComponent(token)}`
    );
    const chunks = [];
    const startedAt = Date.now();
    let statusTimer;
    let wsReady = false;
    let stoppedSent = false;
    let cleanedUp = false;
    let finalResolve = () => {
    };
    const finalPromise = new Promise((resolve) => {
      finalResolve = resolve;
    });
    ws.onopen = () => {
      wsReady = true;
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let msg = {};
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "ready") {
        wsReady = true;
      } else if (msg.type === "partial") {
        const text = (msg.text ?? "").trim();
        if (text) opts.onPartial?.(text);
      } else if (msg.type === "final") {
        finalResolve(msg.text ?? "");
      } else if (msg.type === "error") {
        opts.onError?.(msg.message || "流式识别不可用");
        wsReady = false;
      }
    };
    ws.onerror = () => {
      if (!cleanedUp) opts.onError?.("流式识别连接失败，松开后将整段识别");
      wsReady = false;
    };
    ws.onclose = () => {
      wsReady = false;
      finalResolve("");
    };
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    const ctx = new AudioContext({ sampleRate: TARGET_RATE });
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {
      });
    }
    const source = ctx.createMediaStreamSource(micStream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (cleanedUp) return;
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      if (ws.readyState === WebSocket.OPEN && wsReady) {
        ws.send(floatToInt16(input).buffer);
      }
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.clearInterval(statusTimer);
      try {
        processor.disconnect();
        source.disconnect();
      } catch {
      }
      micStream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    };
    const closeWs = () => {
      try {
        ws.close(1e3);
      } catch {
      }
    };
    const buildWav = () => {
      const merged = mergeSamples(chunks);
      if (!merged.length) return new Blob([], { type: "audio/wav" });
      return new Blob([encodeWav(merged, TARGET_RATE)], { type: "audio/wav" });
    };
    let normalPromise = null;
    const maxTimer = window.setTimeout(() => {
      void session?.stop();
    }, opts.maxMs ?? 15e3);
    const stopNormal = () => {
      normalPromise ?? (normalPromise = (async () => {
        window.clearTimeout(maxTimer);
        cleanup();
        let text = "";
        if (ws.readyState === WebSocket.OPEN && wsReady && !stoppedSent) {
          stoppedSent = true;
          try {
            ws.send(JSON.stringify({ event: "stop" }));
            text = await Promise.race([
              finalPromise.then((t) => (t ?? "").trim()),
              new Promise((r) => window.setTimeout(() => r(""), FINAL_TIMEOUT_MS))
            ]);
          } catch {
          }
        }
        closeWs();
        return { text: text.trim(), wav: buildWav() };
      })());
      return normalPromise;
    };
    const session = {
      stop: (force = false) => {
        if (force) {
          window.clearTimeout(maxTimer);
          cleanup();
          finalResolve("");
          closeWs();
          return Promise.resolve({ text: "", wav: buildWav() });
        }
        return stopNormal();
      }
    };
    if (opts.onStatus) {
      statusTimer = window.setInterval(() => {
        if (!cleanedUp) opts.onStatus?.({ ms: Date.now() - startedAt });
      }, 200);
    }
    return session;
  }
  function mergeSamples(chunks) {
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
  function floatToInt16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out;
  }
  function encodeWav(samples, sampleRate) {
    const pcm = floatToInt16(samples);
    const buffer = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(buffer);
    const writeStr = (offset, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    new Int16Array(buffer, 44).set(pcm);
    return buffer;
  }
  let cached;
  function findZhVoice() {
    if (cached !== void 0) return cached;
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    cached = voices.find((v) => /zh[-_]CN/i.test(v.lang) && !/Chinese\(Traditional\)|Taiwan|HK/i.test(v.lang)) ?? voices.find((v) => /zh/i.test(v.lang)) ?? null;
    return cached;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        cached = void 0;
        findZhVoice();
      };
    } catch {
    }
  }
  function speak(text) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    try {
      const synth = window.speechSynthesis;
      const content = (text ?? "").trim();
      if (!content) return false;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = "zh-CN";
      const voice = findZhVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 1.05;
      synth.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }
  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
      }
    }
  }
  const voiceApi = {
    status: () => get(
      "/voice/status"
    ),
    queryText: (text) => {
      const form = new FormData();
      form.append("text", text);
      return post("/voice/query", form, { timeout: 3e5 });
    },
    /** 只转写文字，不执行查询（WS 终稿为空时的 REST 兜底） */
    transcribe: (blob, filename = "recording.wav") => {
      const form = new FormData();
      form.append("audio", blob, filename);
      return post("/voice/transcribe", form, { timeout: 12e4 });
    },
    downloadExport: (exportId, filename) => download(`/voice/export/${exportId}`, void 0, filename)
  };
  function formatAmount(value) {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
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
  const _hoisted_1 = ["disabled"];
  const _hoisted_2 = {
    key: 0,
    class: "voice-fab__icon"
  };
  const _hoisted_3 = {
    key: 1,
    class: "voice-fab__wave"
  };
  const _hoisted_4 = {
    key: 0,
    class: "voice-fab__tip"
  };
  const _hoisted_5 = { class: "voice-dialog" };
  const _hoisted_6 = { class: "voice-dialog__bubble" };
  const _hoisted_7 = { class: "voice-dialog__who" };
  const _hoisted_8 = { class: "voice-dialog__msgtext" };
  const _hoisted_9 = {
    key: 1,
    class: "voice-dialog__dots"
  };
  const _hoisted_10 = { class: "voice-dialog__actions" };
  const _hoisted_11 = { class: "voice-dialog__text" };
  const _hoisted_12 = { class: "voice-dialog__cmds" };
  const TYPE_INTERVAL = 40;
  const TYPE_STEP = 2;
  const STAGE_PAUSE = 500;
  const _sfc_main = /* @__PURE__ */ vue.defineComponent({
    __name: "VoiceAssistant",
    setup(__props) {
      const userStore = useUserStore();
      const allowed = vue.computed(() => userStore.hasPermission("voice:use"));
      const SAMPLE_CMDS = [
        "看看这个月的收支",
        "今年盈亏怎么样",
        "谁还欠我钱",
        "我欠供应商多少",
        "员工还有哪笔借款没还",
        "账上还剩多少钱",
        "这个月费用花在哪",
        "这个月记了几笔凭证",
        "导出这个月的凭证",
        "导出上个月的报销单"
      ];
      const THINK_STAGES = [
        "收到，正在理解你的问题…",
        "正在查询账务数据…",
        "正在汇总计算…",
        "正在生成回答，AI 查询一般需要几十秒…"
      ];
      const state = vue.reactive({
        phase: "idle",
        elapsedMs: 0
      });
      const chat = vue.reactive({ items: [] });
      const chatRef = vue.ref(null);
      let streamSession = null;
      const textInputRef = vue.ref(null);
      const dialog = vue.reactive({
        visible: false,
        loading: false,
        title: "语音助手",
        transcript: "",
        replyType: "success",
        card: null,
        exportId: void 0,
        textContent: "",
        /** 回答是否已输出完（打完后才亮出表格与导出按钮） */
        revealed: false
      });
      const recordingHint = vue.computed(() => {
        const seconds = Math.floor(state.elapsedMs / 1e3);
        return `正在录音 ${seconds}s`;
      });
      let typeTimer = null;
      let stageTimer = null;
      function clearTypeTimers() {
        if (typeTimer) {
          clearInterval(typeTimer);
          typeTimer = null;
        }
        if (stageTimer) {
          clearTimeout(stageTimer);
          stageTimer = null;
        }
      }
      function scrollToBottom() {
        void vue.nextTick(() => {
          const el = chatRef.value;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
      function typeText(msg, full, onDone) {
        if (typeTimer) clearInterval(typeTimer);
        let i = 0;
        typeTimer = setInterval(() => {
          i += TYPE_STEP;
          msg.text = full.slice(0, i);
          scrollToBottom();
          if (i >= full.length) {
            if (typeTimer) clearInterval(typeTimer);
            typeTimer = null;
            onDone?.();
          }
        }, TYPE_INTERVAL);
      }
      function startThinking(msg) {
        let stage = 0;
        const next = () => {
          stage++;
          if (stage >= THINK_STAGES.length) return;
          stageTimer = setTimeout(() => typeText(msg, THINK_STAGES[stage], next), STAGE_PAUSE);
        };
        typeText(msg, THINK_STAGES[0], next);
      }
      function onFabClick() {
        openVoiceDialog();
      }
      function openVoiceDialog() {
        stopSpeaking();
        clearTypeTimers();
        state.phase = "idle";
        state.elapsedMs = 0;
        chat.items = [];
        dialog.visible = true;
        dialog.title = "语音助手";
        dialog.transcript = "";
        dialog.replyType = "info";
        dialog.card = null;
        dialog.exportId = void 0;
        dialog.revealed = false;
        dialog.loading = false;
      }
      async function startVoice() {
        stopSpeaking();
        state.phase = "recording";
        state.elapsedMs = 0;
        dialog.visible = true;
        streamSession = await startStreamingVoice({
          onStatus: (s) => {
            state.elapsedMs = s.ms;
          },
          onPartial: (text) => {
            dialog.textContent = text;
          },
          onError: (message) => {
            elementPlus.ElMessage.warning(message);
          }
        });
      }
      async function stopVoice() {
        const s = streamSession;
        streamSession = null;
        if (!s) return;
        const { text, wav } = await s.stop();
        state.phase = "idle";
        const final = text.trim();
        if (final) {
          autoSubmit(final);
          return;
        }
        if (wav.size) {
          try {
            const { text: rest } = await voiceApi.transcribe(wav);
            if (rest.trim()) {
              autoSubmit(rest.trim());
              return;
            }
          } catch {
            elementPlus.ElMessage.error("语音识别失败，请稍后重试，或直接打字查询");
            return;
          }
        }
        elementPlus.ElMessage.info("没有听清内容，可以按住 Alt 重试，或直接打字");
      }
      function autoSubmit(text) {
        dialog.textContent = text;
        void vue.nextTick(() => {
          textInputRef.value?.focus();
          stageTimer = setTimeout(() => {
            onSubmitText();
          }, 400);
        });
      }
      async function submit(run) {
        dialog.loading = true;
        dialog.revealed = false;
        dialog.card = null;
        dialog.exportId = void 0;
        const think = vue.reactive({ role: "assistant", text: "", done: false });
        chat.items.push(think);
        scrollToBottom();
        startThinking(think);
        try {
          const result = await run();
          showResult(result);
          speak(result.reply);
        } catch {
          finishThinking();
          const msg = vue.reactive({ role: "assistant", text: "", done: false });
          chat.items.push(msg);
          dialog.revealed = true;
          typeText(msg, "查询失败，请稍后重试，或换个说法试试", () => {
            msg.done = true;
          });
          elementPlus.ElMessage.error("查询失败，请稍后重试");
        } finally {
          dialog.loading = false;
        }
      }
      function finishThinking() {
        clearTypeTimers();
        const idx = chat.items.findIndex((m) => m.role === "assistant" && !m.done);
        if (idx >= 0) chat.items.splice(idx, 1);
        scrollToBottom();
      }
      function showResult(result) {
        finishThinking();
        dialog.title = result.card?.title ? `${result.card.title} · 语音助手` : "语音助手";
        dialog.transcript = result.transcript ?? "";
        dialog.replyType = result.intentId === "fallback" || /出了点问题/.test(result.reply) ? "warning" : "success";
        dialog.card = result.intentId === "fallback" ? null : result.card ?? null;
        dialog.exportId = result.exportId;
        const msg = vue.reactive({ role: "assistant", text: "", done: false });
        chat.items.push(msg);
        scrollToBottom();
        typeText(msg, result.reply, () => {
          msg.done = true;
          dialog.revealed = true;
        });
      }
      function onAskAgain() {
        openVoiceDialog();
      }
      function onSampleCmd(cmd) {
        dialog.textContent = cmd;
        void onSubmitText();
      }
      function onSubmitText() {
        const text = dialog.textContent.trim();
        if (!text || dialog.loading) return;
        if (stageTimer) {
          clearTimeout(stageTimer);
          stageTimer = null;
        }
        dialog.textContent = "";
        chat.items.push({ role: "user", text, done: true });
        void submit(() => voiceApi.queryText(text));
      }
      function onDownload() {
        if (!dialog.exportId) return;
        voiceApi.downloadExport(dialog.exportId, `${dialog.card?.title ?? "语音查询"}_${Date.now()}.xlsx`);
      }
      function summaryMethod({ columns }) {
        const totals = dialog.card?.totals ?? {};
        return columns.map((col) => {
          const key = col.property;
          if (!key) return "合计";
          const v = totals[key];
          if (typeof v === "number") return formatAmount(v);
          return v == null ? "" : String(v);
        });
      }
      function onDialogClosed() {
        stopSpeaking();
        clearTypeTimers();
        const s = streamSession;
        streamSession = null;
        void s?.stop(true).then(() => {
          state.phase = "idle";
        });
      }
      function onKeyDown(e) {
        if (e.key !== "Alt") return;
        if (e.ctrlKey || e.shiftKey || e.metaKey) return;
        if (!dialog.visible) return;
        e.preventDefault();
        if (e.repeat || state.phase !== "idle") return;
        startVoice().catch(() => {
          state.phase = "idle";
          elementPlus.ElMessage.warning("无法访问麦克风，可以直接在弹窗里打字查询");
        });
      }
      function onKeyUp(e) {
        if (e.key !== "Alt") return;
        if (state.phase !== "recording") return;
        e.preventDefault();
        void stopVoice();
      }
      function onBlur() {
        if (state.phase === "recording") void stopVoice();
      }
      vue.onMounted(() => {
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
      });
      vue.onUnmounted(() => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", onBlur);
        clearTypeTimers();
        void streamSession?.stop(true);
        streamSession = null;
      });
      return (_ctx, _cache) => {
        const _component_el_tooltip = vue.resolveComponent("el-tooltip");
        const _component_el_alert = vue.resolveComponent("el-alert");
        const _component_el_table_column = vue.resolveComponent("el-table-column");
        const _component_el_table = vue.resolveComponent("el-table");
        const _component_el_icon = vue.resolveComponent("el-icon");
        const _component_el_button = vue.resolveComponent("el-button");
        const _component_el_input = vue.resolveComponent("el-input");
        const _component_el_tag = vue.resolveComponent("el-tag");
        const _component_el_dialog = vue.resolveComponent("el-dialog");
        return vue.openBlock(), vue.createElementBlock(vue.Fragment, null, [
          allowed.value ? (vue.openBlock(), vue.createElementBlock("div", {
            key: 0,
            class: vue.normalizeClass(["voice-fab", { "is-recording": state.phase === "recording" }])
          }, [
            vue.createVNode(_component_el_tooltip, {
              content: "语音助手：按住 Alt 说话，松开自动查询，一句话出统计+Excel",
              placement: "left"
            }, {
              default: vue.withCtx(() => [
                vue.createElementVNode("button", {
                  class: "voice-fab__btn",
                  disabled: dialog.loading,
                  onClick: onFabClick
                }, [
                  state.phase !== "recording" ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_2, "🎙️")) : (vue.openBlock(), vue.createElementBlock("span", _hoisted_3, [..._cache[2] || (_cache[2] = [
                    vue.createElementVNode("i", null, null, -1),
                    vue.createElementVNode("i", null, null, -1),
                    vue.createElementVNode("i", null, null, -1),
                    vue.createElementVNode("i", null, null, -1)
                  ])]))
                ], 8, _hoisted_1)
              ]),
              _: 1
            }),
            state.phase === "recording" ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_4, vue.toDisplayString(recordingHint.value) + "，松开 Alt 自动查询 ", 1)) : vue.createCommentVNode("", true)
          ], 2)) : vue.createCommentVNode("", true),
          allowed.value ? (vue.openBlock(), vue.createBlock(_component_el_dialog, {
            key: 1,
            modelValue: dialog.visible,
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => dialog.visible = $event),
            title: dialog.title,
            width: "760px",
            "append-to-body": "",
            "destroy-on-close": "",
            onClosed: onDialogClosed
          }, {
            default: vue.withCtx(() => [
              vue.createElementVNode("div", _hoisted_5, [
                !chat.items.length ? (vue.openBlock(), vue.createBlock(_component_el_alert, {
                  key: 0,
                  title: "按住【Alt】键说话，松开自动查询；回答和思考过程会逐字显示，不方便说话也可直接打字",
                  type: "info",
                  closable: false,
                  class: "voice-dialog__hint"
                })) : vue.createCommentVNode("", true),
                vue.createElementVNode("div", {
                  ref_key: "chatRef",
                  ref: chatRef,
                  class: "voice-dialog__chat"
                }, [
                  (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(chat.items, (msg, idx) => {
                    return vue.openBlock(), vue.createElementBlock("div", {
                      key: idx,
                      class: vue.normalizeClass(["voice-dialog__row", msg.role === "user" ? "is-user" : "is-assistant"])
                    }, [
                      vue.createElementVNode("div", _hoisted_6, [
                        vue.createElementVNode("span", _hoisted_7, vue.toDisplayString(msg.role === "user" ? "我" : "助手"), 1),
                        vue.createElementVNode("span", _hoisted_8, vue.toDisplayString(msg.text), 1),
                        !msg.done ? (vue.openBlock(), vue.createElementBlock("span", {
                          key: 0,
                          class: vue.normalizeClass(["voice-dialog__caret", { "is-thinking": msg.role === "assistant" && dialog.loading }])
                        }, null, 2)) : vue.createCommentVNode("", true),
                        msg.role === "assistant" && !msg.done && dialog.loading ? (vue.openBlock(), vue.createElementBlock("span", _hoisted_9, [..._cache[3] || (_cache[3] = [
                          vue.createElementVNode("i", null, null, -1),
                          vue.createElementVNode("i", null, null, -1),
                          vue.createElementVNode("i", null, null, -1)
                        ])])) : vue.createCommentVNode("", true)
                      ])
                    ], 2);
                  }), 128))
                ], 512),
                dialog.revealed && dialog.card?.columns?.length ? (vue.openBlock(), vue.createElementBlock(vue.Fragment, { key: 1 }, [
                  vue.createVNode(_component_el_table, {
                    data: dialog.card.rows,
                    "show-summary": !!dialog.card.totals,
                    "summary-method": summaryMethod,
                    size: "small",
                    "max-height": "300",
                    class: "voice-dialog__table"
                  }, {
                    default: vue.withCtx(() => [
                      vue.createVNode(_component_el_table_column, {
                        type: "index",
                        label: "#",
                        width: "46"
                      }),
                      (vue.openBlock(true), vue.createElementBlock(vue.Fragment, null, vue.renderList(dialog.card.columns, (col) => {
                        return vue.openBlock(), vue.createBlock(_component_el_table_column, {
                          key: col.key,
                          prop: col.key,
                          label: col.label,
                          "min-width": col.width ? col.width : void 0,
                          align: col.numeric ? "right" : "left"
                        }, {
                          default: vue.withCtx(({ row }) => [
                            vue.createTextVNode(vue.toDisplayString(col.numeric ? vue.unref(formatAmount)(Number(row[col.key] ?? 0)) : row[col.key] ?? ""), 1)
                          ]),
                          _: 2
                        }, 1032, ["prop", "label", "min-width", "align"]);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["data", "show-summary"]),
                  vue.createElementVNode("div", _hoisted_10, [
                    vue.createVNode(_component_el_button, {
                      type: "primary",
                      disabled: !dialog.exportId,
                      onClick: onDownload
                    }, {
                      default: vue.withCtx(() => [
                        vue.createVNode(_component_el_icon, null, {
                          default: vue.withCtx(() => [
                            vue.createVNode(vue.unref(iconsVue.Download))
                          ]),
                          _: 1
                        }),
                        _cache[4] || (_cache[4] = vue.createTextVNode("下载 Excel ", -1))
                      ]),
                      _: 1
                    }, 8, ["disabled"]),
                    vue.createVNode(_component_el_button, { onClick: onAskAgain }, {
                      default: vue.withCtx(() => [..._cache[5] || (_cache[5] = [
                        vue.createTextVNode("重新说", -1)
                      ])]),
                      _: 1
                    })
                  ])
                ], 64)) : vue.createCommentVNode("", true),
                vue.createElementVNode("div", _hoisted_11, [
                  vue.createVNode(_component_el_input, {
                    ref_key: "textInputRef",
                    ref: textInputRef,
                    modelValue: dialog.textContent,
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => dialog.textContent = $event),
                    placeholder: "不方便说话可直接打字，回车查询，比如“看看这个月的收支”",
                    clearable: true,
                    onKeyup: vue.withKeys(onSubmitText, ["enter"])
                  }, null, 8, ["modelValue"]),
                  vue.createVNode(_component_el_button, {
                    type: "primary",
                    plain: "",
                    loading: dialog.loading,
                    onClick: onSubmitText
                  }, {
                    default: vue.withCtx(() => [..._cache[6] || (_cache[6] = [
                      vue.createTextVNode("查询", -1)
                    ])]),
                    _: 1
                  }, 8, ["loading"])
                ]),
                vue.createElementVNode("div", _hoisted_12, [
                  (vue.openBlock(), vue.createElementBlock(vue.Fragment, null, vue.renderList(SAMPLE_CMDS, (cmd) => {
                    return vue.createVNode(_component_el_tag, {
                      key: cmd,
                      class: "voice-dialog__cmd",
                      onClick: ($event) => onSampleCmd(cmd)
                    }, {
                      default: vue.withCtx(() => [
                        vue.createTextVNode(vue.toDisplayString(cmd), 1)
                      ]),
                      _: 2
                    }, 1032, ["onClick"]);
                  }), 64))
                ])
              ])
            ]),
            _: 1
          }, 8, ["modelValue", "title"])) : vue.createCommentVNode("", true)
        ], 64);
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
  const VoiceAssistant = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f9ab77b5"]]);
  function registerPlugin(id, definition) {
    if (typeof window === "undefined") return;
    window.__BOKI_PLUGIN_DEFS__ = window.__BOKI_PLUGIN_DEFS__ || {};
    window.__BOKI_PLUGIN_DEFS__[id] = definition;
  }
  registerPlugin("voice", {
    components: {
      VoiceAssistant
    },
    slots: {
      "layout.floating": VoiceAssistant
    }
  });
})(Vue, ElementPlus, ElementPlusIconsVue, axios, dayjs, Pinia);
