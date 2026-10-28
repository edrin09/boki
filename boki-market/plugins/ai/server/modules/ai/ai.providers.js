"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_PROVIDERS = void 0;
exports.maskKey = maskKey;
exports.AI_PROVIDERS = [
    {
        id: 'ollama',
        name: 'Ollama（本地自部署）',
        baseURL: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:1.5b-instruct',
        keyRequired: false,
        local: true,
        remark: '本机安装 Ollama 后 ollama pull qwen2.5:1.5b-instruct',
    },
    {
        id: 'llamacpp',
        name: 'llama.cpp server（本地自部署）',
        baseURL: 'http://127.0.0.1:9527/v1',
        model: 'Qwen3-Coder-30B-A3B-Instruct-Q4_K_M',
        keyRequired: false,
        local: true,
    },
    {
        id: 'vllm',
        name: 'vLLM / 其他自部署（OpenAI 兼容）',
        baseURL: 'http://127.0.0.1:8000/v1',
        model: 'Qwen2.5-1.5B-Instruct',
        keyRequired: false,
        local: true,
    },
    {
        id: 'dashscope',
        name: '通义千问（阿里云百炼）',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-plus',
        keyRequired: true,
        local: false,
    },
    {
        id: 'deepseek',
        name: 'DeepSeek（深度求索）',
        baseURL: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        keyRequired: true,
        local: false,
    },
    {
        id: 'moonshot',
        name: 'Kimi（月之暗面）',
        baseURL: 'https://api.moonshot.cn/v1',
        model: 'moonshot-v1-8k',
        keyRequired: true,
        local: false,
    },
    {
        id: 'zhipu',
        name: '智谱 GLM',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-flash',
        keyRequired: true,
        local: false,
    },
    {
        id: 'openai',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        keyRequired: true,
        local: false,
    },
    {
        id: 'custom',
        name: '自定义（任意 OpenAI 兼容接口）',
        baseURL: '',
        model: '',
        keyRequired: false,
        local: false,
    },
];
/** API Key 脱敏：前 4 位 + ****，本地部署无 key 时允为空 */
function maskKey(key) {
    if (!key)
        return null;
    if (key.length <= 4)
        return '****';
    return `${key.slice(0, 4)}****${key.length}位`;
}
