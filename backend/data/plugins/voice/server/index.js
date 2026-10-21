"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entities = exports.module = void 0;
const voice_assistant_module_1 = require("./modules/voice-assistant/voice-assistant.module");
exports.module = voice_assistant_module_1.VoiceAssistantModule;
// 语音助手只读，不拥有业务实体。
exports.entities = [];
