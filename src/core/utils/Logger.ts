import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: string;
  meta?: any;
  error?: Error;
  duration?: number;
}

export interface LoggerConfig {
  level: LogLevel;
  fileOutput: boolean;
  consoleOutput: boolean;
  logDirectory: string;
  maxFileSize: number;
  maxFiles: number;
  includeTimestamp: boolean;
  colorize: boolean;
  jsonOutput: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  fileOutput: true,
  consoleOutput: false,
  logDirectory: './logs',
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 10,
  includeTimestamp: true,
  colorize: true,
  jsonOutput: false,
};

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

export class Logger {
  private config: LoggerConfig;
  private contextName: string;
  private logStream: fs.WriteStream | null = null;
  private currentFileSize: number = 0;
  private fileHandle: number | null = null;
  private logBuffer: LogEntry[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  constructor(contextName: string, config?: Partial<LoggerConfig>) {
    this.contextName = contextName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  private initialize(): void {
    if (this.config.fileOutput) {
      this.ensureLogDirectory();
      this.rotateLogFileIfNeeded();
      this.bufferFlushInterval = setInterval(() => this.flushBuffer(), 5000);
    }
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDirectory)) {
      fs.mkdirSync(this.config.logDirectory, { recursive: true });
    }
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.config.logDirectory, `jellyos-${date}.log`);
  }

  private rotateLogFileIfNeeded(): void {
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

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const levelName = entry.levelName.padEnd(5, ' ');
    const context = entry.context ? `[${entry.context}] ` : '';

    if (this.config.jsonOutput) {
      return JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.levelName,
        context: entry.context,
        message: entry.message,
        meta: entry.meta,
      });
    }

    let line = `${timestamp} ${levelName} ${context}${entry.message}`;

    if (entry.meta && Object.keys(entry.meta).length > 0) {
      line += ` ${util.inspect(entry.meta, { depth: null, colors: false })}`;
    }

    if (entry.error) {
      line += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        line += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return line;
  }

  private writeToConsole(entry: LogEntry): void {
    if (!this.config.consoleOutput) return;

    const message = this.formatMessage(entry);
    const color = this.config.colorize ? this.getLevelColor(entry.level) : '';
    const colorReset = this.config.colorize ? COLORS.reset : '';

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`${color}${message}${colorReset}`);
        break;
      case LogLevel.INFO:
        console.info(`${color}${message}${colorReset}`);
        break;
      case LogLevel.WARN:
        console.warn(`${color}${message}${colorReset}`);
        break;
      case LogLevel.ERROR:
        console.error(`${color}${message}${colorReset}`);
        break;
      case LogLevel.FATAL:
        console.error(`${color}${message}${colorReset}`);
        break;
    }
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return COLORS.gray;
      case LogLevel.INFO: return COLORS.green;
      case LogLevel.WARN: return COLORS.yellow;
      case LogLevel.ERROR: return COLORS.red;
      case LogLevel.FATAL: return COLORS.magenta;
      default: return COLORS.white;
    }
  }

  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    if (this.logBuffer.length >= 100) {
      this.flushBuffer();
    }
  }

  private flushBuffer(): void {
    if (this.logBuffer.length === 0) return;

    const logPath = this.getLogFilePath();
    const batchSize = Math.min(this.logBuffer.length, 50);
    const batch = this.logBuffer.splice(0, batchSize);

    for (const entry of batch) {
      const line = this.formatMessage(entry) + '\n';
      this.currentFileSize += Buffer.byteLength(line);
      fs.appendFileSync(logPath, line, 'utf8');
    }
  }

  private log(level: LogLevel, message: string, meta?: any, error?: Error): void {
    if (level < this.config.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LogLevel[level],
      context: this.contextName,
      message,
      meta,
      error,
    };

    this.writeToConsole(entry);
    if (this.config.fileOutput) {
      this.addToBuffer(entry);
    }
  }

  debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, errorOrMeta?: Error | any): void {
    if (errorOrMeta instanceof Error) {
      this.log(LogLevel.ERROR, message, undefined, errorOrMeta);
    } else {
      this.log(LogLevel.ERROR, message, errorOrMeta);
    }
  }

  fatal(message: string, errorOrMeta?: Error | any): void {
    if (errorOrMeta instanceof Error) {
      this.log(LogLevel.FATAL, message, undefined, errorOrMeta);
    } else {
      this.log(LogLevel.FATAL, message, errorOrMeta);
    }
  }

  child(context: string): Logger {
    return new Logger(`${this.contextName}:${context}`, this.config);
  }

  startTimer(operation: string): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e6;
      this.info(`${operation} completed`, { durationMs: duration.toFixed(2) });
      return duration;
    };
  }

  time(message: string, duration: number): void {
    this.info(message, { durationMs: duration.toFixed(2) });
  }

  async close(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }
    this.flushBuffer();
  }

  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}