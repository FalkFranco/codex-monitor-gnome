import {UsageError} from './usage-errors.js';

const FIVE_HOURS = 5 * 60 * 60;
const WEEK = 7 * 24 * 60 * 60;

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeWindow(raw) {
    if (!raw || typeof raw !== 'object')
        return null;

    const used = finiteNumber(raw.used_percent ?? raw.usedPercent);
    const remaining = finiteNumber(raw.remaining_percent ?? raw.remainingPercent ?? raw.percent_remaining);
    let usedPercent = used ?? (remaining === null ? null : 100 - remaining);
    if (usedPercent === null)
        return null;
    usedPercent = Math.min(100, Math.max(0, usedPercent));

    const resetAfter = finiteNumber(raw.reset_after_seconds ?? raw.resetAfterSeconds ?? raw.reset_after);
    let resetsAt = null;
    const resetDate = raw.resets_at ?? raw.resetsAt;
    if (typeof resetDate === 'string') {
        const timestamp = Date.parse(resetDate);
        if (Number.isFinite(timestamp))
            resetsAt = timestamp;
    } else if (resetAfter !== null && resetAfter >= 0) {
        resetsAt = Date.now() + resetAfter * 1000;
    }
    return {usedPercent, resetsAt, resetAfterSeconds: resetAfter};
}

function collectWindows(payload) {
    const collected = [];
    const visited = new Set();
    const visit = node => {
        if (!node || typeof node !== 'object' || visited.has(node))
            return;
        visited.add(node);
        const duration = finiteNumber(
            node.limit_window_seconds ?? node.limitWindowSeconds ??
            node.window_seconds ?? node.windowSeconds ?? node.duration_seconds
        );
        const window = normalizeWindow(node);
        if (window && duration)
            collected.push({duration, ...window});
        for (const value of Object.values(node))
            visit(value);
    };
    visit(payload);
    return collected;
}

export function normalizeUsage(payload) {
    if (!payload || typeof payload !== 'object')
        throw new UsageError('The server returned an empty response.', 'invalid-data');

    const windows = collectWindows(payload);
    const choose = target => windows
        .filter(window => Math.abs(window.duration - target) < (target === FIVE_HOURS ? 3600 : 86400))
        .sort((a, b) => Math.abs(a.duration - target) - Math.abs(b.duration - target))[0] ?? null;
    const short = choose(FIVE_HOURS);
    const weekly = choose(WEEK);
    if (!short && !weekly)
        throw new UsageError('Could not identify the five-hour or weekly usage limits.', 'invalid-data');
    return {fetchedAt: Date.now(), windows: {short, weekly}};
}

export function formatReset(window) {
    if (!window?.resetsAt)
        return 'Reset time unavailable';
    const seconds = Math.max(0, Math.floor((window.resetsAt - Date.now()) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0)
        return `Resets in ${days} d ${hours} h`;
    if (hours > 0)
        return `Resets in ${hours} h ${minutes} min`;
    return `Resets in ${minutes} min`;
}
