"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exponentialBackoffMs = exponentialBackoffMs;
exports.sleep = sleep;
function exponentialBackoffMs(attempt, base = 500) {
    // attempt starts at 1
    return Math.round(base * Math.pow(2, Math.max(0, attempt - 1)));
}
function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
