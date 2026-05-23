"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = void 0;
exports.getCurrentContext = getCurrentContext;
exports.generateId = generateId;
const async_hooks_1 = require("async_hooks");
const uuid_1 = require("uuid");
exports.storage = new async_hooks_1.AsyncLocalStorage();
function getCurrentContext() {
    return exports.storage.getStore();
}
function generateId() {
    return (0, uuid_1.v4)();
}
//# sourceMappingURL=context.js.map