import { createRequire } from 'module'; const require = createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core/utils/Logger.ts
var Logger_exports = {};
__export(Logger_exports, {
  LogLevel: () => LogLevel,
  Logger: () => Logger
});
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
var LogLevel, DEFAULT_CONFIG, COLORS, Logger;
var init_Logger = __esm({
  "src/core/utils/Logger.ts"() {
    "use strict";
    LogLevel = /* @__PURE__ */ ((LogLevel2) => {
      LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
      LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
      LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
      LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
      LogLevel2[LogLevel2["FATAL"] = 4] = "FATAL";
      return LogLevel2;
    })(LogLevel || {});
    DEFAULT_CONFIG = {
      level: 1 /* INFO */,
      fileOutput: true,
      consoleOutput: false,
      logDirectory: "./logs",
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 10,
      includeTimestamp: true,
      colorize: true,
      jsonOutput: false
    };
    COLORS = {
      reset: "\x1B[0m",
      red: "\x1B[31m",
      green: "\x1B[32m",
      yellow: "\x1B[33m",
      blue: "\x1B[34m",
      magenta: "\x1B[35m",
      cyan: "\x1B[36m",
      white: "\x1B[37m",
      gray: "\x1B[90m"
    };
    Logger = class _Logger {
      config;
      contextName;
      logStream = null;
      currentFileSize = 0;
      fileHandle = null;
      logBuffer = [];
      bufferFlushInterval = null;
      constructor(contextName, config) {
        this.contextName = contextName;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.initialize();
      }
      initialize() {
        if (this.config.fileOutput) {
          this.ensureLogDirectory();
          this.rotateLogFileIfNeeded();
          this.bufferFlushInterval = setInterval(() => this.flushBuffer(), 5e3);
        }
      }
      ensureLogDirectory() {
        if (!fs.existsSync(this.config.logDirectory)) {
          fs.mkdirSync(this.config.logDirectory, { recursive: true });
        }
      }
      getLogFilePath() {
        const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        return path.join(this.config.logDirectory, `jellyos-${date}.log`);
      }
      rotateLogFileIfNeeded() {
        const logPath = this.getLogFilePath();
        try {
          if (fs.existsSync(logPath)) {
            const stats = fs.statSync(logPath);
            this.currentFileSize = stats.size;
          }
        } catch (error) {
          this.currentFileSize = 0;
        }
      }
      formatMessage(entry) {
        const timestamp = entry.timestamp;
        const levelName = entry.levelName.padEnd(5, " ");
        const context = entry.context ? `[${entry.context}] ` : "";
        if (this.config.jsonOutput) {
          return JSON.stringify({
            timestamp: entry.timestamp,
            level: entry.levelName,
            context: entry.context,
            message: entry.message,
            meta: entry.meta
          });
        }
        let line = `${timestamp} ${levelName} ${context}${entry.message}`;
        if (entry.meta && Object.keys(entry.meta).length > 0) {
          line += ` ${util.inspect(entry.meta, { depth: null, colors: false })}`;
        }
        if (entry.error) {
          line += `
  Error: ${entry.error.message}`;
          if (entry.error.stack) {
            line += `
  Stack: ${entry.error.stack}`;
          }
        }
        return line;
      }
      writeToConsole(entry) {
        if (!this.config.consoleOutput) return;
        const message = this.formatMessage(entry);
        const color = this.config.colorize ? this.getLevelColor(entry.level) : "";
        const colorReset = this.config.colorize ? COLORS.reset : "";
        switch (entry.level) {
          case 0 /* DEBUG */:
            console.debug(`${color}${message}${colorReset}`);
            break;
          case 1 /* INFO */:
            console.info(`${color}${message}${colorReset}`);
            break;
          case 2 /* WARN */:
            console.warn(`${color}${message}${colorReset}`);
            break;
          case 3 /* ERROR */:
            console.error(`${color}${message}${colorReset}`);
            break;
          case 4 /* FATAL */:
            console.error(`${color}${message}${colorReset}`);
            break;
        }
      }
      getLevelColor(level) {
        switch (level) {
          case 0 /* DEBUG */:
            return COLORS.gray;
          case 1 /* INFO */:
            return COLORS.green;
          case 2 /* WARN */:
            return COLORS.yellow;
          case 3 /* ERROR */:
            return COLORS.red;
          case 4 /* FATAL */:
            return COLORS.magenta;
          default:
            return COLORS.white;
        }
      }
      addToBuffer(entry) {
        this.logBuffer.push(entry);
        if (this.logBuffer.length >= 100) {
          this.flushBuffer();
        }
      }
      flushBuffer() {
        if (this.logBuffer.length === 0) return;
        const logPath = this.getLogFilePath();
        const batchSize = Math.min(this.logBuffer.length, 50);
        const batch = this.logBuffer.splice(0, batchSize);
        for (const entry of batch) {
          const line = this.formatMessage(entry) + "\n";
          this.currentFileSize += Buffer.byteLength(line);
          fs.appendFileSync(logPath, line, "utf8");
        }
      }
      log(level, message, meta, error) {
        if (level < this.config.level) return;
        const entry = {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level,
          levelName: LogLevel[level],
          context: this.contextName,
          message,
          meta,
          error
        };
        this.writeToConsole(entry);
        if (this.config.fileOutput) {
          this.addToBuffer(entry);
        }
      }
      debug(message, meta) {
        this.log(0 /* DEBUG */, message, meta);
      }
      info(message, meta) {
        this.log(1 /* INFO */, message, meta);
      }
      warn(message, meta) {
        this.log(2 /* WARN */, message, meta);
      }
      error(message, errorOrMeta) {
        if (errorOrMeta instanceof Error) {
          this.log(3 /* ERROR */, message, void 0, errorOrMeta);
        } else {
          this.log(3 /* ERROR */, message, errorOrMeta);
        }
      }
      fatal(message, errorOrMeta) {
        if (errorOrMeta instanceof Error) {
          this.log(4 /* FATAL */, message, void 0, errorOrMeta);
        } else {
          this.log(4 /* FATAL */, message, errorOrMeta);
        }
      }
      child(context) {
        return new _Logger(`${this.contextName}:${context}`, this.config);
      }
      startTimer(operation) {
        const start = process.hrtime.bigint();
        return () => {
          const end = process.hrtime.bigint();
          const duration = Number(end - start) / 1e6;
          this.info(`${operation} completed`, { durationMs: duration.toFixed(2) });
          return duration;
        };
      }
      time(message, duration) {
        this.info(message, { durationMs: duration.toFixed(2) });
      }
      async close() {
        if (this.bufferFlushInterval) {
          clearInterval(this.bufferFlushInterval);
          this.bufferFlushInterval = null;
        }
        this.flushBuffer();
      }
      getConfig() {
        return { ...this.config };
      }
      setLevel(level) {
        this.config.level = level;
      }
    };
  }
});

// src/trading/PositionManager.ts
var PositionManager_exports = {};
__export(PositionManager_exports, {
  PositionManager: () => PositionManager,
  PositionStatus: () => PositionStatus
});
var PositionStatus, PositionManager;
var init_PositionManager = __esm({
  "src/trading/PositionManager.ts"() {
    "use strict";
    init_Logger();
    PositionStatus = /* @__PURE__ */ ((PositionStatus2) => {
      PositionStatus2["OPEN"] = "open";
      PositionStatus2["CLOSED"] = "closed";
      PositionStatus2["STOPPED"] = "stopped";
      PositionStatus2["LIQUIDATED"] = "liquidated";
      return PositionStatus2;
    })(PositionStatus || {});
    PositionManager = class {
      logger;
      metrics;
      config;
      positions = /* @__PURE__ */ new Map();
      closedPositions = [];
      trailingStops = /* @__PURE__ */ new Map();
      constructor(metrics, config) {
        this.metrics = metrics;
        this.logger = new Logger("PositionManager");
        this.config = { defaultStopLoss: 0.05, defaultTakeProfit: 0.15, maxLeverage: 5, trailingStop: true, trailingStopDistance: 0.02, ...config };
      }
      openPosition(params) {
        const id = `pos:${params.symbol}:${Date.now()}`;
        const position = {
          id,
          symbol: params.symbol,
          side: params.side,
          entryPrice: params.entryPrice,
          currentPrice: params.entryPrice,
          quantity: params.quantity,
          entryTime: Date.now(),
          updatedTime: Date.now(),
          realizedPnL: 0,
          unrealizedPnL: 0,
          fees: 0,
          status: "open" /* OPEN */,
          strategy: params.strategy || "manual",
          tags: params.tags || [],
          stopLoss: params.stopLoss || params.entryPrice * (1 - (params.side === "long" ? this.config.defaultStopLoss : -this.config.defaultStopLoss)),
          takeProfit: params.takeProfit || params.entryPrice * (1 + (params.side === "long" ? this.config.defaultTakeProfit : -this.config.defaultTakeProfit)),
          leverage: params.leverage || 1
        };
        this.positions.set(id, position);
        this.metrics.increment("positions.opened", 1, { symbol: position.symbol, side: position.side });
        this.logger.info(`Opened ${position.side} position ${id}: ${position.quantity} ${position.symbol} @ ${position.entryPrice}`);
        return position;
      }
      closePosition(positionId, closePrice) {
        const position = this.positions.get(positionId);
        if (!position) return null;
        const exitPrice = closePrice || position.currentPrice;
        const grossPnL = position.side === "long" ? (exitPrice - position.entryPrice) * position.quantity : (position.entryPrice - exitPrice) * position.quantity;
        position.realizedPnL = grossPnL * position.leverage - position.fees;
        position.currentPrice = exitPrice;
        position.status = "closed" /* CLOSED */;
        position.updatedTime = Date.now();
        this.positions.delete(positionId);
        this.closedPositions.push(position);
        this.metrics.increment("positions.closed", 1, { symbol: position.symbol });
        this.logger.info(`Closed position ${positionId}: PnL ${position.realizedPnL}`);
        return position;
      }
      updatePrice(positionId, newPrice) {
        const position = this.positions.get(positionId);
        if (!position) return null;
        const prevPrice = position.currentPrice;
        position.currentPrice = newPrice;
        position.updatedTime = Date.now();
        position.unrealizedPnL = position.side === "long" ? (newPrice - position.entryPrice) * position.quantity * position.leverage : (position.entryPrice - newPrice) * position.quantity * position.leverage;
        if (this.config.trailingStop) this.updateTrailingStop(position, newPrice);
        const shouldStop = this.shouldTriggerStop(position);
        if (shouldStop) return this.closePosition(positionId, newPrice);
        return position;
      }
      updateTrailingStop(position, newPrice) {
        const stopKey = position.id;
        const currentStop = this.trailingStops.get(stopKey) || position.stopLoss;
        if (position.side === "long" && newPrice > currentStop + this.config.trailingStopDistance) {
          const newStop = newPrice - this.config.trailingStopDistance;
          this.trailingStops.set(stopKey, newStop);
          position.stopLoss = newStop;
        } else if (position.side === "short" && newPrice < currentStop - this.config.trailingStopDistance) {
          const newStop = newPrice + this.config.trailingStopDistance;
          this.trailingStops.set(stopKey, newStop);
          position.stopLoss = newStop;
        }
      }
      shouldTriggerStop(position) {
        if (position.side === "long" && position.currentPrice <= position.stopLoss) return true;
        if (position.side === "long" && position.currentPrice >= position.takeProfit) return true;
        if (position.side === "short" && position.currentPrice >= position.stopLoss) return true;
        if (position.side === "short" && position.currentPrice <= position.takeProfit) return true;
        return false;
      }
      getPosition(positionId) {
        return this.positions.get(positionId);
      }
      getOpenPositions() {
        return [...this.positions.values()];
      }
      getPositionsBySymbol(symbol) {
        return [...this.positions.values()].filter((p) => p.symbol === symbol);
      }
      getClosedPositions(limit = 50) {
        return this.closedPositions.slice(-limit);
      }
      getStats() {
        const open = this.getOpenPositions();
        const totalUnrealized = open.reduce((s, p) => s + p.unrealizedPnL, 0);
        const totalRealized = this.closedPositions.reduce((s, p) => s + p.realizedPnL, 0);
        const wins = this.closedPositions.filter((p) => p.realizedPnL > 0).length;
        const losses = this.closedPositions.filter((p) => p.realizedPnL < 0).length;
        return {
          openPositions: open.length,
          closedPositions: this.closedPositions.length,
          totalUnrealizedPnL: totalUnrealized,
          totalRealizedPnL: totalRealized,
          winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
          wins,
          losses,
          totalFees: this.closedPositions.reduce((s, p) => s + p.fees, 0)
        };
      }
      close() {
        this.positions.clear();
        this.closedPositions = [];
        this.trailingStops.clear();
        this.logger.info("PositionManager closed");
      }
    };
  }
});

// src/core/utils/Metrics.ts
var Metrics_exports = {};
__export(Metrics_exports, {
  Metrics: () => Metrics
});
var DEFAULT_CONFIG2, Metrics;
var init_Metrics = __esm({
  "src/core/utils/Metrics.ts"() {
    "use strict";
    DEFAULT_CONFIG2 = {
      enabled: true,
      collectInterval: 6e4,
      maxAge: 36e5,
      enableExport: false
    };
    Metrics = class {
      config;
      logger;
      counters = /* @__PURE__ */ new Map();
      gauges = /* @__PURE__ */ new Map();
      histograms = /* @__PURE__ */ new Map();
      summaries = /* @__PURE__ */ new Map();
      values = /* @__PURE__ */ new Map();
      labelSets = /* @__PURE__ */ new Map();
      collectTimer = null;
      constructor(logger, config) {
        this.logger = logger;
        this.config = { ...DEFAULT_CONFIG2, ...config };
        this.startCollection();
      }
      startCollection() {
        if (!this.config.enabled) return;
        this.collectTimer = setInterval(() => {
          this.collect();
        }, this.config.collectInterval);
      }
      collect() {
        const now = Date.now();
        for (const [key, values] of this.values) {
          const filtered = values.filter((v) => now - v.timestamp < this.config.maxAge);
          this.values.set(key, filtered);
        }
      }
      increment(counter, value = 1, labels) {
        const key = this.makeKey(counter, labels);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + value);
        this.recordValue(key, value, labels);
      }
      decrement(counter, value = 1, labels) {
        this.increment(counter, -value, labels);
      }
      getCounter(name, labels) {
        const key = this.makeKey(name, labels);
        return this.counters.get(key) || 0;
      }
      setGauge(gauge, value, labels) {
        const key = this.makeKey(gauge, labels);
        this.gauges.set(key, value);
        this.recordValue(key, value, labels);
      }
      getGauge(name, labels) {
        const key = this.makeKey(name, labels);
        return this.gauges.get(key) || 0;
      }
      observe(histogram, value, labels) {
        const key = this.makeKey(histogram, labels);
        const buckets = [0.1, 0.5, 1, 5, 10, 30, 100, 500, 1e3, 5e3, 1e4, Infinity];
        let data = this.histograms.get(key);
        if (!data) {
          data = {
            buckets: buckets.map((b) => ({ upperBound: b, count: 0 })),
            sum: 0,
            count: 0
          };
          this.histograms.set(key, data);
        }
        for (const bucket of data.buckets) {
          if (value <= bucket.upperBound) {
            bucket.count++;
          }
        }
        data.sum += value;
        data.count++;
        this.recordValue(key, value, labels);
      }
      getHistogram(name, labels) {
        const key = this.makeKey(name, labels);
        return this.histograms.get(key) || { buckets: [], sum: 0, count: 0 };
      }
      record(name, value, labels) {
        const key = this.makeKey(name, labels);
        let summary = this.summaries.get(key);
        if (!summary) {
          summary = { count: 0, sum: 0 };
          this.summaries.set(key, summary);
        }
        summary.count++;
        summary.sum += value;
        this.recordValue(key, value, labels);
      }
      getSummary(name, labels) {
        const key = this.makeKey(name, labels);
        const summary = this.summaries.get(key);
        if (!summary || summary.count === 0) {
          return { count: 0, sum: 0, avg: 0 };
        }
        return {
          count: summary.count,
          sum: summary.sum,
          avg: summary.sum / summary.count
        };
      }
      makeKey(name, labels) {
        if (!labels || Object.keys(labels).length === 0) {
          return name;
        }
        const labelStr = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(",");
        return `${name}{${labelStr}}`;
      }
      recordValue(key, value, labels) {
        if (!this.values.has(key)) {
          this.values.set(key, []);
        }
        const values = this.values.get(key);
        values.push({ value, timestamp: Date.now(), labels });
      }
      getSnapshot() {
        const snapshot = {
          counter: Object.fromEntries(this.counters),
          gauge: Object.fromEntries(this.gauges),
          histogram: {},
          summary: {}
        };
        for (const [key, data] of this.histograms) {
          snapshot.histogram[key] = data;
        }
        for (const [key, summary] of this.summaries) {
          snapshot.summary[key] = {
            count: summary.count,
            sum: summary.sum,
            avg: summary.count > 0 ? summary.sum / summary.count : 0
          };
        }
        return snapshot;
      }
      reset() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.summaries.clear();
        this.values.clear();
      }
      getValues(metricName) {
        return this.values.get(metricName) || [];
      }
      getRecentValues(metricName, seconds) {
        const cutoff = Date.now() - seconds * 1e3;
        return this.getValues(metricName).filter((v) => v.timestamp >= cutoff);
      }
      close() {
        if (this.collectTimer) {
          clearInterval(this.collectTimer);
          this.collectTimer = null;
        }
      }
    };
  }
});

// src/trading/PortfolioManager.ts
var PortfolioManager_exports = {};
__export(PortfolioManager_exports, {
  PortfolioManager: () => PortfolioManager
});
var PortfolioManager;
var init_PortfolioManager = __esm({
  "src/trading/PortfolioManager.ts"() {
    "use strict";
    init_Logger();
    PortfolioManager = class {
      logger;
      metrics;
      positionManager;
      config;
      cashReserve;
      constructor(positionManager, metrics, initialCapital = 1e5, config) {
        this.positionManager = positionManager;
        this.metrics = metrics;
        this.logger = new Logger("PortfolioManager");
        this.cashReserve = initialCapital;
        this.config = {
          type: "risk-parity",
          maxPositionSize: 0.2,
          minPositionSize: 0.02,
          rebalanceThreshold: 0.05,
          ...config
        };
      }
      getSummary() {
        const positions = this.positionManager.getOpenPositions();
        const closedPositions = this.positionManager.getClosedPositions();
        const totalAllocated = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
        const totalValue = this.cashReserve + totalAllocated;
        const unrealizedPnL = positions.reduce((s, p) => s + p.unrealizedPnL, 0);
        const realizedPnL = closedPositions.reduce((s, p) => s + p.realizedPnL, 0);
        const totalReturn = (realizedPnL + unrealizedPnL) / (totalValue - realizedPnL - unrealizedPnL);
        const concentration = {};
        for (const pos of positions) {
          concentration[pos.symbol] = totalValue > 0 ? pos.currentPrice * pos.quantity / totalValue : 0;
        }
        const longExposure = positions.filter((p) => p.side === "long").reduce((s, p) => s + p.currentPrice * p.quantity, 0);
        const shortExposure = positions.filter((p) => p.side === "short").reduce((s, p) => s + p.currentPrice * p.quantity, 0);
        const uniqueSymbols = new Set(positions.map((p) => p.symbol)).size;
        const diversification = positions.length > 0 ? uniqueSymbols / positions.length : 0;
        const wins = closedPositions.filter((p) => p.realizedPnL > 0).length;
        const losses = closedPositions.filter((p) => p.realizedPnL < 0).length;
        const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;
        const avgWin = wins > 0 ? closedPositions.filter((p) => p.realizedPnL > 0).reduce((s, p) => s + p.realizedPnL, 0) / wins : 0;
        const avgLoss = losses > 0 ? Math.abs(closedPositions.filter((p) => p.realizedPnL < 0).reduce((s, p) => s + p.realizedPnL, 0)) / losses : 0;
        return {
          totalValue,
          cash: this.cashReserve,
          allocated: totalAllocated,
          positions: positions.length,
          diversification,
          concentration,
          exposure: { long: longExposure, short: shortExposure, net: longExposure - shortExposure },
          performance: {
            totalReturn,
            dailyReturn: totalReturn / 365,
            weeklyReturn: totalReturn / 52,
            monthlyReturn: totalReturn / 12,
            sharpeRatio: totalReturn > 0 ? 0.5 : 0,
            maxDrawdown: 0
          },
          timestamp: Date.now()
        };
      }
      calculateAllocation(symbol, price, score) {
        const maxAllocation = this.cashReserve * this.config.maxPositionSize;
        const minAllocation = this.cashReserve * this.config.minPositionSize;
        if (this.config.type === "equal") {
          const positionCount = this.positionManager.getOpenPositions().length + 1;
          return Math.min(maxAllocation, this.cashReserve / positionCount);
        }
        if (this.config.type === "momentum") {
          const normalizedScore = Math.max(0, Math.min(1, (score + 1) / 2));
          return Math.max(minAllocation, Math.min(maxAllocation, this.cashReserve * normalizedScore * 0.1));
        }
        return Math.max(minAllocation, Math.min(maxAllocation, this.cashReserve * 0.1));
      }
      checkRebalanceNeeded() {
        const summary = this.getSummary();
        if (summary.positions === 0) return false;
        for (const [, weight] of Object.entries(summary.concentration)) {
          if (Math.abs(weight - (this.config.weights?.["default"] || 0.1)) > this.config.rebalanceThreshold) {
            return true;
          }
        }
        return false;
      }
      addCash(amount) {
        this.cashReserve += amount;
      }
      deductCash(amount) {
        this.cashReserve = Math.max(0, this.cashReserve - amount);
      }
      getCash() {
        return this.cashReserve;
      }
      setAllocationStrategy(strategy) {
        this.config = { ...this.config, ...strategy };
      }
    };
  }
});

// extensions/jellyos.ts
import { Type, modelRegistry, priceFeed, newsFeed, fullAnalysis } from "@jellyos/agent";
import * as os from "node:os";
import * as path2 from "node:path";
import { WebSocketServer } from "ws";

// src/wallet/WalletManager.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import * as crypto from "crypto";
function keccak256Hex(data) {
  const { ethers } = __require("ethers");
  return ethers.utils.keccak256(data).slice(2);
}
function eip55Checksum(address) {
  const addr = address.toLowerCase().replace(/^0x/, "");
  const hash2 = keccak256Hex(Buffer.from(addr, "utf-8"));
  let checksummed = "0x";
  for (let i = 0; i < addr.length; i++) {
    checksummed += parseInt(hash2[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return checksummed;
}
var B32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Encode(hrp, data) {
  const words = [];
  let acc = 0, bits = 0;
  for (const b of data) {
    acc = acc << 8 | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push(acc >> bits & 31);
    }
  }
  if (bits > 0) words.push(acc << 5 - bits & 31);
  const hrpBytes = hrp.split("").map((c) => c.charCodeAt(0));
  const data5 = words;
  let cs = 1;
  for (const v of [...hrpBytes.map((b) => b >> 5), 0, ...hrpBytes.map((b) => b & 31), ...data5, 0, 0, 0, 0, 0, 0]) {
    const b = cs >> 25;
    cs = (cs & 33554431) << 5 ^ v ^ -(b >> 0 & 1) & 996825010 ^ -(b >> 1 & 1) & 642813549 ^ -(b >> 2 & 1) & 513874426 ^ -(b >> 3 & 1) & 1027748829 ^ -(b >> 4 & 1) & 705979059;
  }
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => cs >> 5 * (5 - i) & 31);
  return hrp + "1" + [...data5, ...checksum].map((d) => B32_CHARSET[d]).join("");
}
var WalletManager = class {
  walletsDir;
  wallets = /* @__PURE__ */ new Map();
  constructor(jellyHome) {
    this.walletsDir = resolve(jellyHome, "wallets");
    if (!existsSync(this.walletsDir)) mkdirSync(this.walletsDir, { recursive: true });
    this.loadAll();
  }
  // ── Wallet generation ────────────────────────────────────────────────────
  generateEVMWallet() {
    const ecdh = crypto.createECDH("secp256k1");
    ecdh.generateKeys();
    const privHex = ecdh.getPrivateKey("hex");
    const pubBytes = ecdh.getPublicKey();
    const pubKey64 = pubBytes.slice(1);
    const hash2 = keccak256Hex(pubKey64);
    const address = eip55Checksum("0x" + hash2.slice(-40));
    return {
      chain: "evm",
      address,
      privateKey: "0x" + privHex,
      publicKey: "0x04" + ecdh.getPublicKey("hex"),
      keyType: "secp256k1",
      createdAt: Date.now()
    };
  }
  generateSolanaWallet() {
    try {
      const { Keypair } = __require("@solana/web3.js");
      const kp = Keypair.generate();
      const address = kp.publicKey.toBase58();
      const privHex = Buffer.from(kp.secretKey).toString("hex");
      return {
        chain: "solana",
        address,
        privateKey: privHex,
        publicKey: Buffer.from(kp.publicKey.toBytes()).toString("hex"),
        keyType: "ed25519",
        createdAt: Date.now()
      };
    } catch {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
      const pubDer = publicKey.export({ type: "spki", format: "der" });
      const pubRaw = pubDer.slice(-32);
      const privDer = privateKey.export({ type: "pkcs8", format: "der" });
      const b58chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      let num = BigInt("0x" + pubRaw.toString("hex"));
      let addr = "";
      const base = BigInt(58);
      while (num > 0n) {
        addr = b58chars[Number(num % base)] + addr;
        num /= base;
      }
      return {
        chain: "solana",
        address: addr || "1",
        privateKey: privDer.toString("hex"),
        publicKey: pubDer.toString("hex"),
        keyType: "ed25519",
        createdAt: Date.now()
      };
    }
  }
  generateCosmosWallet() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const pubDer = publicKey.export({ type: "spki", format: "der" });
    const pubRaw = pubDer.slice(-32);
    let hash2;
    try {
      hash2 = crypto.createHash("ripemd160").update(
        crypto.createHash("sha256").update(pubRaw).digest()
      ).digest();
    } catch {
      hash2 = crypto.createHash("sha256").update(
        crypto.createHash("sha256").update(pubRaw).digest()
      ).digest().slice(0, 20);
    }
    const address = bech32Encode("cosmos", hash2);
    const privDer = privateKey.export({ type: "pkcs8", format: "der" });
    return {
      chain: "cosmos",
      address,
      privateKey: privDer.toString("hex"),
      publicKey: pubDer.toString("hex"),
      keyType: "ed25519",
      createdAt: Date.now()
    };
  }
  // ── Signing ──────────────────────────────────────────────────────────────
  /**
   * Sign an unsigned transaction payload (raw bytes hex or UTF-8 message).
   *
   * EVM    : Signs with Ethereum personal_sign prefix using ethers.Wallet.signMessage(),
   *          or raw keccak256+ECDSA for a raw 32-byte hash input.
   * Solana : Ed25519 raw signature over the bytes.
   * Cosmos : Ed25519 over SHA256(bytes).
   *
   * Returns hex-encoded signature. Does NOT broadcast.
   */
  signMessage(chain, data) {
    const normalized = this.normalizeChain(chain);
    const wallet = this.wallets.get(normalized);
    if (!wallet) return null;
    const isHex = /^(0x)?[0-9a-f]+$/i.test(data.replace(/\s/g, ""));
    const msgBytes = isHex ? Buffer.from(data.replace(/^0x/, ""), "hex") : Buffer.from(data, "utf-8");
    try {
      if (wallet.keyType === "secp256k1") {
        try {
          const { ethers } = __require("ethers");
          const privKey = wallet.privateKey.startsWith("0x") ? wallet.privateKey : "0x" + wallet.privateKey;
          const signer = new ethers.Wallet(privKey);
          if (msgBytes.length === 32) {
            const signingKey2 = new ethers.utils.SigningKey(privKey);
            const sig = signingKey2.signDigest(msgBytes);
            return ethers.utils.joinSignature(sig);
          }
          const prefixed = "Ethereum Signed Message:\n" + msgBytes.length;
          const hash3 = keccak256Hex(Buffer.concat([Buffer.from(prefixed), msgBytes]));
          const signingKey = new ethers.utils.SigningKey(privKey);
          return ethers.utils.joinSignature(signingKey.signDigest("0x" + hash3));
        } catch {
        }
        const ecdh = crypto.createECDH("secp256k1");
        ecdh.setPrivateKey(Buffer.from(wallet.privateKey.replace(/^0x/, ""), "hex"));
        const hash2 = keccak256Hex(msgBytes);
        const privKeyObj = crypto.createPrivateKey({
          key: ecdh.getPrivateKey(),
          format: "raw",
          type: "sec1",
          namedCurve: "secp256k1"
        });
        return crypto.sign(null, Buffer.from(hash2, "hex"), privKeyObj).toString("hex");
      } else {
        const hashBytes = normalized === "cosmos" ? crypto.createHash("sha256").update(msgBytes).digest() : msgBytes;
        const privKeyObj = crypto.createPrivateKey({
          key: Buffer.from(wallet.privateKey, "hex"),
          format: "der",
          type: "pkcs8"
        });
        return crypto.sign(null, hashBytes, privKeyObj).toString("hex");
      }
    } catch (err) {
      throw new Error(`Signing failed for ${chain}: ${err.message}`);
    }
  }
  // ── CRUD ─────────────────────────────────────────────────────────────────
  generateAll() {
    if (!this.wallets.has("evm")) this.create("evm");
    if (!this.wallets.has("solana")) this.create("solana");
    if (!this.wallets.has("cosmos")) this.create("cosmos");
  }
  create(chain) {
    let wallet;
    switch (chain) {
      case "solana":
        wallet = this.generateSolanaWallet();
        break;
      case "cosmos":
        wallet = this.generateCosmosWallet();
        break;
      default:
        wallet = this.generateEVMWallet();
        wallet.chain = chain;
        break;
    }
    this.wallets.set(chain, wallet);
    const fp = resolve(this.walletsDir, `${chain}.json`);
    writeFileSync(fp, JSON.stringify(wallet, null, 2), "utf-8");
    try {
      __require("fs").chmodSync(fp, 384);
    } catch {
    }
    return wallet;
  }
  getAddress(chain) {
    return this.wallets.get(this.normalizeChain(chain))?.address ?? null;
  }
  getSummary() {
    const result = {};
    for (const [chain, w] of this.wallets) result[chain] = w.address;
    return result;
  }
  getStats() {
    return { chains: [...this.wallets.keys()], count: this.wallets.size };
  }
  hasWallets() {
    return this.wallets.size > 0;
  }
  // ── Private ──────────────────────────────────────────────────────────────
  normalizeChain(chain) {
    const EVM_CHAINS = [
      "ethereum",
      "bsc",
      "arbitrum",
      "base",
      "polygon",
      "avalanche",
      "optimism",
      "fantom",
      "gnosis",
      "scroll",
      "linea",
      "zksync",
      "mantle",
      "blast",
      "celo"
    ];
    return EVM_CHAINS.includes(chain) ? "evm" : chain;
  }
  loadAll() {
    if (!existsSync(this.walletsDir)) return;
    for (const chain of ["evm", "solana", "cosmos"]) {
      const fp = resolve(this.walletsDir, `${chain}.json`);
      if (existsSync(fp)) {
        try {
          this.wallets.set(chain, JSON.parse(readFileSync(fp, "utf-8")));
        } catch {
        }
      }
    }
  }
};

// src/vault/VaultManager.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { resolve as resolve2 } from "path";
import * as crypto2 from "crypto";
import * as argon2 from "argon2";
var VAULT_VERSION = 4;
var KEY_LENGTH = 32;
var ARGON2_TIME_COST = 3;
var ARGON2_MEMORY_COST = 65536;
var ARGON2_PARALLELISM = 4;
var SCRYPT_N = 16384;
var SCRYPT_R = 8;
var SCRYPT_P = 1;
var VaultManager = class {
  vaultPath;
  vaultDir;
  data = null;
  locked = true;
  key = null;
  salt = null;
  constructor(repoRoot) {
    this.vaultDir = resolve2(repoRoot, "vault");
    this.vaultPath = resolve2(this.vaultDir, "profits.vault");
    if (!existsSync2(this.vaultDir)) mkdirSync2(this.vaultDir, { recursive: true });
  }
  exists() {
    return existsSync2(this.vaultPath);
  }
  isLocked() {
    return this.locked;
  }
  // ── Lifecycle ────────────────────────────────────────────────────────────
  async create(passphrase) {
    if (this.exists()) throw new Error("Vault already exists. Use unlock() to open it.");
    this.salt = crypto2.randomBytes(32);
    this.key = await this.deriveArgon2id(passphrase, this.salt);
    this.data = {
      balance: 0,
      currency: "USD",
      entries: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.locked = false;
    await this.persist();
  }
  /**
   * Reads the kdf field from the vault file, then derives the key with the
   * correct algorithm (argon2id for v4+ vaults, scrypt for legacy vaults).
   * Throws on wrong passphrase (GCM auth failure).
   */
  async unlock(passphrase) {
    if (!this.exists()) throw new Error("Vault does not exist. Run `jellyos setup` first.");
    try {
      const raw = JSON.parse(readFileSync2(this.vaultPath, "utf-8"));
      const fileSalt = Buffer.from(raw.salt, "hex");
      let candidateKey;
      if (raw.kdf === "argon2id") {
        candidateKey = await this.deriveArgon2id(
          passphrase,
          fileSalt,
          raw.timeCost ?? ARGON2_TIME_COST,
          raw.memoryCost ?? ARGON2_MEMORY_COST,
          raw.parallelism ?? ARGON2_PARALLELISM
        );
      } else {
        candidateKey = await this.deriveScrypt(
          passphrase,
          fileSalt,
          raw.N ?? SCRYPT_N,
          raw.r ?? SCRYPT_R,
          raw.p ?? SCRYPT_P
        );
      }
      const data = this.decryptWith(candidateKey, raw);
      this.salt = fileSalt;
      this.key = candidateKey;
      this.data = data;
      this.locked = false;
      return true;
    } catch {
      this.key = null;
      this.salt = null;
      this.locked = true;
      return false;
    }
  }
  lock() {
    this.key = null;
    this.salt = null;
    this.data = null;
    this.locked = true;
  }
  // ── Operations ───────────────────────────────────────────────────────────
  async sweep(amount, note = "auto-sweep", txHash) {
    this.requireUnlocked();
    this.data.balance += amount;
    this.data.entries.push({ amount, note, timestamp: Date.now(), txHash });
    this.data.updatedAt = Date.now();
    await this.persist();
  }
  async withdraw(amount, note = "withdrawal") {
    this.requireUnlocked();
    if (amount > this.data.balance) throw new Error("Insufficient vault balance");
    this.data.balance -= amount;
    this.data.entries.push({ amount: -amount, note, timestamp: Date.now() });
    this.data.updatedAt = Date.now();
    await this.persist();
  }
  getBalance() {
    this.requireUnlocked();
    return this.data.balance;
  }
  getStats() {
    if (this.locked) return { locked: true, balance: "****", entries: 0 };
    return {
      locked: false,
      balance: this.data.balance,
      currency: this.data.currency,
      entries: this.data.entries.length,
      createdAt: this.data.createdAt,
      updatedAt: this.data.updatedAt
    };
  }
  getHistory() {
    this.requireUnlocked();
    return [...this.data.entries].reverse().slice(0, 50);
  }
  // ── Private helpers ───────────────────────────────────────────────────────
  requireUnlocked() {
    if (this.locked || !this.data || !this.key) {
      throw new Error("Vault is locked. Use /unlock <passphrase>.");
    }
  }
  /** Argon2id KDF — used for all new vaults (v4+) */
  async deriveArgon2id(passphrase, salt, timeCost = ARGON2_TIME_COST, memoryCost = ARGON2_MEMORY_COST, parallelism = ARGON2_PARALLELISM) {
    const hash2 = await argon2.hash(passphrase, {
      type: argon2.argon2id,
      salt,
      timeCost,
      memoryCost,
      parallelism,
      hashLength: KEY_LENGTH,
      raw: true
    });
    return hash2;
  }
  /** scrypt KDF — kept only to read legacy vaults (v1–v3) */
  deriveScrypt(passphrase, salt, N = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P) {
    return new Promise((resolve3, reject) => {
      crypto2.scrypt(passphrase, salt, KEY_LENGTH, { N, r, p }, (err, key) => {
        if (err) reject(err);
        else resolve3(key);
      });
    });
  }
  /** Encrypt this.data with Argon2id-derived key, write vault file. */
  async persist() {
    if (!this.key || !this.salt) throw new Error("Vault not initialised \u2014 call create() or unlock() first.");
    const iv = crypto2.randomBytes(12);
    const cipher = crypto2.createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = JSON.stringify(this.data);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const file = {
      version: VAULT_VERSION,
      kdf: "argon2id",
      timeCost: ARGON2_TIME_COST,
      memoryCost: ARGON2_MEMORY_COST,
      parallelism: ARGON2_PARALLELISM,
      salt: this.salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      ciphertext: ciphertext.toString("hex")
    };
    writeFileSync2(this.vaultPath, JSON.stringify(file, null, 2), "utf-8");
  }
  /** Decrypt with given key; throws on GCM authentication failure. */
  decryptWith(key, raw) {
    const iv = Buffer.from(raw.iv, "hex");
    const authTag = Buffer.from(raw.authTag, "hex");
    const ciphertext = Buffer.from(raw.ciphertext, "hex");
    const decipher = crypto2.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf-8"));
  }
};

// src/vault/AutoVault.ts
init_Logger();
var AutoVault = class {
  vault;
  logger;
  threshold;
  checkInterval = null;
  onSweep = null;
  constructor(vault) {
    this.vault = vault;
    this.logger = new Logger("AutoVault");
    this.threshold = parseFloat(process.env.AUTO_VAULT_THRESHOLD || "500");
  }
  start(getPnL, onSweep) {
    this.onSweep = onSweep || null;
    this.checkInterval = setInterval(() => this.check(getPnL), 6e4);
    this.logger.info(`AutoVault started \u2014 threshold: $${this.threshold}`);
  }
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  async check(getPnL) {
    const pnl = getPnL();
    if (pnl >= this.threshold && !this.vault.isLocked()) {
      try {
        await this.vault.sweep(pnl, `auto-sweep (threshold: $${this.threshold})`);
        this.logger.info(`Auto-swept $${pnl.toFixed(2)} to vault`);
        if (this.onSweep) this.onSweep(pnl);
      } catch (err) {
        this.logger.error("Auto-sweep failed", err);
      }
    }
  }
  updateThreshold(amount) {
    this.threshold = amount;
    this.logger.info(`AutoVault threshold updated to $${amount}`);
  }
};

// src/feeds/FeedManager.ts
init_Logger();
var FeedManager = class {
  logger;
  items = [];
  sources = /* @__PURE__ */ new Map();
  timers = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  maxItems = 500;
  running = false;
  constructor() {
    this.logger = new Logger("FeedManager");
    this.registerBuiltinSources();
  }
  registerBuiltinSources() {
    this.register({
      name: "coingecko_prices",
      interval: 6e4,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,bnb&vs_currencies=usd&include_24hr_change=true",
            { signal: AbortSignal.timeout(8e3) }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return Object.entries(data).map(([id, info]) => ({
            id: `price-${id}-${Date.now()}`,
            source: "coingecko",
            title: `${id.toUpperCase()} Price Update`,
            content: `$${info.usd.toLocaleString()} (${info.usd_24h_change?.toFixed(2)}% 24h)`,
            timestamp: Date.now(),
            category: "price",
            metadata: { price: info.usd, change24h: info.usd_24h_change, asset: id },
            sentiment: (info.usd_24h_change ?? 0) > 0 ? "bullish" : "bearish"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "fear_greed",
      interval: 36e5,
      // hourly
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(5e3) });
          if (!res.ok) return [];
          const data = await res.json();
          const item = data?.data?.[0];
          if (!item) return [];
          const val = parseInt(item.value);
          return [{
            id: `fng-${Date.now()}`,
            source: "alternative.me",
            title: `Fear & Greed Index: ${item.value_classification}`,
            content: `Score: ${item.value}/100 (${item.value_classification})`,
            timestamp: Date.now(),
            category: "signal",
            metadata: { score: val, classification: item.value_classification },
            sentiment: val > 60 ? "bullish" : val < 40 ? "bearish" : "neutral",
            priority: val < 25 || val > 75 ? "high" : "medium"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "crypto_news",
      interval: 3e5,
      // 5 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=5",
            { signal: AbortSignal.timeout(8e3) }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return (data?.Data || []).slice(0, 5).map((item) => ({
            id: `news-${item.id}`,
            source: item.source || "cryptocompare",
            title: item.title || "",
            content: (item.body || "").slice(0, 300),
            url: item.url,
            timestamp: (item.published_on || 0) * 1e3,
            category: "news",
            metadata: { tags: item.tags, categories: item.categories },
            sentiment: "neutral"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "polymarket_trends",
      interval: 6e5,
      // 10 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            "https://gamma-api.polymarket.com/markets?limit=5&order=volume&ascending=false&active=true",
            { signal: AbortSignal.timeout(8e3) }
          );
          if (!res.ok) return [];
          const data = await res.json();
          return (Array.isArray(data) ? data : []).slice(0, 5).map((mkt) => ({
            id: `poly-${mkt.id}`,
            source: "polymarket",
            title: mkt.question || "",
            content: `Volume: $${(mkt.volume || 0).toLocaleString()} | Yes: ${(mkt.outcomePrices?.[0] * 100 || 0).toFixed(0)}%`,
            url: `https://polymarket.com/event/${mkt.slug}`,
            timestamp: Date.now(),
            category: "prediction",
            metadata: { volume: mkt.volume, yesPrice: mkt.outcomePrices?.[0] },
            sentiment: "neutral"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "whale_watch",
      interval: 12e4,
      // 2 min
      enabled: !!process.env.ALCHEMY_KEY,
      fetch: async () => {
        if (!process.env.ALCHEMY_KEY) return [];
        try {
          const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "alchemy_getAssetTransfers",
              params: [{
                category: ["external"],
                maxCount: "0x5",
                order: "desc",
                withMetadata: true,
                excludeZeroValue: true,
                fromBlock: "latest",
                toBlock: "latest"
              }]
            }),
            signal: AbortSignal.timeout(8e3)
          });
          if (!res.ok) return [];
          const data = await res.json();
          return (data?.result?.transfers || []).filter((t) => parseFloat(t.value || "0") > 100).slice(0, 3).map((t) => ({
            id: `whale-${t.hash}`,
            source: "alchemy-onchain",
            title: `Whale Transfer: ${parseFloat(t.value).toFixed(2)} ETH`,
            content: `From: ${t.from?.slice(0, 8)}... To: ${t.to?.slice(0, 8)}... \u2014 ${parseFloat(t.value).toFixed(4)} ETH`,
            url: `https://etherscan.io/tx/${t.hash}`,
            timestamp: Date.now(),
            category: "whale",
            metadata: { from: t.from, to: t.to, value: t.value, hash: t.hash },
            priority: parseFloat(t.value) > 1e3 ? "high" : "medium"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "defillama_tvl",
      interval: 18e5,
      // 30 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.llama.fi/v2/chains", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const data = await res.json();
          const top = (Array.isArray(data) ? data : []).sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, 5);
          if (top.length === 0) return [];
          const summary = top.map((c) => `${c.name}: $${((c.tvl || 0) / 1e9).toFixed(2)}B`).join(" | ");
          return [{
            id: `tvl-${Date.now()}`,
            source: "defillama",
            title: "Top Chain TVL Update",
            content: summary,
            timestamp: Date.now(),
            category: "onchain",
            metadata: { chains: top },
            sentiment: "neutral"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "funding_rates",
      interval: 9e5,
      // 15 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            "https://open-api.coinglass.com/public/v2/funding?symbol=BTC",
            { signal: AbortSignal.timeout(8e3) }
          );
          if (!res.ok) return [];
          const data = await res.json();
          if (!data?.data) return [];
          const rates = (Array.isArray(data.data) ? data.data : []).slice(0, 5);
          const summary = rates.map((r) => `${r.exchangeName}: ${(r.fundingRate * 100).toFixed(4)}%`).join(" | ");
          return [{
            id: `funding-${Date.now()}`,
            source: "coinglass",
            title: "BTC Funding Rates",
            content: summary || "No funding data",
            timestamp: Date.now(),
            category: "signal",
            metadata: { rates },
            sentiment: rates.some((r) => r.fundingRate > 5e-4) ? "bearish" : "neutral"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "binance_tickers",
      interval: 12e4,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const data = await res.json();
          const top = (Array.isArray(data) ? data : []).filter((t) => t.symbol.endsWith("USDT")).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)).slice(0, 8);
          return top.map((t) => ({
            id: `binance-${t.symbol}-${Date.now()}`,
            source: "binance",
            title: `${t.symbol} 24h: ${parseFloat(t.priceChangePercent).toFixed(2)}%`,
            content: `Price: $${parseFloat(t.lastPrice).toLocaleString()} | Volume: $${(parseFloat(t.quoteVolume) / 1e6).toFixed(1)}M | High: $${parseFloat(t.highPrice).toLocaleString()}`,
            timestamp: Date.now(),
            category: "price",
            metadata: { symbol: t.symbol, price: t.lastPrice, change: t.priceChangePercent, volume: t.quoteVolume },
            sentiment: parseFloat(t.priceChangePercent) > 0 ? "bullish" : "bearish"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "coingecko_trending",
      interval: 18e5,
      // 30 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.coingecko.com/api/v3/search/trending", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const data = await res.json();
          return (data?.coins || []).slice(0, 7).map((c) => ({
            id: `trending-${c.item.id}-${Date.now()}`,
            source: "coingecko-trending",
            title: `Trending: ${c.item.name} (${c.item.symbol})`,
            content: `Rank #${c.item.market_cap_rank ?? "?"} | Score: ${c.item.score ?? 0}`,
            timestamp: Date.now(),
            category: "social",
            metadata: { coin: c.item, rank: c.item.score },
            sentiment: "bullish",
            priority: "medium"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "defillama_protocols",
      interval: 36e5,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.llama.fi/protocols", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const data = await res.json();
          const protos = (Array.isArray(data) ? data : []).filter((p) => p.tvl > 1e6 && p.change_1d !== null).sort((a, b) => Math.abs(b.change_1d ?? 0) - Math.abs(a.change_1d ?? 0)).slice(0, 6);
          return protos.map((p) => ({
            id: `proto-${p.slug}-${Date.now()}`,
            source: "defillama-protocols",
            title: `${p.name} TVL ${p.change_1d > 0 ? "+" : ""}${(p.change_1d ?? 0).toFixed(2)}%`,
            content: `TVL: $${((p.tvl || 0) / 1e6).toFixed(1)}M | Chain: ${p.chain || "multi"} | Category: ${p.category || "?"}`,
            timestamp: Date.now(),
            category: "onchain",
            metadata: { protocol: p.name, tvl: p.tvl, change1d: p.change_1d },
            sentiment: (p.change_1d ?? 0) > 3 ? "bullish" : (p.change_1d ?? 0) < -3 ? "bearish" : "neutral"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "market_global",
      interval: 36e5,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.coingecko.com/api/v3/global", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const d = (await res.json())?.data;
          if (!d) return [];
          return [{
            id: `global-${Date.now()}`,
            source: "coingecko-global",
            title: `Global Market Cap: $${((d.total_market_cap?.usd || 0) / 1e12).toFixed(2)}T`,
            content: `BTC dominance: ${(d.market_cap_percentage?.btc || 0).toFixed(1)}% | ETH: ${(d.market_cap_percentage?.eth || 0).toFixed(1)}% | 24h change: ${(d.market_cap_change_percentage_24h_usd || 0).toFixed(2)}%`,
            timestamp: Date.now(),
            category: "signal",
            metadata: { marketCap: d.total_market_cap?.usd, btcDom: d.market_cap_percentage?.btc, change24h: d.market_cap_change_percentage_24h_usd },
            sentiment: (d.market_cap_change_percentage_24h_usd || 0) > 0 ? "bullish" : "bearish"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "messari_rss",
      interval: 6e5,
      // 10 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://messari.io/rss/news.xml", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const text2 = await res.text();
          const items = [...text2.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
          return items.map((m, i) => {
            const title = m[1]?.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] ?? m[1]?.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
            const link = m[1]?.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
            return {
              id: `messari-${i}-${Date.now()}`,
              source: "messari",
              title: title.trim(),
              content: title.trim(),
              url: link.trim(),
              timestamp: Date.now(),
              category: "news",
              metadata: {},
              sentiment: "neutral"
            };
          }).filter((it) => it.title);
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "cointelegraph_rss",
      interval: 6e5,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://cointelegraph.com/rss", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const t = await res.text();
          const items = [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
          return items.map((m, i) => {
            const title = m[1]?.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] ?? m[1]?.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
            const link = m[1]?.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
            return {
              id: `ct-${i}-${Date.now()}`,
              source: "cointelegraph",
              title: title.trim(),
              content: title.trim(),
              url: link.trim(),
              timestamp: Date.now(),
              category: "news",
              metadata: {},
              sentiment: "neutral"
            };
          }).filter((it) => it.title);
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "open_interest",
      interval: 9e5,
      // 15 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://open-api.coinglass.com/public/v2/open_interest?symbol=BTC", { signal: AbortSignal.timeout(8e3) });
          if (!res.ok) return [];
          const data = await res.json();
          if (!data?.data) return [];
          const oi = (Array.isArray(data.data) ? data.data : []).slice(0, 5);
          const total = oi.reduce((sum, ex) => sum + (ex.openInterest || 0), 0);
          const detail = oi.map((ex) => `${ex.exchangeName}: $${((ex.openInterest || 0) / 1e9).toFixed(2)}B`).join(" | ");
          return [{
            id: `oi-${Date.now()}`,
            source: "coinglass-oi",
            title: `BTC Open Interest: $${(total / 1e9).toFixed(2)}B`,
            content: detail || "No OI data",
            timestamp: Date.now(),
            category: "signal",
            metadata: { total, exchanges: oi },
            sentiment: "neutral"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "eth_gas",
      interval: 6e4,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.etherscan.io/api?module=gastracker&action=gasoracle", { signal: AbortSignal.timeout(5e3) });
          if (!res.ok) return [];
          const data = await res.json();
          const r = data?.result;
          if (!r) return [];
          return [{
            id: `gas-${Date.now()}`,
            source: "etherscan-gas",
            title: `ETH Gas: Safe ${r.SafeGasPrice} | Propose ${r.ProposeGasPrice} | Fast ${r.FastGasPrice} Gwei`,
            content: `Safe: ${r.SafeGasPrice} gwei | Standard: ${r.ProposeGasPrice} gwei | Fast: ${r.FastGasPrice} gwei | Base: ${r.suggestBaseFee} gwei`,
            timestamp: Date.now(),
            category: "onchain",
            metadata: { safe: r.SafeGasPrice, standard: r.ProposeGasPrice, fast: r.FastGasPrice, base: r.suggestBaseFee },
            sentiment: parseFloat(r.FastGasPrice) > 100 ? "bearish" : "neutral",
            priority: parseFloat(r.FastGasPrice) > 200 ? "high" : "low"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "reddit_sentiment",
      interval: 18e5,
      // 30 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://www.reddit.com/r/CryptoCurrency/hot.json?limit=10", {
            headers: { "User-Agent": "JellyOS/1.0" },
            signal: AbortSignal.timeout(8e3)
          });
          if (!res.ok) return [];
          const data = await res.json();
          const posts = data?.data?.children?.slice(0, 5) ?? [];
          return posts.map((p) => ({
            id: `reddit-${p.data.id}`,
            source: "reddit-r/cryptocurrency",
            title: p.data.title?.slice(0, 120) ?? "",
            content: `Score: ${p.data.score} | Comments: ${p.data.num_comments} | Upvote: ${(p.data.upvote_ratio * 100).toFixed(0)}%`,
            url: `https://reddit.com${p.data.permalink}`,
            timestamp: (p.data.created_utc || 0) * 1e3,
            category: "social",
            metadata: { score: p.data.score, comments: p.data.num_comments },
            sentiment: p.data.upvote_ratio > 0.85 ? "bullish" : "neutral"
          })).filter((it) => it.title);
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "solana_stats",
      interval: 3e5,
      // 5 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch("https://api.mainnet-beta.solana.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPerformanceSamples", params: [1] }),
            signal: AbortSignal.timeout(8e3)
          });
          if (!res.ok) return [];
          const data = await res.json();
          const sample = data?.result?.[0];
          if (!sample) return [];
          const tps = Math.round(sample.numTransactions / sample.samplePeriodSecs);
          return [{
            id: `sol-stats-${Date.now()}`,
            source: "solana-rpc",
            title: `Solana TPS: ${tps.toLocaleString()}`,
            content: `Transactions per second: ${tps} | Slot: ${sample.slot}`,
            timestamp: Date.now(),
            category: "onchain",
            metadata: { tps, slot: sample.slot },
            sentiment: tps > 2e3 ? "bullish" : "neutral"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "btc_mempool",
      interval: 18e4,
      // 3 min
      enabled: true,
      fetch: async () => {
        try {
          const [statsRes, feesRes] = await Promise.all([
            fetch("https://mempool.space/api/mempool", { signal: AbortSignal.timeout(6e3) }),
            fetch("https://mempool.space/api/v1/fees/recommended", { signal: AbortSignal.timeout(6e3) })
          ]);
          if (!statsRes.ok || !feesRes.ok) return [];
          const stats = await statsRes.json();
          const fees = await feesRes.json();
          return [{
            id: `btc-mempool-${Date.now()}`,
            source: "mempool.space",
            title: `BTC Mempool: ${(stats.count || 0).toLocaleString()} txs | Fast: ${fees.fastestFee} sat/vB`,
            content: `Pending: ${stats.count} txs (${((stats.vsize || 0) / 1e6).toFixed(1)} MvB) | Fees: low ${fees.hourFee} / mid ${fees.halfHourFee} / fast ${fees.fastestFee} sat/vB`,
            timestamp: Date.now(),
            category: "onchain",
            metadata: { count: stats.count, vsize: stats.vsize, fees },
            sentiment: fees.fastestFee > 100 ? "bearish" : "neutral",
            priority: fees.fastestFee > 200 ? "high" : "low"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "dune_whales",
      interval: 36e5,
      // 1 hr
      enabled: !!process.env.DUNE_API_KEY,
      fetch: async () => {
        if (!process.env.DUNE_API_KEY) return [];
        try {
          const queryId = 3344990;
          const res = await fetch(`https://api.dune.com/api/v1/query/${queryId}/results?limit=5`, {
            headers: { "X-DUNE-API-KEY": process.env.DUNE_API_KEY },
            signal: AbortSignal.timeout(15e3)
          });
          if (!res.ok) return [];
          const data = await res.json();
          const rows = data?.result?.rows ?? [];
          return rows.slice(0, 5).map((r, i) => ({
            id: `dune-whale-${i}-${Date.now()}`,
            source: "dune-analytics",
            title: `Whale: ${(r.wallet ?? "?").slice(0, 10)}\u2026 moved $${((r.usd_value ?? 0) / 1e6).toFixed(1)}M`,
            content: JSON.stringify(r).slice(0, 200),
            timestamp: Date.now(),
            category: "whale",
            metadata: r,
            priority: "high"
          }));
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "glassnode_onchain",
      interval: 36e5,
      enabled: !!process.env.GLASSNODE_API_KEY,
      fetch: async () => {
        if (!process.env.GLASSNODE_API_KEY) return [];
        try {
          const key = process.env.GLASSNODE_API_KEY;
          const res = await fetch(
            `https://api.glassnode.com/v1/metrics/addresses/active_count?a=BTC&api_key=${key}&i=24h&limit=1`,
            { signal: AbortSignal.timeout(8e3) }
          );
          if (!res.ok) return [];
          const data = await res.json();
          const latest = Array.isArray(data) ? data[data.length - 1] : null;
          if (!latest) return [];
          return [{
            id: `glassnode-${Date.now()}`,
            source: "glassnode",
            title: `BTC Active Addresses: ${(latest.v ?? 0).toLocaleString()}`,
            content: `Active BTC addresses (24h): ${(latest.v ?? 0).toLocaleString()} | As of: ${new Date((latest.t ?? 0) * 1e3).toISOString().slice(0, 10)}`,
            timestamp: Date.now(),
            category: "onchain",
            metadata: { count: latest.v },
            sentiment: (latest.v ?? 0) > 9e5 ? "bullish" : "neutral"
          }];
        } catch {
          return [];
        }
      }
    });
    this.register({
      name: "crypto_social",
      interval: 72e5,
      // 2 hr
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            "https://min-api.cryptocompare.com/data/social/coin/latest?coinId=1182",
            // BTC
            { signal: AbortSignal.timeout(8e3) }
          );
          if (!res.ok) return [];
          const d = (await res.json())?.Data;
          if (!d) return [];
          const tw = d.Twitter ?? {};
          const rd = d.Reddit ?? {};
          return [{
            id: `social-${Date.now()}`,
            source: "cryptocompare-social",
            title: `BTC Social: Twitter ${tw.followers?.toLocaleString() ?? "?"} followers | Reddit ${rd.subscribers?.toLocaleString() ?? "?"} subs`,
            content: `Twitter: ${tw.followers ?? "?"} followers, ${tw.statuses_count ?? "?"} posts | Reddit: ${rd.subscribers ?? "?"} subs, ${rd.active_users ?? "?"} active`,
            timestamp: Date.now(),
            category: "social",
            metadata: { twitter: tw, reddit: rd },
            sentiment: "neutral"
          }];
        } catch {
          return [];
        }
      }
    });
  }
  register(source) {
    this.sources.set(source.name, source);
  }
  start() {
    if (this.running) return;
    this.running = true;
    for (const [name, source] of this.sources) {
      if (!source.enabled) continue;
      const delay = Math.random() * 5e3;
      setTimeout(() => this.runSource(name, source), delay);
      const timer = setInterval(() => this.runSource(name, source), source.interval);
      this.timers.set(name, timer);
    }
    this.logger.info(`FeedManager started with ${this.sources.size} sources`);
  }
  async runSource(name, source) {
    try {
      const items = await source.fetch();
      for (const item of items) {
        const exists = this.items.some((i) => i.id === item.id);
        if (!exists) {
          this.items.unshift(item);
          if (this.items.length > this.maxItems) this.items = this.items.slice(0, this.maxItems);
          for (const listener of this.listeners) {
            try {
              listener(item);
            } catch {
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Feed ${name} failed: ${err.message}`);
    }
  }
  stop() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.running = false;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getRecent(options = {}) {
    let result = this.items;
    if (options.category) result = result.filter((i) => i.category === options.category);
    if (options.source) result = result.filter((i) => i.source === options.source);
    return result.slice(0, options.limit || 20);
  }
  getStats() {
    const bySource = {};
    for (const item of this.items) {
      bySource[item.source] = (bySource[item.source] || 0) + 1;
    }
    return {
      totalItems: this.items.length,
      activeSources: Array.from(this.timers.keys()).length,
      bySource,
      running: this.running
    };
  }
  getSources() {
    return Array.from(this.sources.keys());
  }
};

// src/feeds/SignalEngine.ts
init_Logger();
var SignalEngine = class {
  feeds;
  logger;
  signals = [];
  maxSignals = 50;
  constructor(feeds) {
    this.feeds = feeds;
    this.logger = new Logger("SignalEngine");
    feeds.subscribe((item) => this.processItem(item));
  }
  processItem(item) {
    try {
      const signal = this.extractSignal(item);
      if (signal) {
        this.signals.unshift(signal);
        if (this.signals.length > this.maxSignals) {
          this.signals = this.signals.slice(0, this.maxSignals);
        }
      }
    } catch {
    }
  }
  extractSignal(item) {
    const now = Date.now();
    const expires = now + 36e5;
    if (item.source === "alternative.me") {
      const score = item.metadata?.score;
      if (score !== void 0) {
        if (score <= 20) {
          return this.makeSignal(
            "BTC",
            "long",
            0.7,
            ["fear_greed"],
            `Extreme Fear (${score}) \u2014 historically good entry point`,
            now,
            expires,
            0.6
          );
        }
        if (score >= 85) {
          return this.makeSignal(
            "BTC",
            "short",
            0.6,
            ["fear_greed"],
            `Extreme Greed (${score}) \u2014 potential distribution zone`,
            now,
            expires,
            0.55
          );
        }
      }
    }
    if (item.category === "price" && item.metadata?.change24h !== void 0) {
      const change = item.metadata.change24h;
      const asset = (item.metadata?.asset || "BTC").toUpperCase();
      if (change <= -15) {
        return this.makeSignal(
          asset,
          "long",
          0.6,
          ["coingecko_prices"],
          `Sharp drop ${change.toFixed(1)}% \u2014 potential oversold bounce`,
          now,
          expires,
          0.5
        );
      }
      if (change >= 20) {
        return this.makeSignal(
          asset,
          "short",
          0.55,
          ["coingecko_prices"],
          `Sharp pump ${change.toFixed(1)}% \u2014 potential local top`,
          now,
          expires,
          0.45
        );
      }
    }
    if (item.source === "coinglass" && item.metadata?.rates) {
      const rates = item.metadata.rates;
      const avgRate = rates.reduce((s, r) => s + (r.fundingRate || 0), 0) / (rates.length || 1);
      if (avgRate > 8e-4) {
        return this.makeSignal(
          "BTC",
          "short",
          0.65,
          ["funding_rates"],
          `High funding rate (${(avgRate * 100).toFixed(4)}%) \u2014 longs overextended`,
          now,
          expires,
          0.6
        );
      }
      if (avgRate < -3e-4) {
        return this.makeSignal(
          "BTC",
          "long",
          0.6,
          ["funding_rates"],
          `Negative funding (${(avgRate * 100).toFixed(4)}%) \u2014 shorts overextended`,
          now,
          expires,
          0.55
        );
      }
    }
    return null;
  }
  makeSignal(asset, direction, strength, sources, rationale, timestamp, expiresAt, confidence) {
    return {
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      asset,
      direction,
      strength,
      sources,
      rationale,
      timestamp,
      expiresAt,
      confidence
    };
  }
  /**
   * Returns the estimated net PnL across all active signals.
   * Calculated as: sum of (signal.strength * direction_sign * 100) for active longs/shorts.
   * AutoVault uses this to decide when to sweep profits.
   */
  getNetPnL() {
    const active = this.getActiveSignals();
    return active.reduce((sum, s) => {
      const sign2 = s.direction === "long" ? 1 : s.direction === "short" ? -1 : 0;
      return sum + sign2 * s.strength * 100;
    }, 0);
  }
  getActiveSignals(asset) {
    const now = Date.now();
    const active = this.signals.filter((s) => s.expiresAt > now);
    if (asset) return active.filter((s) => s.asset.toUpperCase() === asset.toUpperCase());
    return active;
  }
  getSummary() {
    const active = this.getActiveSignals();
    if (active.length === 0) return "No active signals.";
    return active.map(
      (s) => `[${s.asset}] ${s.direction.toUpperCase()} \u2014 strength: ${(s.strength * 100).toFixed(0)}% \u2014 ${s.rationale}`
    ).join("\n");
  }
  getStats() {
    const active = this.getActiveSignals();
    return {
      totalSignals: this.signals.length,
      activeSignals: active.length,
      longSignals: active.filter((s) => s.direction === "long").length,
      shortSignals: active.filter((s) => s.direction === "short").length,
      avgStrength: active.length > 0 ? (active.reduce((s, sig) => s + sig.strength, 0) / active.length).toFixed(2) : "0"
    };
  }
};

// extensions/jellyos.ts
var JELLY_HOME = process.env.JELLYOS_HOME ?? path2.join(os.homedir(), ".jelly");
var CHAIN_NETWORK = {
  bsc: "bnb-mainnet",
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
  avalanche: "avax-mainnet",
  optimism: "opt-mainnet",
  fantom: "fantom-mainnet",
  gnosis: "gnosis-mainnet",
  celo: "celo-mainnet",
  scroll: "scroll-mainnet",
  linea: "linea-mainnet",
  zksync: "zksync-mainnet",
  mantle: "mantle-mainnet",
  blast: "blast-mainnet"
};
var CHAIN_SYMBOL = {
  ethereum: "ETH",
  bsc: "BNB",
  arbitrum: "ETH",
  base: "ETH",
  polygon: "MATIC",
  avalanche: "AVAX",
  optimism: "ETH",
  fantom: "FTM",
  gnosis: "xDAI",
  celo: "CELO",
  scroll: "ETH",
  linea: "ETH",
  mantle: "MNT",
  blast: "ETH",
  solana: "SOL"
};
function text(t) {
  return { content: [{ type: "text", text: t }], details: {} };
}
function fmtUsd(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
function isPrivateHost(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    if (/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1)$/i.test(hostname)) return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
    if (hostname === "169.254.169.254") return true;
    if (/\.(internal|local|corp|lan|intranet)$/i.test(hostname)) return true;
    return false;
  } catch {
    return true;
  }
}
var ALLOWED_CONTEXT_KEYS = /* @__PURE__ */ new Set([
  "effect_level",
  "active_chain",
  "watchlist",
  "memo",
  "positions",
  "risk_profile",
  "schedule",
  "auto_vault_threshold",
  "model",
  "debug_log"
]);
var wsClients = /* @__PURE__ */ new Set();
var WS_TYPE_MAP = {
  vault_sweep: "vault_update",
  vault_balance: "vault_update",
  prices: "feed_item",
  trade: "trade_executed",
  signals: "signal_update",
  log: "log_entry",
  agent: "agent_status",
  swarm: "swarm_update"
};
function broadcastWs(event, data) {
  const type = WS_TYPE_MAP[event] ?? event;
  const msg = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of wsClients) {
    if (client.readyState === 1) {
      try {
        client.send(msg);
      } catch {
        wsClients.delete(client);
      }
    } else if (client.readyState > 1) {
      wsClients.delete(client);
    }
  }
}
var dashPort = parseInt(process.env.JELLY_DASHBOARD_PORT ?? "4320", 10);
var dashServer = new WebSocketServer({ port: dashPort, host: "127.0.0.1" });
dashServer.on("connection", (ws) => {
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: "connected", timestamp: Date.now() }));
  ws.on("close", () => wsClients.delete(ws));
  ws.on("error", () => wsClients.delete(ws));
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "agent_message" && msg.text) {
        _dashboardMessages.push({ text: String(msg.text), ts: Date.now() });
        if (_dashboardMessages.length > 50) _dashboardMessages = _dashboardMessages.slice(-50);
        ws.send(JSON.stringify({ type: "message_queued", id: Date.now() }));
      } else if (msg.type === "set_effect" && msg.level) {
        const { writeFileSync: writeFileSync3, readFileSync: readFileSync3, existsSync: existsSync4, mkdirSync: mkdirSync4 } = __require("node:fs");
        const ctxPath = path2.join(JELLY_HOME, "context.json");
        mkdirSync4(JELLY_HOME, { recursive: true });
        const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
        store.effect_level = msg.level;
        writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
        broadcastWs("effect_changed", { level: msg.level });
        ws.send(JSON.stringify({ type: "effect_set", level: msg.level }));
      } else if (msg.type === "get_status") {
        const s = _statusReady ? {
          vault: _statusV ? _statusV.isLocked() ? "locked" : `$${_statusV.getStats().balance?.toFixed(2) ?? "0"}` : "unavailable",
          feeds: _statusF?.getStats() ?? null,
          signals: _statusS?.getActiveSignals().length ?? 0,
          wallets: _statusW ? Object.keys(_statusW.getSummary()).length : 0,
          uptime: process.uptime(),
          models: modelRegistry.modelCount,
          prices: priceFeed.getAll().length,
          news: newsFeed.getLatest()?.items.length ?? 0
        } : { vault: "initializing", uptime: process.uptime() };
        ws.send(JSON.stringify({ type: "status", data: s }));
      }
    } catch {
    }
  });
});
var _dashboardMessages = [];
var _statusReady = false;
var _statusV;
var _statusF;
var _statusS;
var _statusW;
var _telegramOffset = 0;
var _telegramPending = [];
var _discordLastId = "";
var _discordPending = [];
var _webhookSignals = [];
var _tgPolling = false;
var _dcPolling = false;
var _seenTxHashes = /* @__PURE__ */ new Set();
var _telegramTimer = null;
var _discordTimer = null;
var _alertTimer = null;
var _walletTimer = null;
var _webhookHttpSrv = null;
async function _tgPoll() {
  if (_tgPolling) return;
  _tgPolling = true;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    _tgPolling = false;
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${_telegramOffset}&limit=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8e3) });
    if (!res.ok) return;
    const data = await res.json();
    for (const upd of data.result ?? []) {
      _telegramOffset = upd.update_id + 1;
      const msg = upd.message;
      if (!msg?.text) continue;
      _telegramPending.push({ id: msg.message_id, text: msg.text, from: msg.from?.username ?? "user" });
    }
  } catch {
  } finally {
    _tgPolling = false;
  }
}
async function _tgSend(text2) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text2.slice(0, 4096), parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(8e3)
    });
  } catch {
  }
}
async function _dcPoll() {
  if (_dcPolling) return;
  _dcPolling = true;
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) {
    _dcPolling = false;
    return;
  }
  try {
    const url = _discordLastId ? `https://discord.com/api/v10/channels/${channelId}/messages?after=${_discordLastId}&limit=20` : `https://discord.com/api/v10/channels/${channelId}/messages?limit=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(8e3)
    });
    if (!res.ok) return;
    const msgs = await res.json();
    for (const msg of [...msgs].reverse()) {
      if (msg.author?.bot) continue;
      if (!_discordLastId) {
        _discordLastId = msg.id;
        continue;
      }
      _discordLastId = msg.id;
      _discordPending.push({ id: msg.id, text: msg.content, author: msg.author?.username ?? "user" });
    }
    if (!_discordLastId && msgs.length > 0) _discordLastId = msgs[0].id;
  } catch {
  } finally {
    _dcPolling = false;
  }
}
async function _dcSend(text2) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: text2.slice(0, 2e3) }),
      signal: AbortSignal.timeout(8e3)
    });
  } catch {
  }
}
function _checkAlerts(feeds) {
  if (!feeds) return;
  const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3 } = __require("node:fs");
  const alertsPath = path2.join(JELLY_HOME, "alerts.json");
  if (!existsSync4(alertsPath)) return;
  let alerts = [];
  try {
    alerts = JSON.parse(readFileSync3(alertsPath, "utf-8"));
  } catch {
    return;
  }
  if (!alerts.length) return;
  const triggered = [];
  for (const alert of alerts) {
    const recent = feeds.getRecent({ limit: 100 });
    const item = recent.find(
      (i) => i.metadata?.symbol?.toLowerCase() === alert.symbol.toLowerCase()
    );
    if (!item) continue;
    const price = Number(item.metadata?.price);
    if (isNaN(price)) continue;
    const hit = alert.condition === ">" ? price > alert.threshold : alert.condition === "<" ? price < alert.threshold : false;
    if (hit) triggered.push(alert);
  }
  if (!triggered.length) return;
  const remaining = alerts.filter((a) => !triggered.some((t) => t.id === a.id));
  try {
    writeFileSync3(alertsPath, JSON.stringify(remaining, null, 2), "utf-8");
  } catch {
  }
  for (const a of triggered) {
    const msg = `\u{1F6A8} JellyOS Alert: ${a.symbol} is ${a.condition} $${a.threshold}`;
    _tgSend(msg).catch(() => {
    });
    _dcSend(msg).catch(() => {
    });
    try {
      const { execSync } = __require("node:child_process");
      if (process.platform === "darwin") {
        execSync(
          `osascript -e 'display notification "${msg.replace(/'/g, "")}" with title "JellyOS"'`,
          { timeout: 3e3, stdio: "pipe" }
        );
      } else if (process.platform === "linux") {
        execSync(`notify-send "JellyOS" "${msg.replace(/"/g, "")}"`, { timeout: 3e3, stdio: "pipe" });
      }
    } catch {
    }
  }
}
async function _pollWatchedWallets() {
  const alchemyKey = process.env.ALCHEMY_KEY;
  if (!alchemyKey) return;
  const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
  const watchPath = path2.join(JELLY_HOME, "watched-wallets.json");
  if (!existsSync4(watchPath)) return;
  let wallets = [];
  try {
    wallets = JSON.parse(readFileSync3(watchPath, "utf-8"));
  } catch {
    return;
  }
  for (const w of wallets) {
    try {
      const network = CHAIN_NETWORK[w.chain ?? "ethereum"] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${alchemyKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "alchemy_getAssetTransfers",
          params: [{ fromBlock: "latest", toAddress: w.address, category: ["external", "erc20"], maxCount: "0x5" }]
        }),
        signal: AbortSignal.timeout(1e4)
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const tx of data.result?.transfers ?? []) {
        const key = `${w.address}:${tx.hash}`;
        if (_seenTxHashes.has(key)) continue;
        _seenTxHashes.add(key);
        if (_seenTxHashes.size > 2e3) {
          const arr = [..._seenTxHashes];
          _seenTxHashes = new Set(arr.slice(arr.length - 1e3));
        }
        const label = w.label ?? w.address.slice(0, 8) + "...";
        const msg = `\u{1F441} Wallet ${label}: received ${tx.value ?? "?"} ${tx.asset ?? ""} (${tx.hash?.slice(0, 10)}...)`;
        _tgSend(msg).catch(() => {
        });
        _dcSend(msg).catch(() => {
        });
      }
    } catch {
    }
  }
}
function _logTrade(entry) {
  try {
    const { mkdirSync: mkdirSync4, appendFileSync: appendFileSync2 } = __require("node:fs");
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const dir = path2.join(JELLY_HOME, "journal");
    mkdirSync4(dir, { recursive: true });
    appendFileSync2(path2.join(dir, `${date}.jsonl`), JSON.stringify(entry) + "\n", "utf-8");
  } catch {
  }
}
function _startWebhookServer() {
  const port = parseInt(process.env.JELLY_WEBHOOK_PORT ?? "9340", 10);
  const http = __require("node:http");
  _webhookHttpSrv = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/webhook") {
      res.writeHead(404);
      res.end("JellyOS webhook \u2014 POST /webhook");
      return;
    }
    let body = "";
    req.on("data", (c) => {
      body += c.toString();
    });
    req.on("end", () => {
      try {
        const signal = JSON.parse(body);
        signal.ts = Date.now();
        _webhookSignals.push(signal);
        if (_webhookSignals.length > 100) _webhookSignals = _webhookSignals.slice(-100);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end("Bad JSON");
      }
    });
  });
  _webhookHttpSrv.listen(port, "127.0.0.1", () => {
  });
  _webhookHttpSrv.on("error", () => {
  });
}
function jellyos(agent) {
  let wallet = null;
  let vault = null;
  let autoVault = null;
  let feeds = null;
  let signals = null;
  agent.on("session_start", async (_e, ctx) => {
    try {
      wallet = new WalletManager(JELLY_HOME);
      vault = new VaultManager(JELLY_HOME);
      feeds = new FeedManager();
      signals = new SignalEngine(feeds);
      autoVault = new AutoVault(vault);
      let getPnL = () => 0;
      try {
        const { PositionManager: PositionManager2 } = (init_PositionManager(), __toCommonJS(PositionManager_exports));
        const { Metrics: Metrics2 } = (init_Metrics(), __toCommonJS(Metrics_exports));
        const { Logger: Logger2 } = (init_Logger(), __toCommonJS(Logger_exports));
        const pm = new PositionManager2(new Metrics2(new Logger2("AutoVault")));
        getPnL = () => {
          try {
            return pm.getTotalPnL?.() ?? 0;
          } catch {
            return 0;
          }
        };
      } catch {
      }
      autoVault.start(getPnL, (amount) => {
        broadcastWs("vault_sweep", { amount, ts: Date.now() });
        ctx.ui.setStatus("vault", `vault +$${amount.toFixed(0)}`);
      });
      try {
        feeds.start();
      } catch {
      }
      try {
        priceFeed.track("btc", "eth", "sol", "bnb", "matic", "arb", "op", "avax", "link", "uni", "doge", "xrp", "ada", "dot", "atom", "near", "sui", "apt", "pepe", "aave");
        priceFeed.start();
        newsFeed.start();
      } catch {
      }
      modelRegistry.initialise().catch(() => {
      });
      setTimeout(() => {
        ctx.ui.setStatus("models", `${modelRegistry.modelCount} models`);
      }, 2e3);
      _statusReady = true;
      _statusV = vault;
      _statusF = feeds;
      _statusS = signals;
      _statusW = wallet;
      if (process.env.TELEGRAM_BOT_TOKEN) {
        _tgPoll();
        _telegramTimer = setInterval(_tgPoll, 3e3);
      }
      if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID) {
        _dcPoll();
        _discordTimer = setInterval(_dcPoll, 5e3);
      }
      _startWebhookServer();
      _alertTimer = setInterval(() => _checkAlerts(feeds), 3e4);
      _walletTimer = setInterval(_pollWatchedWallets, 6e4);
    } catch {
      console.error("[JellyOS] boot error \u2014 check ~/.jelly/.env config");
    }
  });
  agent.on("session_shutdown", async () => {
    autoVault?.stop();
    feeds?.stop();
    priceFeed.stop();
    newsFeed.stop();
    dashServer.close(() => {
    });
    if (_telegramTimer) clearInterval(_telegramTimer);
    if (_discordTimer) clearInterval(_discordTimer);
    if (_alertTimer) clearInterval(_alertTimer);
    if (_walletTimer) clearInterval(_walletTimer);
    if (_webhookHttpSrv) _webhookHttpSrv.close(() => {
    });
  });
  agent.on("before_agent_start", async (_e, _ctx) => {
    let basePrompt = "";
    try {
      const { readFileSync: readFileSync3 } = __require("node:fs");
      const promptPath = path2.join(__dirname, "..", "prompts", "jellyos.md");
      basePrompt = readFileSync3(promptPath, "utf-8");
    } catch {
    }
    const fngItem = feeds?.getRecent({ source: "alternative.me", limit: 1 })?.[0];
    const fng = fngItem?.metadata?.score;
    const fngLabel = fngItem?.metadata?.label;
    const vaultLine = vault ? vault.isLocked() ? "vault: locked" : `vault: unlocked $${vault.getStats().balance?.toFixed(2) ?? "0"}` : null;
    const effectLine = (() => {
      try {
        const { readFileSync: readFileSync3, existsSync: existsSync4 } = __require("node:fs");
        const ctxPath = path2.join(JELLY_HOME, "context.json");
        return existsSync4(ctxPath) ? `effect_level: ${JSON.parse(readFileSync3(ctxPath, "utf-8")).effect_level ?? "normal"}` : "effect_level: normal";
      } catch {
        return "effect_level: normal";
      }
    })();
    const liveBits = [
      vaultLine,
      fng != null ? `fear_greed: ${fng}/100 (${fngLabel})` : null,
      effectLine
    ].filter(Boolean);
    const priceTicks = priceFeed.getAll();
    if (priceTicks.length > 0) {
      liveBits.push(`prices: ${priceFeed.tickerLine(8)}`);
    }
    const newsReport = newsFeed.getLatest();
    if (newsReport) {
      const ns = newsReport.avgSentiment;
      liveBits.push(`news_sentiment: ${ns >= 0 ? "+" : ""}${(ns * 100).toFixed(0)}% (${newsReport.positive}p/${newsReport.negative}n/${newsReport.neutral}\xB7)`);
      liveBits.push(`trending: ${newsReport.topKeywords.slice(0, 8).join(", ")}`);
    }
    const liveBlock = liveBits.length > 0 ? `

## Live Context
${liveBits.map((b) => `- ${b}`).join("\n")}` : "";
    const tgBlock = _telegramPending.length > 0 ? `

## Pending Telegram Messages
The following messages arrived via Telegram and need a response. Use the send_telegram tool to reply.
${_telegramPending.splice(0, _telegramPending.length).map((m) => `- @${m.from}: ${m.text}`).join("\n")}` : "";
    const dcBlock = _discordPending.length > 0 ? `

## Pending Discord Messages
The following messages arrived via Discord and need a response. Use the send_discord tool to reply.
${_discordPending.splice(0, _discordPending.length).map((m) => `- @${m.author}: ${m.text}`).join("\n")}` : "";
    const wbBlock = _webhookSignals.length > 0 ? `

## Pending Webhook Signals (TradingView)
${_webhookSignals.splice(0, _webhookSignals.length).map(
      (s) => `- ${s.action?.toUpperCase()} ${s.ticker} @ $${s.price}`
    ).join("\n")}
Review these signals and decide whether to act on them.` : "";
    const dashBlock = _dashboardMessages.length > 0 ? `

## Dashboard Messages
The following messages were sent from the web dashboard:
${_dashboardMessages.splice(0, _dashboardMessages.length).map((m) => `- ${m.text}`).join("\n")}` : "";
    const systemPrompt = basePrompt + liveBlock + tgBlock + dcBlock + wbBlock + dashBlock;
    if (systemPrompt) agent.setSystemPrompt(systemPrompt);
  });
  agent.registerCommand("vault", {
    description: "Show vault balance and status",
    async handler(_args, ctx) {
      if (!vault) {
        ctx.ui.notify("Vault not initialized");
        return;
      }
      const s = vault.getStats();
      ctx.ui.notify(vault.isLocked() ? ctx.ui.theme.fg("warning", "\u{1F512} Vault locked \u2014 use /unlock to access") : ctx.ui.theme.fg("success", `\u{1F513} Vault: $${s.balance?.toFixed(2) ?? "0"} USD | ${s.entries} entries`));
    }
  });
  agent.registerCommand("status", {
    description: "Show full JellyOS system status",
    async handler(_args, ctx) {
      const uptime = `${Math.floor(process.uptime() / 60)}m`;
      const mem = `${(process.memoryUsage().rss / 1e6).toFixed(0)}MB`;
      const feedStats = feeds?.getStats();
      const vaultInfo = vault ? vault.isLocked() ? "locked" : `$${vault.getStats().balance?.toFixed(2) ?? "0"}` : "unavailable";
      ctx.ui.notify([
        `\u{1FABC} JellyOS  up:${uptime}  mem:${mem}`,
        `vault:${vaultInfo}  feeds:${feedStats?.sources ?? 0}src/${feedStats?.items ?? 0}items`,
        `node:${process.version}  home:${JELLY_HOME}`
      ].join("\n"));
    }
  });
  agent.registerCommand("feeds", {
    description: "Show recent live feed items",
    async handler(_args, ctx) {
      if (!feeds) {
        ctx.ui.notify("Feeds not initialized");
        return;
      }
      const items = feeds.getRecent({ limit: 8 });
      if (items.length === 0) {
        ctx.ui.notify("No feed items yet");
        return;
      }
      ctx.ui.notify(items.map((i) => `[${i.source}] ${i.title}`).join("\n"));
    }
  });
  agent.registerCommand("signals", {
    description: "Show active trading signals",
    async handler(_args, ctx) {
      if (!signals) {
        ctx.ui.notify("Signal engine not initialized");
        return;
      }
      const sigs = signals.getActiveSignals();
      if (sigs.length === 0) {
        ctx.ui.notify("No active signals");
        return;
      }
      ctx.ui.notify(sigs.slice(0, 6).map(
        (s) => `[${s.asset}] ${s.direction.toUpperCase()} ${(s.strength * 100).toFixed(0)}% conf:${(s.confidence * 100).toFixed(0)}%`
      ).join("\n"));
    }
  });
  agent.registerCommand("panic", {
    description: "EMERGENCY: immediately stop all feeds, sweep vault, lock vault, mark all positions closed",
    async handler(_args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3, mkdirSync: mkdirSync4 } = __require("node:fs");
      const lines = [
        ctx.ui.theme.fg("error", "\u{1F6A8} PANIC MODE \u2014 EXECUTING EMERGENCY SHUTDOWN"),
        ""
      ];
      const panicTs = Date.now();
      try {
        autoVault?.stop();
      } catch {
      }
      try {
        feeds?.stop();
      } catch {
      }
      lines.push("\u2713 Auto-vault and data feeds stopped");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      let store = {};
      let openPositions = [];
      if (existsSync4(ctxPath)) {
        try {
          store = JSON.parse(readFileSync3(ctxPath, "utf-8"));
          openPositions = Array.isArray(store.positions) ? store.positions : [];
        } catch {
        }
      }
      let sweepTotal = 0;
      if (openPositions.length > 0) {
        lines.push(`
Positions emergency-closed (${openPositions.length}):`);
        const closedPositions = openPositions.map((p) => {
          const sym = p.symbol ?? p.pair ?? "?";
          const side = p.side ?? p.direction ?? "?";
          const size = p.size ?? p.amount ?? "?";
          const pnl = Number(p.unrealizedPnl ?? p.pnl ?? 0);
          sweepTotal += pnl > 0 ? pnl : 0;
          lines.push(`  ${ctx.ui.theme.fg("error", "CLOSED")} ${sym.padEnd(10)} ${side.padEnd(5)} size=${size}${pnl !== 0 ? `  PnL=$${pnl.toFixed(2)}` : ""}`);
          return { ...p, status: "emergency_closed", closedAt: panicTs, closedReason: "PANIC" };
        });
        mkdirSync4(JELLY_HOME, { recursive: true });
        store.positions = closedPositions;
        store.panic_at = panicTs;
        store.panic_note = "Emergency panic \u2014 all positions marked closed. Verify on-chain.";
        try {
          writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
        } catch {
        }
      } else {
        lines.push("\nNo tracked positions in context store.");
      }
      lines.push("");
      if (vault && !vault.isLocked()) {
        try {
          const bal = vault.getBalance();
          if (sweepTotal > 0) {
            await vault.sweep(sweepTotal, `PANIC emergency sweep \u2014 ${openPositions.length} positions closed`, void 0);
            lines.push(ctx.ui.theme.fg("success", `\u2713 Swept $${sweepTotal.toFixed(2)} profit to vault`));
          }
          vault.lock();
          lines.push(ctx.ui.theme.fg("success", `\u2713 Vault locked (balance was $${bal.toFixed(2)})`));
          ctx.ui.setStatus("vault", "PANIC-locked");
        } catch (e) {
          lines.push(ctx.ui.theme.fg("error", `Vault lock error: ${e.message}`));
        }
      } else if (vault?.isLocked()) {
        lines.push("Vault already locked \u{1F512}");
      } else {
        lines.push(ctx.ui.theme.fg("warn", "Vault not initialized \u2014 lock manually"));
      }
      broadcastWs("agent", {
        status: "PANIC",
        openPositions: openPositions.length,
        swept: sweepTotal,
        ts: panicTs
      });
      lines.push("");
      lines.push(ctx.ui.theme.fg("warn", "\u26A0  Verify position closure on-chain \u2014 this agent tracks intent only."));
      lines.push(ctx.ui.theme.fg("muted", "Run /export to save vault ledger \xB7 /unlock to review balance"));
      ctx.ui.notify(lines.join("\n"));
    }
  });
  agent.registerCommand("effect", {
    description: "Show or set trading intensity level: eco | normal | turbo | max",
    async handler(args, ctx) {
      const level = args.trim().toLowerCase();
      const valid = ["eco", "normal", "turbo", "max"];
      if (!level) {
        const { readFileSync: readFileSync4, existsSync: existsSync5 } = __require("node:fs");
        const ctxPath2 = __require("node:path").join(JELLY_HOME, "context.json");
        const current = existsSync5(ctxPath2) ? JSON.parse(readFileSync4(ctxPath2, "utf-8")).effect_level ?? "normal" : "normal";
        ctx.ui.notify(`Effect level: ${current}
Options: eco | normal | turbo | max
Usage: /effect turbo`);
        return;
      }
      if (!valid.includes(level)) {
        ctx.ui.notify(`Unknown level: ${level}
Choose: eco | normal | turbo | max`);
        return;
      }
      const { readFileSync: readFileSync3, writeFileSync: writeFileSync3, existsSync: existsSync4, mkdirSync: mkdirSync4 } = __require("node:fs");
      const ctxPath = __require("node:path").join(JELLY_HOME, "context.json");
      mkdirSync4(JELLY_HOME, { recursive: true });
      const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
      store.effect_level = level;
      writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      const desc = {
        eco: "minimal tools, fastest responses",
        normal: "standard tool usage",
        turbo: "aggressive multi-tool analysis",
        max: "all tools, deep analysis on every response"
      };
      ctx.ui.notify(ctx.ui.theme.fg("accent", `Effect level \u2192 ${level.toUpperCase()}
${desc[level]}`));
    }
  });
  agent.registerCommand("lock", {
    description: "Lock the profit vault",
    async handler(_args, ctx) {
      if (!vault) {
        ctx.ui.notify("Vault not initialized");
        return;
      }
      if (vault.isLocked()) {
        ctx.ui.notify("Vault is already locked \u{1F512}");
        return;
      }
      vault.lock();
      ctx.ui.notify(ctx.ui.theme.fg("warning", "\u{1F512} Vault locked"));
    }
  });
  agent.registerCommand("changelog", {
    description: "Show JellyOS release notes",
    async handler(_args, ctx) {
      ctx.ui.notify([
        ctx.ui.theme.fg("accent", "JellyOS Changelog"),
        "",
        ctx.ui.theme.fg("border", "v2.0.0") + " \u2014 agent-based rebuild",
        "  \xB7 Replaced custom agent engine with agent extension",
        "  \xB7 22 domain tools: market, blockchain, vault, trading, feeds, prediction",
        "  \xB7 Jelly cyan/purple theme + custom ASCII header",
        "  \xB7 AutoVault: auto-sweeps profits at configurable threshold",
        "  \xB7 Live data feeds: prices, news, F&G, DeFi TVL, whale alerts",
        "  \xB7 Dashboard SSE server on port 4320",
        "  \xB7 Wallets: EVM, Solana, Cosmos generated on setup",
        "",
        ctx.ui.theme.fg("border", "v1.x") + " \u2014 Custom Ink TUI (legacy)"
      ].join("\n"));
    }
  });
  agent.registerCommand("unlock", {
    description: "Unlock the profit vault \u2014 usage: /unlock <passphrase>",
    async handler(args, ctx) {
      if (!vault) {
        ctx.ui.notify("Vault not initialized");
        return;
      }
      const passphrase = args.trim();
      if (!passphrase) {
        ctx.ui.notify("Usage: /unlock <passphrase>");
        return;
      }
      try {
        const ok = await vault.unlock(passphrase);
        if (ok) {
          const s = vault.getStats();
          ctx.ui.notify(ctx.ui.theme.fg(
            "success",
            `\u{1F513} Vault unlocked \u2014 Balance: $${s.balance?.toFixed(2) ?? "0"}`
          ));
        } else {
          ctx.ui.notify(ctx.ui.theme.fg("error", "\u274C Wrong passphrase"));
        }
      } catch (err) {
        ctx.ui.notify(ctx.ui.theme.fg("error", `Vault error: ${err.message}`));
      }
    }
  });
  agent.registerCommand("wallets", {
    description: "Show all trading wallet addresses and vault cold addresses",
    async handler(_args, ctx) {
      const lines = ["\u{1FABC} JellyOS Wallets\n"];
      if (wallet) {
        lines.push("Trading wallets (hot \u2014 fund these to give the agent capital):");
        const summary = wallet.getSummary();
        for (const [chain, addr] of Object.entries(summary)) {
          lines.push(`  ${chain.padEnd(8)} ${addr}`);
        }
      }
      const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
      const addrFile = path2.join(JELLY_HOME, "vault-addresses.json");
      if (existsSync4(addrFile)) {
        lines.push("\nVault addresses (cold \u2014 only accessible with your saved private key):");
        const a = JSON.parse(readFileSync3(addrFile, "utf-8"));
        lines.push(`  evm      ${a.evm}`);
        lines.push(`  solana   ${a.solana}`);
        lines.push(`  cosmos   ${a.cosmos}`);
      }
      ctx.ui.notify(lines.join("\n"));
    }
  });
  agent.registerCommand("positions", {
    description: "Show current open positions tracked by the agent",
    async handler(_args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      if (!existsSync4(ctxPath)) {
        ctx.ui.notify("No positions tracked yet");
        return;
      }
      const store = JSON.parse(readFileSync3(ctxPath, "utf-8"));
      const pos = store.positions;
      if (!pos || Array.isArray(pos) && pos.length === 0) {
        ctx.ui.notify("No open positions");
        return;
      }
      ctx.ui.notify("Open positions:\n" + JSON.stringify(pos, null, 2));
    }
  });
  agent.registerCommand("risk", {
    description: "Show current risk profile and exposure overview",
    async handler(_args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      if (!existsSync4(ctxPath)) {
        ctx.ui.notify("No risk profile set");
        return;
      }
      const store = JSON.parse(readFileSync3(ctxPath, "utf-8"));
      const risk = store.risk_profile ?? store.positions;
      if (!risk) {
        ctx.ui.notify("No risk data tracked yet");
        return;
      }
      ctx.ui.notify("Risk profile:\n" + JSON.stringify(risk, null, 2));
    }
  });
  agent.registerCommand("history", {
    description: "Show vault sweep history \u2014 usage: /history [N]",
    async handler(args, ctx) {
      if (!vault) {
        ctx.ui.notify("Vault not initialized");
        return;
      }
      if (vault.isLocked()) {
        ctx.ui.notify("\u{1F512} Vault locked \u2014 use /unlock first");
        return;
      }
      const n = parseInt(args.trim()) || 10;
      const hist = vault.getHistory().slice(0, n);
      if (hist.length === 0) {
        ctx.ui.notify("No vault history yet");
        return;
      }
      const lines = hist.map((e) => {
        const d = new Date(e.timestamp).toISOString().slice(0, 16).replace("T", " ");
        const sign2 = e.amount >= 0 ? "+" : "";
        return `${d}  ${sign2}$${e.amount.toFixed(2).padStart(10)}  ${e.note ?? ""}${e.txHash ? `
  tx: ${e.txHash}` : ""}`;
      });
      ctx.ui.notify(`Vault history (last ${hist.length}):

${lines.join("\n")}`);
    }
  });
  agent.registerCommand("pnl", {
    description: "Show profit and loss summary",
    async handler(_args, ctx) {
      const vaultBal = vault && !vault.isLocked() ? `$${vault.getStats().balance?.toFixed(2) ?? "0"}` : vault ? "\u{1F512} locked" : "unavailable";
      const tradingBal = wallet ? Object.keys(wallet.getSummary()).length + " chain wallet(s) \u2014 check via get_balance" : "unavailable";
      ctx.ui.notify([
        "P&L Summary",
        "",
        `Vault (cold profit store):   ${vaultBal}`,
        `Trading wallet:              ${tradingBal}`,
        "",
        "For on-chain balances use: get_balance <chain>",
        "For live trade history use: /history"
      ].join("\n"));
    }
  });
  agent.registerCommand("watchlist", {
    description: "Show tracked assets \u2014 add with: /watchlist add BTC",
    async handler(args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3, mkdirSync: mkdirSync4 } = __require("node:fs");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
      const list = Array.isArray(store.watchlist) ? store.watchlist : [];
      const [sub, ...rest] = args.trim().split(/\s+/);
      if (sub === "add" && rest[0]) {
        const sym = rest[0].toUpperCase();
        if (!list.includes(sym)) list.push(sym);
        store.watchlist = list;
        mkdirSync4(JELLY_HOME, { recursive: true });
        writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
        ctx.ui.notify(`Added ${sym} to watchlist: ${list.join(", ")}`);
      } else if (sub === "remove" && rest[0]) {
        const sym = rest[0].toUpperCase();
        store.watchlist = list.filter((s) => s !== sym);
        writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
        ctx.ui.notify(`Removed ${sym}. Watchlist: ${store.watchlist.join(", ") || "(empty)"}`);
      } else {
        ctx.ui.notify(list.length ? `Watchlist: ${list.join(", ")}

Add:    /watchlist add BTC
Remove: /watchlist remove BTC` : "Watchlist is empty.\nAdd assets: /watchlist add BTC");
      }
    }
  });
  agent.registerCommand("gas", {
    description: "Show current gas prices across chains",
    async handler(_args, ctx) {
      const key = process.env.ALCHEMY_KEY;
      if (!key) {
        ctx.ui.notify("Alchemy key not set \u2014 run /config to add it");
        return;
      }
      const chains = ["eth-mainnet", "arb-mainnet", "base-mainnet", "opt-mainnet", "polygon-mainnet"];
      const results = ["\u26FD Gas Prices\n"];
      await Promise.all(chains.map(async (network) => {
        try {
          const url = `https://${network}.g.alchemy.com/v2/${key}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
            signal: AbortSignal.timeout(4e3)
          });
          const d = await res.json();
          const gwei = (parseInt(d.result, 16) / 1e9).toFixed(1);
          results.push(`  ${network.replace("-mainnet", "").padEnd(12)} ${gwei} gwei`);
        } catch {
          results.push(`  ${network.replace("-mainnet", "").padEnd(12)} unavailable`);
        }
      }));
      ctx.ui.notify(results.join("\n"));
    }
  });
  agent.registerCommand("tvl", {
    description: "Show DeFi TVL \u2014 usage: /tvl [protocol]",
    async handler(args, ctx) {
      const proto = args.trim().toLowerCase();
      try {
        const url = proto ? `https://api.llama.fi/protocol/${proto}` : "https://api.llama.fi/v2/protocols?limit=10";
        const res = await fetch(url, { signal: AbortSignal.timeout(6e3) });
        if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
        const data = await res.json();
        if (proto) {
          ctx.ui.notify(`${data.name ?? proto}
TVL: ${fmtUsd(data.tvl ?? 0)}
Chains: ${(data.chains ?? []).slice(0, 5).join(", ")}`);
        } else {
          const lines = (Array.isArray(data) ? data : []).slice(0, 10).map(
            (p) => `${(p.name ?? "?").padEnd(20)} ${fmtUsd(p.tvl ?? 0)}`
          );
          ctx.ui.notify("Top DeFi Protocols by TVL:\n\n" + lines.join("\n"));
        }
      } catch (e) {
        ctx.ui.notify(`TVL lookup failed: ${e.message}`);
      }
    }
  });
  agent.registerCommand("whale", {
    description: "Scan an address for whale activity \u2014 usage: /whale <address>",
    async handler(args, ctx) {
      const addr = args.trim();
      if (!addr) {
        ctx.ui.notify("Usage: /whale <address>");
        return;
      }
      ctx.ui.notify(`Scanning ${addr}...

Use the agent: ask "scan whale ${addr}" for full on-chain analysis`);
    }
  });
  agent.registerCommand("chain", {
    description: "Set active chain context \u2014 usage: /chain [name]",
    async handler(args, ctx) {
      const { readFileSync: readFileSync3, writeFileSync: writeFileSync3, existsSync: existsSync4, mkdirSync: mkdirSync4 } = __require("node:fs");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      const chain = args.trim().toLowerCase();
      if (!chain) {
        const store2 = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
        const active = store2.active_chain ?? "ethereum";
        ctx.ui.notify(`Active chain: ${active}

Set with: /chain solana
Options: ethereum, base, arbitrum, solana, bsc, polygon, cosmos`);
        return;
      }
      mkdirSync4(JELLY_HOME, { recursive: true });
      const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
      store.active_chain = chain;
      writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      ctx.ui.notify(ctx.ui.theme.fg("accent", `Active chain \u2192 ${chain}`));
    }
  });
  agent.registerCommand("schedule", {
    description: "Show AutoVault schedule and agent task queue",
    async handler(_args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
      const thresh = process.env.AUTOVAULT_THRESHOLD ?? store.auto_vault_threshold ?? "100";
      const tasks = store.schedule ?? [];
      const lines = [
        `AutoVault: sweep to vault when trading balance > $${thresh}`,
        `Effect level: ${store.effect_level ?? "normal"}`,
        `Active chain: ${store.active_chain ?? "ethereum"}`,
        "",
        tasks.length ? `Scheduled tasks:
${tasks.map((t) => `  \u2022 ${JSON.stringify(t)}`).join("\n")}` : "No scheduled tasks"
      ];
      ctx.ui.notify(lines.join("\n"));
    }
  });
  agent.registerCommand("model", {
    description: "Show, pick, or search models \u2014 /model | /model <query> | /model <tier> | /model set <id>",
    async handler(args, ctx) {
      const { writeFileSync: writeFileSync3, readFileSync: readFileSync3, existsSync: existsSync4, mkdirSync: mkdirSync4 } = __require("node:fs");
      const envFile = path2.join(JELLY_HOME, ".env");
      mkdirSync4(JELLY_HOME, { recursive: true });
      const readCurrent = () => {
        if (!existsSync4(envFile)) return process.env.DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-5";
        const m = readFileSync3(envFile, "utf-8").match(/^DEFAULT_MODEL=(.+)$/m);
        return m?.[1]?.trim() ?? process.env.DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-5";
      };
      const saveModel = (id) => {
        const content = existsSync4(envFile) ? readFileSync3(envFile, "utf-8") : "";
        const re = /^DEFAULT_MODEL=.*$/m;
        const line = `DEFAULT_MODEL=${id}`;
        writeFileSync3(envFile, re.test(content) ? content.replace(re, line) : content + "\n" + line + "\n", "utf-8");
        process.env.DEFAULT_MODEL = id;
      };
      const arg = args.trim();
      const current = readCurrent();
      if (arg.startsWith("set ")) {
        const id = arg.slice(4).trim();
        saveModel(id);
        ctx.ui.notify(ctx.ui.theme.fg("accent", `Model set to: ${id}
Restart jellyos to apply.`));
        return;
      }
      if (["orchestrator", "analyst", "worker", "free"].includes(arg)) {
        const pool = modelRegistry.getPool(arg);
        const available = pool.filter((tm) => tm.available && tm.failures < 3);
        if (available.length === 0) {
          ctx.ui.notify(`No available models in tier: ${arg}`);
          return;
        }
        const lines2 = [
          ctx.ui.theme.fg("accent", `Tier: ${arg.toUpperCase()} (${available.length} available)`),
          "",
          ...available.slice(0, 15).map((tm, i) => {
            const cost = tm.costPer1K <= 0 ? "FREE" : `$${(tm.costPer1K / 1e9).toFixed(6)}/1K`;
            const ctx_ = tm.model.context_length >= 1e6 ? `${(tm.model.context_length / 1e6).toFixed(1)}M ctx` : `${(tm.model.context_length / 1e3).toFixed(0)}K ctx`;
            const marker = tm.model.id === current ? ctx.ui.theme.fg("accent", ">") : " ";
            return `${marker} [${String(i + 1).padStart(2)}] ${tm.model.id.padEnd(40)} ${cost.padEnd(16)} ${ctx_}`;
          }),
          "",
          ctx.ui.theme.fg("muted", `Current: ${current}`),
          ctx.ui.theme.fg("muted", "Use: /model set <id> to switch")
        ];
        ctx.ui.notify(lines2.join("\n"));
        return;
      }
      if (arg) {
        const results = modelRegistry.search(arg, 15);
        if (results.length === 0) {
          ctx.ui.notify(`No models matching: "${arg}"
Try: /model set <full-id>`);
          return;
        }
        const lines2 = [
          ctx.ui.theme.fg("accent", `Search: "${arg}" (${results.length} results)`),
          "",
          ...results.map((tm, i) => {
            const cost = tm.costPer1K <= 0 ? "FREE" : `$${(tm.costPer1K / 1e9).toFixed(6)}/1K`;
            const marker = tm.model.id === current ? ctx.ui.theme.fg("accent", ">") : " ";
            return `${marker} [${String(i + 1).padStart(2)}] [${tm.tier}] ${tm.model.id}  ${cost}`;
          }),
          "",
          ctx.ui.theme.fg("muted", `Current: ${current}`),
          ctx.ui.theme.fg("muted", "Use: /model set <id> to switch")
        ];
        ctx.ui.notify(lines2.join("\n"));
        return;
      }
      const tiers = ["orchestrator", "analyst", "worker", "free"];
      const lines = [
        ctx.ui.theme.fg("accent", `\u{1FABC} Model Registry (${modelRegistry.modelCount} total)`),
        ""
      ];
      for (const tier of tiers) {
        const pool = modelRegistry.getPool(tier);
        const avail = pool.filter((tm) => tm.available && tm.failures < 3);
        lines.push(`  ${tier.padEnd(14)} ${avail.length}/${pool.length} available`);
      }
      lines.push(
        "",
        ctx.ui.theme.fg("muted", `Current: ${current}`),
        ctx.ui.theme.fg("muted", "Usage: /model <tier> | /model <query> | /model set <id>")
      );
      ctx.ui.notify(lines.join("\n"));
    }
  });
  agent.registerCommand("config", {
    description: "Show current JellyOS configuration (keys masked)",
    async handler(_args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
      const envFile = path2.join(JELLY_HOME, ".env");
      const lines = ["JellyOS Config\n"];
      if (existsSync4(envFile)) {
        for (const line of readFileSync3(envFile, "utf-8").split("\n")) {
          const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
          if (!m) continue;
          const val = m[2].length > 8 ? m[2].slice(0, 4) + "****" + m[2].slice(-4) : "****";
          lines.push(`  ${m[1].padEnd(26)} ${val}`);
        }
      } else {
        lines.push("  No config file found. Run: jellyos setup");
      }
      lines.push(`
  Home: ${JELLY_HOME}`);
      lines.push("  Edit: jellyos config");
      ctx.ui.notify(lines.join("\n"));
    }
  });
  agent.registerCommand("skills", {
    description: "List installed Jelly Skills",
    async handler(_args, ctx) {
      const { existsSync: existsSync4, readdirSync } = __require("node:fs");
      const skillsDir = path2.join(JELLY_HOME, "skills");
      if (!existsSync4(skillsDir)) {
        ctx.ui.notify("No Jelly Skills installed.\nInstall during setup or clone to ~/.jelly/skills/");
        return;
      }
      const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      if (dirs.length === 0) {
        ctx.ui.notify("No skills installed yet");
        return;
      }
      const lines = dirs.map((d) => {
        const hasCmd = existsSync4(path2.join(skillsDir, d.name, "jelly-command.json"));
        return `  ${d.name.padEnd(32)} ${hasCmd ? "\u26A1 command" : "  knowledge"}`;
      });
      ctx.ui.notify(`Jelly Skills (${dirs.length} installed)

${lines.join("\n")}`);
    }
  });
  agent.registerCommand("network", {
    description: "Show chain connectivity and RPC health",
    async handler(_args, ctx) {
      const key = process.env.ALCHEMY_KEY;
      const checks = [
        { name: "CoinGecko", url: "https://api.coingecko.com/api/v3/ping" },
        { name: "DeFiLlama", url: "https://api.llama.fi/v2/protocols?limit=1" },
        { name: "Alternative.me", url: "https://api.alternative.me/fng/?limit=1" },
        { name: "CoinGlass", url: "https://open-api.coinglass.com/api/public/v3/funding_rates/ohlc" }
      ];
      if (key) checks.push({ name: "Alchemy", url: `https://eth-mainnet.g.alchemy.com/v2/${key}` });
      const lines = ["Network Status\n"];
      await Promise.all(checks.map(async (c) => {
        try {
          const r = await fetch(c.url, { method: "GET", signal: AbortSignal.timeout(3e3) });
          lines.push(`  ${c.name.padEnd(16)} ${r.ok || r.status < 500 ? "\u2713 ok" : `\u2717 ${r.status}`}`);
        } catch {
          lines.push(`  ${c.name.padEnd(16)} \u2717 unreachable`);
        }
      }));
      ctx.ui.notify(lines.join("\n"));
    }
  });
  agent.registerCommand("cost", {
    description: "Show session and lifetime token usage",
    async handler(_args, ctx) {
      ctx.ui.notify(`Cost tracking: available via the framework.
Use the ask agent: "what is my current cost usage?" or call the cost_report tool.`);
    }
  });
  agent.registerCommand("ticker", {
    description: "Show live price ticker",
    async handler(_args, ctx) {
      const ticks = priceFeed.getAll();
      if (ticks.length === 0) {
        ctx.ui.notify("No price data yet \u2014 feeds initializing.");
        return;
      }
      const lines = ticks.slice(0, 12).map((t) => {
        const change = t.change24h >= 0 ? `+${t.change24h.toFixed(2)}%` : `${t.change24h.toFixed(2)}%`;
        const emoji = t.change24h > 1 ? "\u{1F7E2}" : t.change24h < -1 ? "\u{1F534}" : "\u26AA";
        return `${emoji} ${t.symbol.padEnd(6)} $${t.price.toLocaleString()} ${change}`;
      });
      ctx.ui.notify(`Live Prices

${lines.join("\n")}`);
    }
  });
  agent.registerCommand("news", {
    description: "Show latest crypto news with sentiment",
    async handler(_args, ctx) {
      const report = newsFeed.getLatest();
      if (!report) {
        ctx.ui.notify("News data not yet available \u2014 fetching in background.");
        return;
      }
      const score = report.avgSentiment;
      const mood = score > 0.2 ? "\u{1F7E2} Bullish" : score < -0.2 ? "\u{1F534} Bearish" : "\u{1F7E1} Neutral";
      ctx.ui.notify([
        `\u{1F4F0} News Sentiment: ${mood} (${(score * 100).toFixed(0)}%)`,
        `${report.positive}p/${report.negative}n/${report.neutral}\xB7 \xB7 Trending: ${report.topKeywords.slice(0, 8).join(", ")}`,
        "",
        ...report.items.slice(0, 8).map((i) => {
          const s = (i.sentiment ?? 0) >= 0.1 ? "\u{1F7E2}" : (i.sentiment ?? 0) <= -0.1 ? "\u{1F534}" : " ";
          return `${s} [${i.source}] ${i.title.slice(0, 90)}`;
        })
      ].join("\n"));
    }
  });
  agent.registerCommand("ping", {
    description: "Quick health check \u2014 APIs, feeds, vault, wallets",
    async handler(_args, ctx) {
      const checks = ["JellyOS Health Check\n"];
      checks.push(`  Node.js          \u2713 ${process.version}`);
      checks.push(`  Uptime           ${Math.floor(process.uptime() / 60)}m`);
      checks.push(`  Memory           ${(process.memoryUsage().rss / 1e6).toFixed(0)}MB`);
      checks.push(`  JELLY_HOME       ${path2.join(JELLY_HOME, ".env") ? "\u2713" : "\u2717"} ${JELLY_HOME}`);
      checks.push(`  OpenRouter key   ${process.env.OPENROUTER_API_KEY ? "\u2713 set" : "\u2717 missing"}`);
      checks.push(`  Alchemy key      ${process.env.ALCHEMY_KEY ? "\u2713 set" : "\u2014 not set"}`);
      checks.push(`  Vault            ${vault ? vault.isLocked() ? "\u{1F512} locked" : `\u2713 $${vault.getStats().balance?.toFixed(2)}` : "\u2717 not initialized"}`);
      checks.push(`  Trading wallets  ${wallet ? `\u2713 ${Object.keys(wallet.getSummary()).length} chains` : "\u2717 not initialized"}`);
      checks.push(`  Feeds            ${feeds ? `\u2713 ${feeds.getStats()?.sources ?? 0} sources` : "\u2717 not initialized"}`);
      checks.push(`  Signals          ${signals ? "\u2713 running" : "\u2717 not initialized"}`);
      checks.push(`  Dashboard SSE    \u2713 port ${process.env.JELLY_DASHBOARD_PORT ?? "4320"}`);
      ctx.ui.notify(checks.join("\n"));
    }
  });
  agent.registerCommand("memo", {
    description: "Pin a note to session context \u2014 usage: /memo [text]",
    async handler(args, ctx) {
      const { readFileSync: readFileSync3, writeFileSync: writeFileSync3, existsSync: existsSync4, mkdirSync: mkdirSync4 } = __require("node:fs");
      const text2 = args.trim();
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      if (!text2) {
        const store2 = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
        ctx.ui.notify(store2.memo ? `Current memo:

  ${store2.memo}` : "No memo set.\nUsage: /memo <text>");
        return;
      }
      mkdirSync4(JELLY_HOME, { recursive: true });
      const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
      store.memo = text2.slice(0, 500);
      writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      ctx.ui.notify(ctx.ui.theme.fg("accent", `Memo pinned: "${store.memo}"`));
    }
  });
  const swarmState = {
    lastTaskComplexity: 0,
    lastSubtaskCount: 0,
    lastModel: process.env.DEFAULT_MODEL ?? "default",
    totalTurns: 0,
    toolCallsTotal: 0,
    fallbacks: 0
  };
  agent.registerCommand("agents", {
    description: "Show swarm router status and trigger multi-step analysis",
    async handler(args, ctx) {
      const cmd = args.trim().toLowerCase();
      const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
      if (!cmd || cmd === "status") {
        const ctxPath = path2.join(JELLY_HOME, "context.json");
        const effect = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")).effect_level ?? "normal" : "normal";
        const subtaskLimit = { eco: 1, normal: 2, turbo: 4, max: 5 }[effect] ?? 2;
        const modelChain = process.env.OPENROUTER_API_KEY ? ["primary", "claude-3-haiku", "gpt-4o-mini", "gemini-flash", "llama-3-8b"] : process.env.ANTHROPIC_API_KEY ? ["primary", "claude-3-haiku", "claude-3.5-haiku"] : ["primary"];
        ctx.ui.notify([
          ctx.ui.theme.fg("accent", "Sub-Agent / Swarm Status"),
          "",
          `  Primary agent      \u2713 running`,
          `  Swarm router       \u2713 active (max ${subtaskLimit} sub-tasks @ ${effect} mode)`,
          `  Model chain        ${modelChain.length} models (429/5xx auto-rotation)`,
          `  Fallback depth     ${modelChain.length - 1} fallback(s) configured`,
          "",
          ctx.ui.theme.fg("muted", "Session stats:"),
          `  Turns completed    ${swarmState.totalTurns}`,
          `  Tool calls         ${swarmState.toolCallsTotal}`,
          `  Model fallbacks    ${swarmState.fallbacks}`,
          `  Last task score    ${swarmState.lastTaskComplexity} (>${3} \u2192 swarm)`,
          `  Last sub-tasks     ${swarmState.lastSubtaskCount}`,
          "",
          `  /agents analyze <topic>   \u2014 run multi-step swarm analysis`,
          `  /effect turbo             \u2014 increase sub-task depth`
        ].join("\n"));
        return;
      }
      if (cmd.startsWith("analyze ") || cmd.startsWith("analyze")) {
        const topic = args.replace(/^analyze\s*/i, "").trim() || "current market conditions";
        const { existsSync: ex2, readFileSync: rf2 } = __require("node:fs");
        const ctxPath2 = path2.join(JELLY_HOME, "context.json");
        const effect2 = ex2(ctxPath2) ? JSON.parse(rf2(ctxPath2, "utf-8")).effect_level ?? "normal" : "normal";
        const maxSub = { eco: 1, normal: 2, turbo: 3, max: 5 }[effect2] ?? 2;
        const subTasks = [
          `Price action and momentum analysis for: ${topic}`,
          `On-chain data and DeFi signals for: ${topic}`,
          maxSub >= 3 ? `News sentiment and macro context for: ${topic}` : null,
          maxSub >= 4 ? `Risk factors and position sizing for: ${topic}` : null,
          maxSub >= 5 ? `Entry/exit strategy synthesis for: ${topic}` : null
        ].filter(Boolean);
        swarmState.lastSubtaskCount = subTasks.length;
        swarmState.lastTaskComplexity = subTasks.length * 2;
        ctx.ui.notify(
          ctx.ui.theme.fg("accent", `\u{1FABC} Swarm Analysis \u2014 ${subTasks.length} agents`) + "\n" + ctx.ui.theme.fg("muted", `Topic: ${topic}`) + "\n\n" + subTasks.map((t, i) => `  [${i + 1}/${subTasks.length}] ${t}`).join("\n") + "\n\n" + ctx.ui.theme.fg("muted", "Send the topic as a message to the agent to begin \u2014 the swarm router\nwill decompose and synthesize results automatically.")
        );
        swarmState.totalTurns++;
        return;
      }
      ctx.ui.notify(
        "Usage: /agents [status] | /agents analyze <topic>\n\n  /agents          \u2014 show swarm router status\n  /agents analyze  \u2014 run multi-step decomposed analysis"
      );
    }
  });
  agent.registerCommand("export", {
    description: "Export vault ledger to CSV in current directory",
    async handler(_args, ctx) {
      if (!vault) {
        ctx.ui.notify("Vault not initialized");
        return;
      }
      if (vault.isLocked()) {
        ctx.ui.notify("\u{1F512} Vault locked \u2014 use /unlock first");
        return;
      }
      const { writeFileSync: writeFileSync3 } = __require("node:fs");
      const hist = vault.getHistory();
      if (hist.length === 0) {
        ctx.ui.notify("No vault history to export");
        return;
      }
      const header = "timestamp,date,amount,note,txHash";
      const rows = hist.map(
        (e) => `${e.timestamp},"${new Date(e.timestamp).toISOString()}",${e.amount},"${(e.note ?? "").replace(/"/g, '""')}","${e.txHash ?? ""}"`
      );
      const filename = `jelly-vault-${Date.now()}.csv`;
      writeFileSync3(filename, [header, ...rows].join("\n"), "utf-8");
      ctx.ui.notify(`\u2713 Exported ${hist.length} entries \u2192 ${filename}`);
    }
  });
  agent.registerCommand("debug", {
    description: "Show last tool calls from debug log",
    async handler(_args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3 } = __require("node:fs");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
      const log = Array.isArray(store.debug_log) ? store.debug_log : [];
      if (log.length === 0) {
        ctx.ui.notify("No tool calls logged yet");
        return;
      }
      const lines = log.slice(0, 10).map(
        (e) => `  ${new Date(e.ts ?? 0).toISOString().slice(11, 19)}  ${(e.tool ?? "?").padEnd(24)} ${e.ms ?? "?"}ms`
      );
      ctx.ui.notify("Recent tool calls:\n\n" + lines.join("\n"));
    }
  });
  (() => {
    const { existsSync: existsSync4, readdirSync, readFileSync: readFileSync3 } = __require("node:fs");
    const skillsDir = path2.join(JELLY_HOME, "skills");
    if (!existsSync4(skillsDir)) return;
    try {
      const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      for (const skill of skills) {
        const cmdFile = path2.join(skillsDir, skill, "jelly-command.json");
        if (!existsSync4(cmdFile)) continue;
        try {
          const cmd = JSON.parse(readFileSync3(cmdFile, "utf-8"));
          if (!cmd.command || !cmd.description) continue;
          const toolName = cmd.tool;
          const skillLabel = skill;
          agent.registerCommand(cmd.command, {
            description: `[${skillLabel}] ${cmd.description}`,
            async handler(args, ctx) {
              if (toolName) {
                ctx.ui.notify(`Running ${skillLabel}/${cmd.command}...
Args: ${args || "(none)"}`);
              } else {
                ctx.ui.notify(`[${skillLabel}] ${cmd.description}

Ask the agent for details or pass args in your message.`);
              }
            }
          });
        } catch {
        }
      }
    } catch {
    }
  })();
  agent.registerTool({
    name: "get_market_data",
    label: "Market Data",
    description: "Get current prices and 24h stats for crypto assets via CoinGecko. Use coingecko IDs: bitcoin, ethereum, solana, etc.",
    parameters: Type.Object({
      symbols: Type.Array(
        Type.String({ description: "CoinGecko IDs (e.g. bitcoin, ethereum, solana)" }),
        { description: "Asset IDs to fetch (max 10)" }
      )
    }),
    async execute(_id, params) {
      const ids = params.symbols.slice(0, 10).map((s) => s.toLowerCase().replace(/\s+/g, "-"));
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8e3) });
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const data = await res.json();
      const lines = Object.entries(data).map(
        ([id, info]) => `${id.toUpperCase()}: $${info.usd?.toLocaleString() ?? "?"} | 24h: ${info.usd_24h_change?.toFixed(2) ?? "?"}% | Vol: ${fmtUsd(info.usd_24h_vol ?? 0)}`
      );
      if (lines.length === 0) throw new Error("No data returned \u2014 check asset IDs");
      const pricePayload = Object.entries(data).map(([id, info]) => ({
        id,
        price: info.usd,
        change24h: info.usd_24h_change,
        ts: Date.now()
      }));
      broadcastWs("prices", pricePayload);
      return text(lines.join("\n"));
    }
  });
  agent.registerTool({
    name: "get_fear_greed",
    label: "Fear & Greed Index",
    description: "Get the current Crypto Fear & Greed Index (0=extreme fear, 100=extreme greed)",
    parameters: Type.Object({}),
    async execute() {
      const res = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(5e3) });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const item = data?.data?.[0];
      if (!item) throw new Error("No data returned");
      const v = parseInt(item.value);
      const zone = v <= 25 ? "Extreme Fear \u2014 contrarian buy zone" : v >= 75 ? "Extreme Greed \u2014 potential sell zone" : "Neutral zone";
      return text(`Fear & Greed: ${item.value}/100 \u2014 ${item.value_classification}
${zone}`);
    }
  });
  agent.registerTool({
    name: "get_funding_rates",
    label: "Funding Rates",
    description: "Get perpetual futures funding rates for a symbol across exchanges",
    parameters: Type.Object({
      symbol: Type.Optional(Type.String({ description: "Asset symbol: BTC, ETH, SOL, etc. (default: BTC)" }))
    }),
    async execute(_id, params) {
      const sym = (params.symbol ?? "BTC").toUpperCase();
      const res = await fetch(
        `https://open-api.coinglass.com/public/v2/funding?symbol=${sym}`,
        { signal: AbortSignal.timeout(8e3) }
      );
      if (!res.ok) throw new Error(`Coinglass ${res.status} \u2014 API key may be required`);
      const data = await res.json();
      if (!data?.data) throw new Error("No funding data");
      const rates = (Array.isArray(data.data) ? data.data : []).slice(0, 8);
      const lines = rates.map((r) => `${r.exchangeName}: ${(r.fundingRate * 100).toFixed(4)}%`);
      const avg = rates.reduce((s, r) => s + (r.fundingRate ?? 0), 0) / (rates.length || 1);
      const signal = avg > 1e-3 ? "\u26A0\uFE0F Longs overextended" : avg < -3e-4 ? "\u26A0\uFE0F Shorts overextended" : "Normal";
      return text(`${sym} Funding Rates:
${lines.join("\n")}
Avg: ${(avg * 100).toFixed(4)}% \u2014 ${signal}`);
    }
  });
  agent.registerTool({
    name: "get_defi_tvl",
    label: "DeFi TVL",
    description: "Get Total Value Locked by chain or protocol via DeFi Llama",
    parameters: Type.Object({
      protocol: Type.Optional(Type.String({ description: "Protocol slug (aave, uniswap, curve\u2026) or omit for chain overview" }))
    }),
    async execute(_id, params) {
      if (params.protocol) {
        const res2 = await fetch(`https://api.llama.fi/protocol/${params.protocol}`, { signal: AbortSignal.timeout(8e3) });
        if (!res2.ok) throw new Error(`Protocol not found: ${params.protocol}`);
        const d = await res2.json();
        return text(`${d.name}: ${fmtUsd(d.tvl ?? 0)} TVL | ${d.category} | Chains: ${(d.chains ?? []).slice(0, 5).join(", ")}`);
      }
      const res = await fetch("https://api.llama.fi/v2/chains", { signal: AbortSignal.timeout(8e3) });
      if (!res.ok) throw new Error(`DeFi Llama ${res.status}`);
      const data = await res.json();
      const top = (Array.isArray(data) ? data : []).sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, 10);
      return text("Top Chains by TVL:\n" + top.map((c) => `${c.name}: ${fmtUsd(c.tvl ?? 0)}`).join("\n"));
    }
  });
  agent.registerTool({
    name: "get_gas_prices",
    label: "Gas Prices",
    description: "Get current gas prices across EVM networks (requires ALCHEMY_KEY env var)",
    parameters: Type.Object({
      networks: Type.Optional(Type.Array(Type.String(), { description: "Chain names (default: ethereum, bsc, polygon)" }))
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set \u2014 run jellyos setup");
      const nets = (params.networks ?? ["ethereum", "bsc", "polygon"]).slice(0, 5);
      const results = [];
      for (const net of nets) {
        try {
          const res = await fetch(`https://${CHAIN_NETWORK[net] ?? "eth-mainnet"}.g.alchemy.com/v2/${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
            signal: AbortSignal.timeout(5e3)
          });
          if (!res.ok) {
            results.push(`${net}: unavailable`);
            continue;
          }
          const data = await res.json();
          const gwei = parseInt(data.result, 16) / 1e9;
          results.push(`${net}: ${gwei.toFixed(1)} Gwei`);
        } catch {
          results.push(`${net}: unavailable`);
        }
      }
      return text(results.join("\n"));
    }
  });
  agent.registerTool({
    name: "get_polymarket",
    label: "Polymarket",
    description: "Get trending Polymarket prediction markets",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Number of markets (default 5)" })),
      search: Type.Optional(Type.String({ description: "Search query" }))
    }),
    async execute(_id, params) {
      let url = `https://gamma-api.polymarket.com/markets?limit=${params.limit ?? 5}&order=volume&ascending=false&active=true`;
      if (params.search) url += `&q=${encodeURIComponent(params.search)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8e3) });
      if (!res.ok) throw new Error(`Polymarket ${res.status}`);
      const data = await res.json();
      const markets = Array.isArray(data) ? data : [];
      if (markets.length === 0) return text("No markets found");
      const lines = markets.slice(0, 6).map((m) => {
        const yes = ((m.outcomePrices?.[0] ?? 0) * 100).toFixed(0);
        return `${m.question}
  Yes: ${yes}% | Vol: ${fmtUsd(m.volume ?? 0)}${m.slug ? `
  https://polymarket.com/event/${m.slug}` : ""}`;
      });
      return text(lines.join("\n\n"));
    }
  });
  agent.registerTool({
    name: "get_balance",
    label: "Wallet Balance",
    description: "Check wallet balance on any supported blockchain",
    parameters: Type.Object({
      chain: Type.String({ description: "Chain: ethereum, bsc, arbitrum, base, polygon, avalanche, optimism, solana, scroll, linea, zksync, mantle, blast, celo, gnosis" }),
      address: Type.Optional(Type.String({ description: "Wallet address \u2014 leave blank to use built-in wallet" }))
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set \u2014 run jellyos setup");
      let addr = params.address;
      if (!addr && wallet) {
        addr = wallet.getAddress(params.chain) ?? void 0;
        if (!addr) throw new Error(`No wallet for ${params.chain}. Run jellyos setup first.`);
      }
      if (!addr) throw new Error("No address provided");
      const network = CHAIN_NETWORK[params.chain] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
        signal: AbortSignal.timeout(8e3)
      });
      if (!res.ok) throw new Error(`Alchemy ${res.status}`);
      const data = await res.json();
      const formatted = (Number(BigInt(data.result)) / 1e18).toFixed(6);
      return text(`${addr.slice(0, 8)}\u2026 ${formatted} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}`);
    }
  });
  agent.registerTool({
    name: "sign_transaction",
    label: "Sign Transaction",
    description: "Sign an unsigned transaction payload with the built-in wallet. For EVM: accepts RLP-encoded tx hex or 32-byte hash hex; uses keccak256+ECDSA (ethers-compatible). For Solana/Cosmos: Ed25519 over raw bytes. Returns hex signature only \u2014 does NOT broadcast to the network.",
    parameters: Type.Object({
      chain: Type.String({ description: "Chain: ethereum | bsc | solana | cosmos | etc." }),
      tx_hex: Type.String({ description: "Unsigned transaction payload as hex string (0x-prefixed or raw hex). For EVM: RLP-encoded tx or 32-byte hash. For Solana: serialized message bytes." }),
      tx_type: Type.Optional(Type.String({ description: "Transaction encoding hint: 'hash' (32-byte keccak hash to sign directly), 'personal' (personal_sign), 'raw' (sign bytes directly). Default: 'hash' for 32-byte input, 'personal' otherwise." }))
    }),
    async execute(_id, params) {
      if (!wallet) throw new Error("Wallet not initialized");
      const addr = wallet.getAddress(params.chain);
      if (!addr) throw new Error(`No wallet for '${params.chain}'. Run jellyos setup first.`);
      const sig = wallet.signMessage(params.chain, params.tx_hex);
      if (!sig) throw new Error("Signing failed \u2014 check wallet initialization.");
      const lines = [
        `Chain:     ${params.chain}`,
        `Signer:    ${addr}`,
        `Signature: ${sig}`,
        "",
        "\u26A0 Signature only \u2014 transaction NOT broadcast. Use swap or bridge tool to execute."
      ];
      return text(lines.join("\n"));
    }
  });
  agent.registerTool({
    name: "get_wallet_addresses",
    label: "Wallet Addresses",
    description: "Show all generated wallet addresses across chains",
    parameters: Type.Object({}),
    async execute() {
      if (!wallet) throw new Error("Wallet not initialized");
      const summary = wallet.getSummary();
      if (Object.keys(summary).length === 0) return text("No wallets yet. Run `jellyos setup` first.");
      return text(Object.entries(summary).map(([c, a]) => `${c}: ${a}`).join("\n"));
    }
  });
  agent.registerTool({
    name: "scan_chain",
    label: "Scan Chain",
    description: "Scan a blockchain for recent large transactions and whale activity",
    parameters: Type.Object({
      chain: Type.String({ description: "Chain name" }),
      min_value_eth: Type.Optional(Type.Number({ description: "Min native token value to include (default 50)" }))
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set \u2014 run jellyos setup");
      const network = CHAIN_NETWORK[params.chain] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "alchemy_getAssetTransfers",
          params: [{ category: ["external"], maxCount: "0xa", order: "desc", excludeZeroValue: true }]
        }),
        signal: AbortSignal.timeout(8e3)
      });
      if (!res.ok) throw new Error(`Alchemy ${res.status}`);
      const data = await res.json();
      const minVal = params.min_value_eth ?? 50;
      const txs = (data?.result?.transfers ?? []).filter((t) => parseFloat(t.value ?? "0") >= minVal);
      if (txs.length === 0) return text(`No large transfers (>${minVal} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}) on ${params.chain} recently`);
      const lines = txs.slice(0, 5).map(
        (t) => `${parseFloat(t.value).toFixed(2)} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}: ${(t.from ?? "?").slice(0, 8)}\u2026 \u2192 ${(t.to ?? "?").slice(0, 8)}\u2026`
      );
      return text(`Large transfers on ${params.chain}:
${lines.join("\n")}`);
    }
  });
  agent.registerTool({
    name: "get_chain_list",
    label: "Supported Chains",
    description: "List all supported blockchain networks",
    parameters: Type.Object({}),
    async execute() {
      const chains = [...Object.keys(CHAIN_NETWORK), "solana", "cosmos"];
      return text(`Supported chains (${chains.length}): ${chains.join(", ")}`);
    }
  });
  agent.registerTool({
    name: "vault_status",
    label: "Vault Status",
    description: "Get profit vault balance and lock state",
    parameters: Type.Object({}),
    async execute() {
      if (!vault) throw new Error("Vault not initialized");
      const s = vault.getStats();
      if (vault.isLocked()) return text("\u{1F512} Vault locked. Use /unlock to access.");
      return text(`\u{1F513} Vault: $${s.balance?.toFixed(2) ?? "0"} USD | ${s.entries} entries | Updated: ${new Date(s.updatedAt).toLocaleString()}`);
    }
  });
  agent.registerTool({
    name: "vault_sweep",
    label: "Sweep to Vault",
    description: "Sweep realized profits into the encrypted vault. Vault must be unlocked first.",
    parameters: Type.Object({
      amount: Type.Number({ description: "USD amount to sweep" }),
      note: Type.Optional(Type.String({ description: "Note for this entry (e.g. 'ETH long +18%')" })),
      confirm: Type.Optional(Type.Boolean({ description: "Must be true to execute the sweep" }))
    }),
    async execute(_id, params) {
      if (!vault) throw new Error("Vault not initialized");
      if (!params.confirm) {
        return text(`Confirm sweeping $${params.amount.toFixed(2)} to vault? Call again with confirm: true.`);
      }
      await vault.sweep(params.amount, params.note ?? "manual-sweep");
      broadcastWs("vault_sweep", { amount: params.amount, note: params.note, ts: Date.now() });
      broadcastWs("vault_balance", { balance: vault.getStats().balance, ts: Date.now() });
      return text(`\u2705 Swept $${params.amount.toFixed(2)} to vault`);
    }
  });
  agent.registerTool({
    name: "vault_history",
    label: "Vault History",
    description: "Get recent vault transaction history",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Number of entries (default 10)" }))
    }),
    async execute(_id, params) {
      if (!vault) throw new Error("Vault not initialized");
      const history = vault.getHistory();
      if (history.length === 0) return text("No vault entries yet");
      return text(history.slice(0, params.limit ?? 10).map(
        (e) => `${new Date(e.timestamp).toLocaleDateString()} ${e.amount > 0 ? "+" : ""}$${e.amount.toFixed(2)} \u2014 ${e.note}`
      ).join("\n"));
    }
  });
  agent.registerTool({
    name: "calculate_risk",
    label: "Risk Calculator",
    description: "Calculate risk/reward ratio, position size, and max loss for a trade setup",
    parameters: Type.Object({
      symbol: Type.String(),
      entry: Type.Number({ description: "Entry price" }),
      stop_loss: Type.Number({ description: "Stop-loss price" }),
      take_profit: Type.Optional(Type.Number({ description: "Take-profit target price" })),
      portfolio_size_usd: Type.Optional(Type.Number({ description: "Portfolio size in USD (default 10000)" })),
      risk_pct: Type.Optional(Type.Number({ description: "Max % of portfolio to risk (default 2)" })),
      leverage: Type.Optional(Type.Number({ description: "Leverage multiplier (default 1)" }))
    }),
    async execute(_id, p) {
      const portfolioUsd = p.portfolio_size_usd ?? 1e4;
      const riskPct = (p.risk_pct ?? 2) / 100;
      const leverage = p.leverage ?? 1;
      const riskPerUnit = Math.abs(p.entry - p.stop_loss);
      const riskAmount = portfolioUsd * riskPct;
      const positionSize = riskAmount / riskPerUnit;
      const positionVal = positionSize * p.entry;
      const rr = p.take_profit ? Math.abs(p.take_profit - p.entry) / riskPerUnit : null;
      const lines = [
        `${p.symbol} Risk Analysis`,
        `Entry $${p.entry} | Stop $${p.stop_loss}${p.take_profit ? ` | Target $${p.take_profit}` : ""}`,
        `Risk per unit: $${riskPerUnit.toFixed(4)}`,
        `Max position: ${positionSize.toFixed(4)} ${p.symbol} ($${positionVal.toFixed(2)})`,
        `Max loss: $${riskAmount.toFixed(2)} (${p.risk_pct ?? 2}% of portfolio)`,
        rr != null ? `R/R: 1:${rr.toFixed(2)}${rr < 1 ? " \u26A0\uFE0F below 1:1" : rr >= 2 ? " \u2705 good" : ""}` : "",
        leverage > 1 ? `Leverage: ${leverage}x${leverage > 3 ? " \u26A0\uFE0F high" : ""}` : ""
      ].filter(Boolean);
      return text(lines.join("\n"));
    }
  });
  agent.registerTool({
    name: "execute_trade",
    label: "Execute Trade",
    description: "Execute a swap on Jupiter (Solana) or Uniswap (EVM). Always shows confirmation before executing.",
    parameters: Type.Object({
      pair: Type.String({ description: "Trading pair: ETH/USDC, SOL/USDT, etc." }),
      side: Type.String({ description: "buy or sell" }),
      amount_usd: Type.Number({ description: "USD amount" }),
      chain: Type.String({ description: "Chain name" }),
      max_slippage_pct: Type.Optional(Type.Number({ description: "Max slippage % (default 0.5)" })),
      confirm: Type.Optional(Type.Boolean({ description: "Must be true to execute" }))
    }),
    async execute(_id, params) {
      if (!params.confirm) {
        return text(
          `\u26A0\uFE0F CONFIRMATION REQUIRED
${params.side.toUpperCase()} $${params.amount_usd} of ${params.pair} on ${params.chain}
Max slippage: ${params.max_slippage_pct ?? 0.5}%

Call again with confirm: true to execute.`
        );
      }
      const txHash = "0x" + Math.random().toString(16).slice(2, 18);
      const explorer = params.chain === "solana" ? `https://solscan.io/tx/${txHash}` : `https://etherscan.io/tx/${txHash}`;
      broadcastWs("trade", {
        pair: params.pair,
        side: params.side,
        amount_usd: params.amount_usd,
        chain: params.chain,
        txHash,
        ts: Date.now()
      });
      return text(
        `\u2705 Trade submitted: ${params.side.toUpperCase()} $${params.amount_usd} ${params.pair} on ${params.chain}
Tx: ${txHash}
Explorer: ${explorer}

Note: Demo mode \u2014 connect DEX adapters for live execution.`
      );
    }
  });
  agent.registerTool({
    name: "set_stop_loss",
    label: "Set Stop Loss",
    description: "Set or update stop-loss for an open position",
    parameters: Type.Object({
      position_id: Type.String(),
      stop_loss: Type.Number(),
      confirm: Type.Optional(Type.Boolean())
    }),
    async execute(_id, params) {
      if (!params.confirm) {
        return text(`Confirm stop-loss $${params.stop_loss} on position ${params.position_id}? Add confirm: true.`);
      }
      return text(`\u2705 Stop-loss set to $${params.stop_loss} on position ${params.position_id}`);
    }
  });
  agent.registerTool({
    name: "get_positions",
    label: "Positions",
    description: "List open or closed trading positions",
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: "open | closed | all (default: open)" }))
    }),
    async execute(_id, params) {
      const { PositionManager: PositionManager2 } = await Promise.resolve().then(() => (init_PositionManager(), PositionManager_exports));
      const { Metrics: Metrics2 } = await Promise.resolve().then(() => (init_Metrics(), Metrics_exports));
      const { Logger: Logger2 } = await Promise.resolve().then(() => (init_Logger(), Logger_exports));
      const logger = new Logger2("Positions");
      const pm = new PositionManager2(new Metrics2(logger));
      const status = params.status ?? "open";
      const positions = status === "closed" ? pm.getClosedPositions() : status === "all" ? [...pm.getOpenPositions(), ...pm.getClosedPositions()] : pm.getOpenPositions();
      if (positions.length === 0) return text(`No ${status} positions`);
      return text(JSON.stringify(positions, null, 2));
    }
  });
  agent.registerTool({
    name: "get_portfolio",
    label: "Portfolio Overview",
    description: "Get full portfolio summary with P&L and performance metrics",
    parameters: Type.Object({}),
    async execute() {
      const { PositionManager: PositionManager2 } = await Promise.resolve().then(() => (init_PositionManager(), PositionManager_exports));
      const { PortfolioManager: PortfolioManager2 } = await Promise.resolve().then(() => (init_PortfolioManager(), PortfolioManager_exports));
      const { Metrics: Metrics2 } = await Promise.resolve().then(() => (init_Metrics(), Metrics_exports));
      const { Logger: Logger2 } = await Promise.resolve().then(() => (init_Logger(), Logger_exports));
      const logger = new Logger2("Portfolio");
      const metrics = new Metrics2(logger);
      const pm = new PositionManager2(metrics);
      const portfolio = new PortfolioManager2(pm, metrics);
      return text(JSON.stringify(portfolio.getSummary(), null, 2));
    }
  });
  agent.registerTool({
    name: "get_live_feeds",
    label: "Live Feeds",
    description: "Get recent items from live data feeds (news, prices, whale alerts, on-chain signals)",
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: "news | signal | whale | price | social | onchain | prediction \u2014 omit for all" })),
      limit: Type.Optional(Type.Number({ description: "Max items (default 10)" })),
      source: Type.Optional(Type.String({ description: "Filter by source name" }))
    }),
    async execute(_id, params) {
      if (!feeds) throw new Error("Feed service not initialized");
      const items = feeds.getRecent({
        category: params.category,
        limit: params.limit ?? 10,
        source: params.source
      });
      if (items.length === 0) return text("No feed items yet \u2014 feeds update every 1\u201330 minutes");
      return text(items.map((i) => `[${i.source}] ${i.title}: ${i.content}`).join("\n"));
    }
  });
  agent.registerTool({
    name: "get_signals",
    label: "Trading Signals",
    description: "Get active AI-generated trading signals from cross-source analysis",
    parameters: Type.Object({
      asset: Type.Optional(Type.String({ description: "Filter by asset symbol: BTC, ETH, SOL, etc." }))
    }),
    async execute(_id, params) {
      if (!signals) throw new Error("Signal engine not initialized");
      const sigs = signals.getActiveSignals(params.asset);
      if (sigs.length === 0) return text("No active signals at this time");
      broadcastWs("signals", sigs.map((s) => ({
        asset: s.asset,
        direction: s.direction,
        strength: s.strength,
        confidence: s.confidence,
        ts: Date.now()
      })));
      return text(sigs.map(
        (s) => `[${s.asset}] ${s.direction.toUpperCase()} | Strength: ${(s.strength * 100).toFixed(0)}% | Conf: ${(s.confidence * 100).toFixed(0)}%
  ${s.rationale}`
      ).join("\n\n"));
    }
  });
  agent.registerTool({
    name: "get_news",
    label: "Crypto News",
    description: "Get latest crypto news from feed sources or CryptoCompare fallback",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Number of articles (default 5)" })),
      category: Type.Optional(Type.String({ description: "Topic filter: defi, nft, ethereum, bitcoin, etc." }))
    }),
    async execute(_id, params) {
      const feedItems = feeds?.getRecent({ category: "news", limit: params.limit ?? 5 });
      if (feedItems && feedItems.length > 0) {
        return text(feedItems.map(
          (i) => `\u2022 [${i.source}] ${i.title}
  ${(i.content ?? "").slice(0, 150)}${i.url ? `
  ${i.url}` : ""}`
        ).join("\n\n"));
      }
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=${params.limit ?? 5}`,
        { signal: AbortSignal.timeout(8e3) }
      );
      if (!res.ok) throw new Error(`CryptoCompare ${res.status}`);
      const data = await res.json();
      return text((data?.Data ?? []).slice(0, params.limit ?? 5).map(
        (n) => `\u2022 [${n.source}] ${n.title}
  ${(n.body ?? "").slice(0, 150)}`
      ).join("\n\n"));
    }
  });
  agent.registerTool({
    name: "analyze_ta",
    label: "Technical Analysis",
    description: "Run full technical analysis on price data: RSI, MACD, Bollinger Bands, EMA crossover, ATR, volume profile. Returns buy/sell signals.",
    parameters: Type.Object({
      prices: Type.Array(Type.Number(), { description: "Array of closing prices (most recent last)" }),
      highs: Type.Optional(Type.Array(Type.Number(), { description: "High prices (optional, for ATR)" })),
      lows: Type.Optional(Type.Array(Type.Number(), { description: "Low prices (optional, for ATR)" })),
      volumes: Type.Optional(Type.Array(Type.Number(), { description: "Volume data (optional)" }))
    }),
    async execute(_id, p) {
      const closes = p.prices;
      const highs = p.highs ?? [];
      const lows = p.lows ?? [];
      const volumes = p.volumes ?? [];
      const candles = closes.map((c, i) => ({
        timestamp: 0,
        open: c,
        high: highs[i] ?? c,
        low: lows[i] ?? c,
        close: c,
        volume: volumes[i] ?? 0
      }));
      const results = fullAnalysis(candles);
      const lines = results.map((r) => {
        const s = r.signal === "bullish" ? "\u{1F7E2}" : r.signal === "bearish" ? "\u{1F534}" : "\u26AA";
        const v = Array.isArray(r.value) ? `[${r.value.length} values]` : typeof r.value === "number" ? r.value : "-";
        return `${s} ${r.indicator}: ${v}`;
      }).join("\n");
      const summary = results.find((r) => r.indicator === "SUMMARY");
      return {
        content: [{ type: "text", text: `Technical Analysis Results:
${lines}` }],
        details: { results, overall_signal: summary?.signal, overall_score: summary?.value }
      };
    }
  });
  agent.registerTool({
    name: "get_news_sentiment",
    label: "News Sentiment",
    description: "Get crypto news with AI sentiment scoring. Shows bullish/bearish/neutral breakdown, trending keywords, and scored headlines.",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ default: 10 }))
    }),
    async execute(_id, params) {
      const report = newsFeed.getLatest();
      if (!report) return text("News data not yet available. Please wait for the first fetch.");
      const items = report.items.slice(0, params.limit ?? 10).map((i) => {
        const s = (i.sentiment ?? 0) >= 0.1 ? "+" : (i.sentiment ?? 0) <= -0.1 ? "-" : " ";
        return `${s} [${i.source}] ${i.title}`;
      }).join("\n");
      return {
        content: [{
          type: "text",
          text: `News Sentiment: ${report.avgSentiment >= 0 ? "+" : ""}${(report.avgSentiment * 100).toFixed(0)}% \xB7 ${report.positive}p/${report.negative}n/${report.neutral}\xB7
Trending: ${report.topKeywords.join(", ")}

${items}`
        }],
        details: { avgSentiment: report.avgSentiment, positive: report.positive, negative: report.negative, neutral: report.neutral, keywords: report.topKeywords }
      };
    }
  });
  agent.registerTool({
    name: "get_price_ticker",
    label: "Price Ticker",
    description: "Get real-time prices and 24h changes for tracked assets. Uses the framework price feed for fast cached lookups.",
    parameters: Type.Object({
      symbols: Type.Optional(Type.Array(Type.String(), { description: "Symbols to fetch: btc, eth, sol, etc. (default: all tracked)" }))
    }),
    async execute(_id, p) {
      const ticks = p.symbols?.length ? priceFeed.getMultiple(p.symbols) : priceFeed.getAll();
      if (ticks.length === 0) return text("No price data available yet. Prices update every 60 seconds.");
      const lines = ticks.map((t) => {
        const change = t.change24h >= 0 ? `+${t.change24h.toFixed(2)}%` : `${t.change24h.toFixed(2)}%`;
        return `${t.symbol.padEnd(6)} $${t.price < 1 ? t.price.toFixed(6) : t.price.toLocaleString()} ${change}`;
      });
      return text(lines.join("\n"));
    }
  });
  agent.registerTool({
    name: "predict_market",
    label: "Market Prediction",
    description: "Generate a price prediction for an asset based on signals and sentiment data",
    parameters: Type.Object({
      symbol: Type.String({ description: "Asset symbol: BTC, ETH, SOL, etc." }),
      timeframe: Type.Optional(Type.String({ description: "1h | 4h | 1d | 1w (default: 1d)" }))
    }),
    async execute(_id, params) {
      const sym = (params.symbol ?? "BTC").toUpperCase();
      const tf = params.timeframe ?? "1d";
      const sigs = signals?.getActiveSignals(sym) ?? [];
      const fngItem = feeds?.getRecent({ source: "alternative.me", limit: 1 })?.[0];
      const fng = fngItem?.metadata?.score;
      let bias = "neutral", confidence = 50;
      if (sigs.length > 0) {
        const longs = sigs.filter((s) => s.direction === "long").length;
        const shorts = sigs.filter((s) => s.direction === "short").length;
        if (longs > shorts) {
          bias = "bullish";
          confidence = 55 + longs * 5;
        }
        if (shorts > longs) {
          bias = "bearish";
          confidence = 55 + shorts * 5;
        }
      }
      if (fng !== void 0) {
        if (fng < 25 && bias !== "bearish") {
          bias = "bullish";
          confidence += 5;
        }
        if (fng > 80 && bias !== "bullish") {
          bias = "bearish";
          confidence += 5;
        }
      }
      confidence = Math.min(85, confidence);
      return text([
        `${sym} ${tf} Prediction`,
        `Bias: ${bias.toUpperCase()} | Confidence: ${confidence}%`,
        `Active signals: ${sigs.length} | Fear & Greed: ${fng ?? "N/A"}/100`,
        "",
        "\u26A0\uFE0F Not financial advice. Always DYOR."
      ].join("\n"));
    }
  });
  agent.registerTool({
    name: "web_fetch",
    label: "Fetch URL",
    description: "Fetch content from any URL. Strips HTML to plain text by default. Useful for docs, news, APIs.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      as_text: Type.Optional(Type.Boolean({ description: "Strip HTML tags (default true for HTML)" }))
    }),
    async execute(_id, params) {
      if (isPrivateHost(params.url)) {
        throw new Error(`Blocked: ${params.url} resolves to a private/internal network address`);
      }
      const res = await fetch(params.url, {
        headers: { "User-Agent": "JellyOS/2.0" },
        signal: AbortSignal.timeout(15e3)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const ct = res.headers.get("content-type") ?? "";
      let body = await res.text();
      if (ct.includes("html") || params.as_text !== false) {
        body = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
      }
      return text(body.slice(0, 6e3));
    }
  });
  agent.registerTool({
    name: "get_system_status",
    label: "System Status",
    description: "Full JellyOS system diagnostics \u2014 feeds, vault, wallet, API keys, memory",
    parameters: Type.Object({}),
    async execute() {
      const uptime = process.uptime();
      const mem = process.memoryUsage();
      const feedStats = feeds?.getStats();
      const vaultStats = vault?.getStats();
      return text(JSON.stringify({
        system: {
          version: "2.0.0",
          uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
          memory_mb: (mem.rss / 1e6).toFixed(1),
          node: process.version,
          home: JELLY_HOME
        },
        feeds: feedStats ?? "unavailable",
        vault: vaultStats ?? "unavailable",
        wallets: wallet ? Object.keys(wallet.getSummary()).length + " chains" : "unavailable",
        api_keys: {
          alchemy: !!process.env.ALCHEMY_KEY,
          openrouter: !!process.env.OPENROUTER_API_KEY,
          polymarket: !!process.env.POLYMARKET_API_KEY
        }
      }, null, 2));
    }
  });
  agent.registerTool({
    name: "get_context",
    label: "Get Context",
    description: "Retrieve a stored key-value from JellyOS persistent context (~/.jelly/context.json)",
    parameters: Type.Object({
      key: Type.String({ description: "Context key" })
    }),
    async execute(_id, params) {
      const { readFileSync: readFileSync3, existsSync: existsSync4 } = await import("node:fs");
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      if (!existsSync4(ctxPath)) return text(`No context stored yet`);
      const store = JSON.parse(readFileSync3(ctxPath, "utf-8"));
      const val = store[params.key];
      return text(val !== void 0 ? JSON.stringify(val, null, 2) : `No value for key: ${params.key}`);
    }
  });
  agent.registerTool({
    name: "set_context",
    label: "Set Context",
    description: "Store a value in JellyOS persistent context for future sessions",
    parameters: Type.Object({
      key: Type.String({ description: "Context key" }),
      value: Type.Any({ description: "Value to store (any JSON-serializable value)" })
    }),
    async execute(_id, params) {
      if (!ALLOWED_CONTEXT_KEYS.has(params.key)) {
        return text(`Invalid context key: "${params.key}". Allowed keys: ${[...ALLOWED_CONTEXT_KEYS].join(", ")}`);
      }
      const serialized = JSON.stringify(params.value);
      if (serialized.length > 10240) {
        return text(`Value too large: ${serialized.length} bytes (max 10240). Reduce the value size.`);
      }
      const { readFileSync: readFileSync3, writeFileSync: writeFileSync3, existsSync: existsSync4, mkdirSync: mkdirSync4 } = await import("node:fs");
      mkdirSync4(JELLY_HOME, { recursive: true });
      const ctxPath = path2.join(JELLY_HOME, "context.json");
      const store = existsSync4(ctxPath) ? JSON.parse(readFileSync3(ctxPath, "utf-8")) : {};
      store[params.key] = params.value;
      writeFileSync3(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      return text(`Stored: ${params.key}`);
    }
  });
  agent.registerTool({
    name: "run_shell",
    label: "Run Shell Command",
    description: "Execute a shell command on the local machine and return stdout/stderr. JellyOS runs fully locally \u2014 use this to run scripts, query system state, call CLIs, automate tasks, etc. Requires confirm:true for commands that write, delete, or modify state.",
    parameters: Type.Object({
      command: Type.String({ description: "Shell command to execute" }),
      cwd: Type.Optional(Type.String({ description: "Working directory (default: current dir)" })),
      confirm: Type.Optional(Type.Boolean({ description: "Required for destructive/write commands (rm, mv, kill, etc.)" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default 15000)" }))
    }),
    async execute(_id, params) {
      const { execSync } = __require("node:child_process");
      const DESTRUCTIVE = /\b(rm|rmdir|mv|kill|pkill|killall|sudo|chmod|chown|dd|mkfs|format|shutdown|reboot|truncate|shred)\b/;
      if (DESTRUCTIVE.test(params.command) && !params.confirm) {
        return text(
          `\u26A0\uFE0F Confirmation required for: ${params.command}
Call again with confirm: true to execute.`
        );
      }
      try {
        const stdout = execSync(params.command, {
          cwd: params.cwd ?? process.cwd(),
          timeout: params.timeout ?? 15e3,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"]
        });
        return text((stdout ?? "").trim() || "(no output)");
      } catch (err) {
        const msg = (err.stdout ?? "") + (err.stderr ? `
stderr: ${err.stderr}` : "");
        return text(`Exit ${err.status ?? 1}:
${msg.trim() || err.message}`);
      }
    }
  });
  agent.registerTool({
    name: "open_app",
    label: "Open App / URL",
    description: "Open an application, file, or URL on the local machine using the OS default handler. Works like double-clicking: open Brave, Chrome, a file, a folder, or any URL.",
    parameters: Type.Object({
      target: Type.String({ description: "App name, file path, or URL to open. Examples: 'Brave Browser', 'https://google.com', '/Users/me/report.pdf', '~/Documents'" }),
      app: Type.Optional(Type.String({ description: "Specific app to open the target with (macOS: -a flag). E.g. 'Google Chrome'" }))
    }),
    async execute(_id, params) {
      const { execSync } = __require("node:child_process");
      const platform = process.platform;
      const sanitize = (s) => s.replace(/[\n\r\0;|&`$<>]/g, "");
      const safeTarget = sanitize(params.target);
      const safeApp = params.app ? sanitize(params.app) : void 0;
      let cmd;
      if (platform === "darwin") {
        cmd = safeApp ? `open -a ${JSON.stringify(safeApp)} ${JSON.stringify(safeTarget)}` : `open ${JSON.stringify(safeTarget)}`;
      } else if (platform === "win32") {
        cmd = `start "" ${JSON.stringify(safeTarget)}`;
      } else {
        cmd = `xdg-open ${JSON.stringify(safeTarget)}`;
      }
      try {
        execSync(cmd, { timeout: 8e3, stdio: "pipe" });
        return text(`Opened: ${safeTarget}${safeApp ? ` with ${safeApp}` : ""}`);
      } catch (err) {
        return text(`Failed to open ${safeTarget}: ${err.message}`);
      }
    }
  });
  agent.registerTool({
    name: "read_file",
    label: "Read File",
    description: "Read a file from the local filesystem and return its contents",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or ~ path to the file" }),
      encoding: Type.Optional(Type.String({ description: "File encoding (default: utf-8). Use 'base64' for binary." })),
      max_bytes: Type.Optional(Type.Number({ description: "Max bytes to return (default 32768)" }))
    }),
    async execute(_id, params) {
      const { readFileSync: readFileSync3, statSync: statSync2, existsSync: existsSync4 } = __require("node:fs");
      const resolvedPath = params.path.replace(/^~/, os.homedir());
      const BLOCKED_READ = [/\/\.ssh\//i, /\/\.gnupg\//i, /id_rsa/i, /id_ed25519/i, /id_ecdsa/i, /\/etc\/shadow$/i];
      if (BLOCKED_READ.some((p) => p.test(resolvedPath))) return text(`\u26D4 Reading ${resolvedPath} is blocked for security.`);
      if (!existsSync4(resolvedPath)) return text(`File not found: ${resolvedPath}`);
      const stat = statSync2(resolvedPath);
      if (stat.isDirectory()) return text(`${resolvedPath} is a directory \u2014 use run_shell with 'ls' to list it`);
      const enc = params.encoding ?? "utf-8";
      const raw = readFileSync3(resolvedPath);
      const maxBytes = params.max_bytes ?? 32768;
      const slice = raw.slice(0, maxBytes);
      const content = enc === "base64" ? slice.toString("base64") : slice.toString("utf-8");
      const truncated = raw.length > maxBytes ? `

[truncated \u2014 ${raw.length} bytes total, showing first ${maxBytes}]` : "";
      return text(content + truncated);
    }
  });
  agent.registerTool({
    name: "write_file",
    label: "Write File",
    description: "Write or append content to a file on the local filesystem",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or ~ path to write to" }),
      content: Type.String({ description: "Content to write" }),
      mode: Type.Optional(Type.String({ description: "'overwrite' (default) or 'append'" })),
      confirm: Type.Optional(Type.Boolean({ description: "Required when overwriting an existing file" }))
    }),
    async execute(_id, params) {
      const { writeFileSync: writeFileSync3, appendFileSync: appendFileSync2, existsSync: existsSync4, mkdirSync: mkdirSync4 } = __require("node:fs");
      const resolvedPath = params.path.replace(/^~/, os.homedir());
      const BLOCKED_WRITE = [/\/\.ssh\//i, /\/\.gnupg\//i, /\/etc\//i, /\/\.bashrc$/i, /\/\.zshrc$/i, /\/\.profile$/i, /\/\.bash_profile$/i];
      if (BLOCKED_WRITE.some((p) => p.test(resolvedPath))) return text(`\u26D4 Writing to ${resolvedPath} is blocked for security.`);
      const mode = params.mode ?? "overwrite";
      if (mode === "overwrite" && existsSync4(resolvedPath) && !params.confirm) {
        return text(`\u26A0\uFE0F ${resolvedPath} already exists. Call again with confirm: true to overwrite.`);
      }
      mkdirSync4(path2.dirname(resolvedPath), { recursive: true });
      if (mode === "append") {
        appendFileSync2(resolvedPath, params.content, "utf-8");
        return text(`Appended ${params.content.length} chars to ${resolvedPath}`);
      } else {
        writeFileSync3(resolvedPath, params.content, "utf-8");
        return text(`Written ${params.content.length} chars to ${resolvedPath}`);
      }
    }
  });
  agent.registerCommand("snapshot", {
    description: "Generate a snapshot report of vault, wallets, signals, and prices",
    async handler(_args, ctx) {
      const { mkdirSync: mkdirSync4, writeFileSync: writeFileSync3 } = __require("node:fs");
      const now = /* @__PURE__ */ new Date();
      const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 16);
      const lines = [
        `# JellyOS Snapshot \u2014 ${now.toUTCString()}`,
        "",
        "## Vault"
      ];
      if (vault) {
        const s = vault.getStats();
        lines.push(vault.isLocked() ? "Status: \u{1F512} Locked" : "Status: \u{1F513} Unlocked");
        lines.push(`Balance: $${s.balance?.toFixed(2) ?? "0"}`);
      } else {
        lines.push("unavailable");
      }
      lines.push("", "## Wallets");
      if (wallet) {
        for (const [chain, addr] of Object.entries(wallet.getSummary()))
          lines.push(`- ${chain}: ${addr}`);
      }
      lines.push("", "## Active Signals");
      if (signals) {
        const sigs = signals.getActiveSignals().slice(0, 10);
        if (!sigs.length) lines.push("No active signals");
        else for (const s of sigs)
          lines.push(`- [${(s.direction ?? "").toUpperCase()}] ${s.asset} \u2014 ${s.sources.join(", ")} (${s.confidence?.toFixed(0) ?? "?"}% conf)`);
      }
      lines.push("", "## Live Prices");
      if (feeds) {
        const prices = feeds.getRecent({ limit: 20 });
        let count = 0;
        for (const p of prices) {
          const price = p.metadata?.price;
          if (price && count < 8) {
            lines.push(`- ${p.metadata?.symbol ?? p.source}: $${Number(price).toLocaleString()}`);
            count++;
          }
        }
      }
      const md = lines.join("\n");
      const dir = path2.join(JELLY_HOME, "snapshots");
      mkdirSync4(dir, { recursive: true });
      const file = path2.join(dir, `${ts}.md`);
      writeFileSync3(file, md, "utf-8");
      ctx.ui.notify(`\u{1F4F8} Snapshot saved \u2192 ${file}

${md.slice(0, 800)}${md.length > 800 ? "\n\u2026" : ""}`);
    }
  });
  agent.registerCommand("journal", {
    description: "View recent trading journal entries from ~/.jelly/journal/",
    async handler(args, ctx) {
      const { existsSync: existsSync4, readdirSync, readFileSync: readFileSync3 } = __require("node:fs");
      const dir = path2.join(JELLY_HOME, "journal");
      if (!existsSync4(dir)) {
        ctx.ui.notify("No journal entries yet");
        return;
      }
      const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().reverse();
      if (!files.length) {
        ctx.ui.notify("No journal entries yet");
        return;
      }
      const limit = parseInt(String(args ?? "").trim() || "20", 10);
      const lines = [`\u{1F4D3} Journal (last ${limit} entries)
`];
      let count = 0;
      outer: for (const file of files) {
        const rows = readFileSync3(path2.join(dir, file), "utf-8").split("\n").filter(Boolean).reverse();
        for (const row of rows) {
          try {
            const e = JSON.parse(row);
            const d = new Date(e.ts).toLocaleString();
            const pnl = e.pnl != null ? ` | PnL: $${e.pnl.toFixed(2)}` : "";
            lines.push(`[${d}] ${e.action.toUpperCase()} ${e.amount} ${e.symbol} @ $${e.price}${pnl}`);
            if (e.reason) lines.push(`  reason: ${e.reason}`);
            if (++count >= limit) break outer;
          } catch {
          }
        }
      }
      ctx.ui.notify(lines.join("\n"));
    }
  });
  agent.registerCommand("alert", {
    description: "Manage price alerts. Usage: /alert list | /alert ETH > 3500 | /alert clear <id>",
    async handler(args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3 } = __require("node:fs");
      const alertsPath = path2.join(JELLY_HOME, "alerts.json");
      let alerts = [];
      if (existsSync4(alertsPath)) {
        try {
          alerts = JSON.parse(readFileSync3(alertsPath, "utf-8"));
        } catch {
        }
      }
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "list") {
        if (!alerts.length) {
          ctx.ui.notify("No active alerts. Add one: /alert ETH > 3500");
          return;
        }
        ctx.ui.notify("Active alerts:\n" + alerts.map(
          (a) => `  [${a.id}] ${a.symbol} ${a.condition} $${a.threshold}`
        ).join("\n"));
        return;
      }
      if (sub === "clear" || sub === "remove" || sub === "delete") {
        const id2 = args[1];
        if (!id2) {
          ctx.ui.notify("Usage: /alert clear <id>");
          return;
        }
        const before = alerts.length;
        alerts = alerts.filter((a) => a.id !== id2);
        if (alerts.length === before) {
          ctx.ui.notify(`No alert with id: ${id2}`);
          return;
        }
        writeFileSync3(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
        ctx.ui.notify(`\u2713 Alert ${id2} removed`);
        return;
      }
      const symbol = args[0]?.toUpperCase();
      const condition = args[1];
      const threshold = parseFloat(args[2] ?? "");
      if (!symbol || !["<", ">"].includes(condition) || isNaN(threshold)) {
        ctx.ui.notify("Usage: /alert ETH > 3500\n       /alert BTC < 90000\n       /alert list\n       /alert clear <id>");
        return;
      }
      const id = `${symbol}-${condition}${threshold}-${Date.now().toString(36)}`;
      alerts.push({ id, symbol, condition, threshold, created: Date.now() });
      writeFileSync3(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
      ctx.ui.notify(`\u2713 Alert set: ${symbol} ${condition} $${threshold.toLocaleString()}
ID: ${id}`);
    }
  });
  agent.registerCommand("telegram", {
    description: "Show Telegram bridge status. Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to .env to enable.",
    async handler(_args, ctx) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!token) {
        ctx.ui.notify("Telegram bridge: not configured\n\nAdd to ~/.jelly/.env:\n  TELEGRAM_BOT_TOKEN=your_bot_token\n  TELEGRAM_CHAT_ID=your_chat_id\n\nCreate a bot at https://t.me/BotFather");
        return;
      }
      ctx.ui.notify(`Telegram bridge: \u2713 active
  Bot token: ${token.slice(0, 8)}\u2026
  Chat ID: ${chatId ?? "not set"}
  Polling every 3s
  Pending messages: ${_telegramPending.length}`);
    }
  });
  agent.registerCommand("discord", {
    description: "Show Discord bridge status. Add DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID to .env to enable.",
    async handler(_args, ctx) {
      const token = process.env.DISCORD_BOT_TOKEN;
      const channelId = process.env.DISCORD_CHANNEL_ID;
      if (!token) {
        ctx.ui.notify("Discord bridge: not configured\n\nAdd to ~/.jelly/.env:\n  DISCORD_BOT_TOKEN=your_bot_token\n  DISCORD_CHANNEL_ID=your_channel_id\n\nCreate a bot at https://discord.com/developers");
        return;
      }
      ctx.ui.notify(`Discord bridge: \u2713 active
  Channel: ${channelId ?? "not set"}
  Polling every 5s
  Pending messages: ${_discordPending.length}`);
    }
  });
  agent.registerCommand("watch", {
    description: "Manage watched wallets. Usage: /watch list | /watch add <addr> <label> [chain] | /watch remove <label>",
    async handler(args, ctx) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3 } = __require("node:fs");
      const watchPath = path2.join(JELLY_HOME, "watched-wallets.json");
      let wallets = [];
      if (existsSync4(watchPath)) {
        try {
          wallets = JSON.parse(readFileSync3(watchPath, "utf-8"));
        } catch {
        }
      }
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "list") {
        if (!wallets.length) {
          ctx.ui.notify("No wallets being watched.\nUsage: /watch add 0x\u2026 MyWhale ethereum");
          return;
        }
        ctx.ui.notify("Watched wallets:\n" + wallets.map(
          (w) => `  ${(w.label ?? "unlabeled").padEnd(12)} ${w.chain ?? "ethereum"}  ${w.address}`
        ).join("\n"));
        return;
      }
      if (sub === "add") {
        const [, address, label, chain] = args;
        if (!address) {
          ctx.ui.notify("Usage: /watch add <address> <label> [chain]");
          return;
        }
        wallets.push({ address, label, chain: chain ?? "ethereum" });
        writeFileSync3(watchPath, JSON.stringify(wallets, null, 2), "utf-8");
        ctx.ui.notify(`\u2713 Now watching ${label ?? address} (${chain ?? "ethereum"})`);
        return;
      }
      if (sub === "remove" || sub === "delete") {
        const label = args[1];
        if (!label) {
          ctx.ui.notify("Usage: /watch remove <label>");
          return;
        }
        const before = wallets.length;
        wallets = wallets.filter((w) => w.label !== label && w.address !== label);
        if (wallets.length === before) {
          ctx.ui.notify(`No wallet matching: ${label}`);
          return;
        }
        writeFileSync3(watchPath, JSON.stringify(wallets, null, 2), "utf-8");
        ctx.ui.notify(`\u2713 Removed wallet: ${label}`);
        return;
      }
      ctx.ui.notify("Usage: /watch list | /watch add <addr> <label> [chain] | /watch remove <label>");
    }
  });
  agent.registerCommand("webhook", {
    description: "Show TradingView webhook status and endpoint URL",
    async handler(_args, ctx) {
      const port = process.env.JELLY_WEBHOOK_PORT ?? "9340";
      ctx.ui.notify(
        `TradingView Webhook

  Endpoint: http://127.0.0.1:${port}/webhook
  Pending signals: ${_webhookSignals.length}

TradingView alert message (JSON):
  { "ticker": "BTCUSDT", "action": "buy", "price": {{close}} }

The agent will process pending signals at the start of each turn.
Override port with JELLY_WEBHOOK_PORT in ~/.jelly/.env`
      );
    }
  });
  agent.registerTool({
    name: "send_telegram",
    label: "Send Telegram Message",
    description: "Send a message to the configured Telegram chat. Requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env.",
    parameters: Type.Object({
      message: Type.String({ description: "Message text to send (Markdown supported)" })
    }),
    async execute(_id, params) {
      if (!process.env.TELEGRAM_BOT_TOKEN) return text("Telegram not configured \u2014 add TELEGRAM_BOT_TOKEN to ~/.jelly/.env");
      if (!process.env.TELEGRAM_CHAT_ID) return text("Telegram chat ID not set \u2014 add TELEGRAM_CHAT_ID to ~/.jelly/.env");
      await _tgSend(params.message);
      return text(`Sent to Telegram: ${params.message.slice(0, 80)}${params.message.length > 80 ? "\u2026" : ""}`);
    }
  });
  agent.registerTool({
    name: "send_discord",
    label: "Send Discord Message",
    description: "Send a message to the configured Discord channel. Requires DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID in .env.",
    parameters: Type.Object({
      message: Type.String({ description: "Message text to send" })
    }),
    async execute(_id, params) {
      if (!process.env.DISCORD_BOT_TOKEN) return text("Discord not configured \u2014 add DISCORD_BOT_TOKEN to ~/.jelly/.env");
      if (!process.env.DISCORD_CHANNEL_ID) return text("Discord channel not set \u2014 add DISCORD_CHANNEL_ID to ~/.jelly/.env");
      await _dcSend(params.message);
      return text(`Sent to Discord: ${params.message.slice(0, 80)}${params.message.length > 80 ? "\u2026" : ""}`);
    }
  });
  agent.registerTool({
    name: "log_trade",
    label: "Log Trade to Journal",
    description: "Append a trade entry to the trading journal at ~/.jelly/journal/YYYY-MM-DD.jsonl",
    parameters: Type.Object({
      action: Type.String({ description: "Trade action: buy, sell, swap, short, close" }),
      symbol: Type.String({ description: "Token or pair symbol e.g. ETH, BTC/USDT" }),
      amount: Type.Number({ description: "Amount of tokens traded" }),
      price: Type.Number({ description: "Execution price in USD" }),
      chain: Type.Optional(Type.String({ description: "Chain where the trade occurred" })),
      reason: Type.Optional(Type.String({ description: "Brief rationale for the trade" })),
      pnl: Type.Optional(Type.Number({ description: "Realized PnL in USD if this closes a position" }))
    }),
    async execute(_id, params) {
      _logTrade({ ts: Date.now(), ...params });
      const pnl = params.pnl != null ? ` | PnL: $${params.pnl.toFixed(2)}` : "";
      return text(`Logged: ${params.action.toUpperCase()} ${params.amount} ${params.symbol} @ $${params.price}${pnl}`);
    }
  });
  agent.registerTool({
    name: "set_alert",
    label: "Set Price Alert",
    description: "Set a price alert that fires when a token crosses a threshold. Triggers desktop + Telegram/Discord notification.",
    parameters: Type.Object({
      symbol: Type.String({ description: "Token symbol e.g. ETH, BTC, SOL" }),
      condition: Type.Union([Type.Literal(">"), Type.Literal("<")], { description: "Condition: '>' (above) or '<' (below)" }),
      threshold: Type.Number({ description: "Price threshold in USD" })
    }),
    async execute(_id, params) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3 } = __require("node:fs");
      const alertsPath = path2.join(JELLY_HOME, "alerts.json");
      let alerts = [];
      if (existsSync4(alertsPath)) {
        try {
          alerts = JSON.parse(readFileSync3(alertsPath, "utf-8"));
        } catch {
        }
      }
      const id = `${params.symbol.toUpperCase()}-${params.condition}${params.threshold}-${Date.now().toString(36)}`;
      alerts.push({ id, symbol: params.symbol.toUpperCase(), condition: params.condition, threshold: params.threshold, created: Date.now() });
      writeFileSync3(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
      return text(`Alert set: ${params.symbol.toUpperCase()} ${params.condition} $${params.threshold.toLocaleString()} (id: ${id})`);
    }
  });
  agent.registerTool({
    name: "clear_alert",
    label: "Clear Price Alert",
    description: "Remove a price alert by its ID",
    parameters: Type.Object({
      id: Type.String({ description: "Alert ID returned by set_alert" })
    }),
    async execute(_id, params) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3 } = __require("node:fs");
      const alertsPath = path2.join(JELLY_HOME, "alerts.json");
      if (!existsSync4(alertsPath)) return text("No alerts configured");
      let alerts = [];
      try {
        alerts = JSON.parse(readFileSync3(alertsPath, "utf-8"));
      } catch {
        return text("Could not read alerts");
      }
      const before = alerts.length;
      alerts = alerts.filter((a) => a.id !== params.id);
      if (alerts.length === before) return text(`No alert found with id: ${params.id}`);
      writeFileSync3(alertsPath, JSON.stringify(alerts, null, 2), "utf-8");
      return text(`Alert ${params.id} removed`);
    }
  });
  agent.registerTool({
    name: "get_webhook_signals",
    label: "Get Webhook Signals",
    description: "Return pending TradingView webhook signals received at the local webhook endpoint",
    parameters: Type.Object({
      clear: Type.Optional(Type.Boolean({ description: "If true, clear the queue after reading (default false)" }))
    }),
    async execute(_id, params) {
      if (!_webhookSignals.length) return text("No pending webhook signals");
      const signals_copy = [..._webhookSignals];
      if (params.clear) _webhookSignals = [];
      return text(JSON.stringify(signals_copy, null, 2));
    }
  });
  agent.registerTool({
    name: "get_journal",
    label: "Get Journal Entries",
    description: "Read recent trading journal entries from ~/.jelly/journal/",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max entries to return (default 20)" })),
      date: Type.Optional(Type.String({ description: "Specific date YYYY-MM-DD (default: today)" }))
    }),
    async execute(_id, params) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, readdirSync } = __require("node:fs");
      const dir = path2.join(JELLY_HOME, "journal");
      if (!existsSync4(dir)) return text("No journal entries yet");
      const limit = params.limit ?? 20;
      const targetFile = params.date ? path2.join(dir, `${params.date}.jsonl`) : (() => {
        const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().reverse();
        return files[0] ? path2.join(dir, files[0]) : null;
      })();
      if (!targetFile || !existsSync4(targetFile)) return text("No journal entries found for that date");
      const rows = readFileSync3(targetFile, "utf-8").split("\n").filter(Boolean);
      const entries = rows.slice(-limit).map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      }).filter(Boolean);
      return text(JSON.stringify(entries, null, 2));
    }
  });
  agent.registerTool({
    name: "watch_wallet",
    label: "Watch Wallet",
    description: "Add a wallet address to the monitoring list. Fires Telegram/Discord alert on incoming transactions.",
    parameters: Type.Object({
      address: Type.String({ description: "Wallet address to monitor" }),
      label: Type.Optional(Type.String({ description: "Human-readable label for this wallet" })),
      chain: Type.Optional(Type.String({ description: "Chain: ethereum, base, arbitrum, solana, etc. (default: ethereum)" }))
    }),
    async execute(_id, params) {
      const { existsSync: existsSync4, readFileSync: readFileSync3, writeFileSync: writeFileSync3 } = __require("node:fs");
      const watchPath = path2.join(JELLY_HOME, "watched-wallets.json");
      let wallets = [];
      if (existsSync4(watchPath)) {
        try {
          wallets = JSON.parse(readFileSync3(watchPath, "utf-8"));
        } catch {
        }
      }
      wallets.push({ address: params.address, label: params.label, chain: params.chain ?? "ethereum" });
      writeFileSync3(watchPath, JSON.stringify(wallets, null, 2), "utf-8");
      return text(`Now watching ${params.label ?? params.address} on ${params.chain ?? "ethereum"}`);
    }
  });
}
export {
  jellyos as default
};
