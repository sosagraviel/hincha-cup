import ora, { Ora } from 'ora';
import chalk from 'chalk';
import {
  getGlobalTracker,
  hasActiveTracker,
  stopGlobalTracker,
} from './concurrent-agent-tracker.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5,
}

/**
 * Centralized logger with formatting, spinners, and context support
 */
export class Logger {
  private currentLevel: LogLevel;
  private context: string;
  private indent: number;
  private spinners: Map<string, Ora>;

  constructor(context: string = '', level: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.currentLevel = level;
    this.indent = 0;
    this.spinners = new Map();
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  setContext(context: string): void {
    this.context = context;
  }

  increaseIndent(): void {
    this.indent += 2;
  }

  decreaseIndent(): void {
    this.indent = Math.max(0, this.indent - 2);
  }

  resetIndent(): void {
    this.indent = 0;
  }

  /**
   * Format a message with context, prefix, and custom bracket color
   * @param message - The message to format
   * @param prefix - Optional prefix (like emoji icons)
   * @param bracketColor - Hex color for brackets (default: #9EA1D4), or 'dim' for dimmed gray
   */
  private format(message: string, prefix?: string, bracketColor: string = '#9EA1D4'): string {
    const indentation = ' '.repeat(this.indent);

    let contextStr = '';
    if (this.context) {
      if (bracketColor === 'dim') {
        contextStr = chalk.dim(`[${this.context}]`) + ' ';
      } else {
        const customColor = chalk.hex(bracketColor);
        contextStr = customColor(`[${this.context}]`) + ' ';
      }
    }

    const prefixStr = prefix ? prefix + ' ' : '';

    return `${indentation}${prefixStr}${contextStr}${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.DEBUG) return;

    const formatted = this.format(message, chalk.gray('⚙'));
    console.log(chalk.gray(formatted), ...args);
  }

  info(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.INFO) return;

    const formatted = this.format(message, chalk.blue('ℹ'));
    console.log(formatted, ...args);
  }

  success(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.SUCCESS) return;

    const formatted = this.format(message, chalk.green('✓'));
    console.log(chalk.green(formatted), ...args);
  }

  warn(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.WARN) return;

    const formatted = this.format(message, chalk.yellow('⚠'));
    const prefix = hasActiveTracker() ? '\n' : '';
    console.error(prefix + chalk.yellow(formatted), ...args);
  }

  error(message: string, error?: Error, ...args: any[]): void {
    if (this.currentLevel > LogLevel.ERROR) return;

    const formatted = this.format(message, chalk.red('✗'));
    console.error(chalk.red(formatted), ...args);

    if (error) {
      this.increaseIndent();

      if (error.message) {
        console.error(chalk.red(this.format(`Message: ${error.message}`)));
      }

      if (error.stack) {
        console.error(chalk.dim(this.format('Stack trace:')));
        const stackLines = error.stack.split('\n').slice(1);
        stackLines.forEach((line) => {
          console.error(chalk.dim(this.format(line.trim())));
        });
      }

      this.decreaseIndent();
    }
  }

  /**
   * Create a standard spinner with dimmed gray context brackets
   */
  spinner(text: string, id?: string): Ora {
    return this.createSpinner(text, id, 'dim');
  }

  /**
   * Create an agent-specific spinner with lavender (#9EA1D4) context brackets
   * Use this for per-agent/per-phase spinners
   */
  agentSpinner(text: string, id?: string): Ora {
    return this.createSpinner(text, id); // Uses default #9EA1D4
  }

  /**
   * Internal method to create spinners with custom bracket color
   * @param text - Spinner text
   * @param id - Optional spinner ID for later reference
   * @param bracketColor - Hex color for brackets (default: #9EA1D4), or 'dim' for dimmed gray
   */
  private createSpinner(text: string, id?: string, bracketColor: string = '#9EA1D4'): Ora {
    const spinnerId = id || text;

    if (this.spinners.has(spinnerId)) {
      this.spinners.get(spinnerId)?.stop();
    }

    const indentation = ' '.repeat(this.indent);

    let contextStr = '';
    if (this.context) {
      if (bracketColor === 'dim') {
        contextStr = chalk.dim(`[${this.context}]`) + ' ';
      } else {
        const customColor = chalk.hex(bracketColor);
        contextStr = customColor(`[${this.context}]`) + ' ';
      }
    }

    const fullText = `${indentation}${contextStr}${text}`;

    const spinner = ora({
      text: fullText,
      color: 'cyan',
      spinner: 'dots',
    }).start();

    this.spinners.set(spinnerId, spinner);
    return spinner;
  }

  updateSpinner(id: string, text: string, bracketColor: string = '#9EA1D4'): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      const indentation = ' '.repeat(this.indent);
      let contextStr = '';
      if (this.context) {
        if (bracketColor === 'dim') {
          contextStr = chalk.dim(`[${this.context}]`) + ' ';
        } else {
          const customColor = chalk.hex(bracketColor);
          contextStr = customColor(`[${this.context}]`) + ' ';
        }
      }
      spinner.text = `${indentation}${contextStr}${text}`;
    }
  }

  succeedSpinner(id: string, text?: string, bracketColor: string = '#9EA1D4'): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        let contextStr = '';
        if (this.context) {
          if (bracketColor === 'dim') {
            contextStr = chalk.dim(`[${this.context}]`) + ' ';
          } else {
            const customColor = chalk.hex(bracketColor);
            contextStr = customColor(`[${this.context}]`) + ' ';
          }
        }
        spinner.succeed(`${indentation}${contextStr}${text}`);
      } else {
        spinner.succeed();
      }
      this.spinners.delete(id);
    }
  }

  failSpinner(id: string, text?: string, bracketColor: string = '#9EA1D4'): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        let contextStr = '';
        if (this.context) {
          if (bracketColor === 'dim') {
            contextStr = chalk.dim(`[${this.context}]`) + ' ';
          } else {
            const customColor = chalk.hex(bracketColor);
            contextStr = customColor(`[${this.context}]`) + ' ';
          }
        }
        spinner.fail(`${indentation}${contextStr}${text}`);
      } else {
        spinner.fail();
      }
      this.spinners.delete(id);
    }
  }

  warnSpinner(id: string, text?: string, bracketColor: string = '#9EA1D4'): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        let contextStr = '';
        if (this.context) {
          if (bracketColor === 'dim') {
            contextStr = chalk.dim(`[${this.context}]`) + ' ';
          } else {
            const customColor = chalk.hex(bracketColor);
            contextStr = customColor(`[${this.context}]`) + ' ';
          }
        }
        spinner.warn(`${indentation}${contextStr}${text}`);
      } else {
        spinner.warn();
      }
      this.spinners.delete(id);
    }
  }

  infoSpinner(id: string, text?: string, bracketColor: string = '#9EA1D4'): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        let contextStr = '';
        if (this.context) {
          if (bracketColor === 'dim') {
            contextStr = chalk.dim(`[${this.context}]`) + ' ';
          } else {
            const customColor = chalk.hex(bracketColor);
            contextStr = customColor(`[${this.context}]`) + ' ';
          }
        }
        spinner.info(`${indentation}${contextStr}${text}`);
      } else {
        spinner.info();
      }
      this.spinners.delete(id);
    }
  }

  stopAllSpinners(): void {
    this.spinners.forEach((spinner) => spinner.stop());
    this.spinners.clear();

    stopGlobalTracker();
  }

  /**
   * Start tracking a concurrent agent (uses log-update multi-line display)
   * Use this for parallel agent execution (e.g., Phase 1 analyzers)
   */
  trackConcurrentAgentStart(id: string, name: string, message: string): void {
    const tracker = getGlobalTracker();
    tracker.start(id, name, message);
  }

  /**
   * Mark a concurrent agent as successful
   */
  trackConcurrentAgentSucceed(id: string, message?: string): void {
    const tracker = getGlobalTracker();
    tracker.succeed(id, message);
  }

  /**
   * Mark a concurrent agent as failed
   */
  trackConcurrentAgentFail(id: string, message?: string): void {
    const tracker = getGlobalTracker();
    tracker.fail(id, message);
  }

  /**
   * Mark a concurrent agent as warning
   */
  trackConcurrentAgentWarn(id: string, message?: string): void {
    const tracker = getGlobalTracker();
    tracker.warn(id, message);
  }

  /**
   * Update a concurrent agent's message
   */
  trackConcurrentAgentUpdate(id: string, message: string): void {
    const tracker = getGlobalTracker();
    tracker.update(id, message);
  }

  /**
   * Stop concurrent agent tracking
   */
  stopConcurrentTracking(): void {
    stopGlobalTracker();
  }

  section(title: string): void {
    console.log();
    console.log(chalk.bold.cyan(`━━━ ${title} ━━━`));
    console.log();
  }

  divider(): void {
    console.log(chalk.dim('─'.repeat(60)));
  }

  blank(): void {
    console.log();
  }

  keyValue(
    key: string,
    value: string,
    color: 'green' | 'blue' | 'yellow' | 'red' | 'gray' = 'blue',
  ): void {
    const indentation = ' '.repeat(this.indent);
    const colorFn = {
      green: chalk.green,
      blue: chalk.blue,
      yellow: chalk.yellow,
      red: chalk.red,
      gray: chalk.gray,
    }[color];

    console.log(`${indentation}${chalk.dim(key + ':')} ${colorFn(value)}`);
  }

  table(data: Record<string, string>, title?: string): void {
    if (title) {
      this.info(chalk.bold(title));
      this.increaseIndent();
    }

    const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));

    Object.entries(data).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      this.keyValue(paddedKey, value);
    });

    if (title) {
      this.decreaseIndent();
    }
  }

  child(context: string): Logger {
    const childContext = this.context ? `${this.context}:${context}` : context;
    const child = new Logger(childContext, this.currentLevel);
    child.indent = this.indent;
    return child;
  }
}

export const logger = new Logger('orchestration');

const envLevel = process.env.LOG_LEVEL?.toUpperCase();
if (envLevel && envLevel in LogLevel) {
  logger.setLevel(LogLevel[envLevel as keyof typeof LogLevel]);
}
