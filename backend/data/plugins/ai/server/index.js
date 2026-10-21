"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const ai_module_1 = require("./modules/ai/ai.module");
exports.module = ai_module_1.AiModule;
// AI 配置存放在内核 sys_config 表，不拥有业务实体。
exports.entities = [];
