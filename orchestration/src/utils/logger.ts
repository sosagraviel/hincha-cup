import ora, { Ora } from 'ora';
import chalk from 'chalk';

/**
 * Log levels for filtering output
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARN = 3,
  ERROR = 4,
  SILENT = 5
}

/**
 * Centralized logger with beautiful formatting using chalk and ora
 *
 * Features:
 * - Color-coded log levels (debug, info, success, warn, error)
 * - Icons for visual distinction
 * - Spinners for long-running operations
 * - Context prefixes (e.g., [agent-name])
 * - Indentation support
 * - Stack trace formatting
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

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Set context prefix for all logs
   */
  setContext(context: string): void {
    this.context = context;
  }

  /**
   * Increase indentation level
   */
  increaseIndent(): void {
    this.indent += 2;
  }

  /**
   * Decrease indentation level
   */
  decreaseIndent(): void {
    this.indent = Math.max(0, this.indent - 2);
  }

  /**
   * Reset indentation
   */
  resetIndent(): void {
    this.indent = 0;
  }

  /**
   * Format message with context and indentation
   */
  private format(message: string, prefix?: string): string {
    const indentation = ' '.repeat(this.indent);
    const contextStr = this.context ? chalk.dim(`[${this.context}]`) + ' ' : '';
    const prefixStr = prefix ? prefix + ' ' : '';

    return `${indentation}${prefixStr}${contextStr}${message}`;
  }

  /**
   * DEBUG: Gray, for detailed diagnostics
   */
  debug(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.DEBUG) return;

    const formatted = this.format(message, chalk.gray('⚙'));
    console.log(chalk.gray(formatted), ...args);
  }

  /**
   * INFO: Blue, for general information
   */
  info(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.INFO) return;

    const formatted = this.format(message, chalk.blue('ℹ'));
    console.log(formatted, ...args);
  }

  /**
   * SUCCESS: Green, for successful operations
   */
  success(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.SUCCESS) return;

    const formatted = this.format(message, chalk.green('✓'));
    console.log(chalk.green(formatted), ...args);
  }

  /**
   * WARN: Yellow, for warnings
   */
  warn(message: string, ...args: any[]): void {
    if (this.currentLevel > LogLevel.WARN) return;

    const formatted = this.format(message, chalk.yellow('⚠'));
    console.log(chalk.yellow(formatted), ...args);
  }

  /**
   * ERROR: Red, for errors
   */
  error(message: string, error?: Error, ...args: any[]): void {
    if (this.currentLevel > LogLevel.ERROR) return;

    const formatted = this.format(message, chalk.red('✗'));
    console.error(chalk.red(formatted), ...args);

    // Print error details if provided
    if (error) {
      this.increaseIndent();

      if (error.message) {
        console.error(chalk.red(this.format(`Message: ${error.message}`)));
      }

      if (error.stack) {
        console.error(chalk.dim(this.format('Stack trace:')));
        const stackLines = error.stack.split('\n').slice(1); // Skip first line (already shown)
        stackLines.forEach(line => {
          console.error(chalk.dim(this.format(line.trim())));
        });
      }

      this.decreaseIndent();
    }
  }

  /**
   * Create and start a spinner for long-running operations
   */
  spinner(text: string, id?: string): Ora {
    const spinnerId = id || text;

    // Stop existing spinner if any
    if (this.spinners.has(spinnerId)) {
      this.spinners.get(spinnerId)?.stop();
    }

    const indentation = ' '.repeat(this.indent);
    const contextStr = this.context ? chalk.dim(`[${this.context}]`) + ' ' : '';
    const fullText = `${indentation}${contextStr}${text}`;

    const spinner = ora({
      text: fullText,
      color: 'cyan',
      spinner: 'dots'
    }).start();

    this.spinners.set(spinnerId, spinner);
    return spinner;
  }

  /**
   * Update spinner text
   */
  updateSpinner(id: string, text: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      const indentation = ' '.repeat(this.indent);
      const contextStr = this.context ? chalk.dim(`[${this.context}]`) + ' ' : '';
      spinner.text = `${indentation}${contextStr}${text}`;
    }
  }

  /**
   * Stop spinner with success
   */
  succeedSpinner(id: string, text?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        const contextStr = this.context ? chalk.dim(`[${this.context}]`) + ' ' : '';
        spinner.succeed(`${indentation}${contextStr}${text}`);
      } else {
        spinner.succeed();
      }
      this.spinners.delete(id);
    }
  }

  /**
   * Stop spinner with failure
   */
  failSpinner(id: string, text?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        const contextStr = this.context ? chalk.dim(`[${this.context}]`) + ' ' : '';
        spinner.fail(`${indentation}${contextStr}${text}`);
      } else {
        spinner.fail();
      }
      this.spinners.delete(id);
    }
  }

  /**
   * Stop spinner with warning
   */
  warnSpinner(id: string, text?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        const contextStr = this.context ? chalk.dim(`[${this.context}]`) + ' ' : '';
        spinner.warn(`${indentation}${contextStr}${text}`);
      } else {
        spinner.warn();
      }
      this.spinners.delete(id);
    }
  }

  /**
   * Stop spinner with info
   */
  infoSpinner(id: string, text?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      if (text) {
        const indentation = ' '.repeat(this.indent);
        const contextStr = this.context ? chalk.dim(`[${this.context}]`) + ' ' : '';
        spinner.info(`${indentation}${contextStr}${text}`);
      } else {
        spinner.info();
      }
      this.spinners.delete(id);
    }
  }

  /**
   * Stop all active spinners
   */
  stopAllSpinners(): void {
    this.spinners.forEach(spinner => spinner.stop());
    this.spinners.clear();
  }

  /**
   * Print a section header
   */
  section(title: string): void {
    console.log();
    console.log(chalk.bold.cyan(`━━━ ${title} ━━━`));
    console.log();
  }

  /**
   * Print a divider
   */
  divider(): void {
    console.log(chalk.dim('─'.repeat(60)));
  }

  /**
   * Print a blank line
   */
  blank(): void {
    console.log();
  }

  /**
   * Print key-value pairs in a formatted way
   */
  keyValue(key: string, value: string, color: 'green' | 'blue' | 'yellow' | 'red' | 'gray' = 'blue'): void {
    const indentation = ' '.repeat(this.indent);
    const colorFn = {
      green: chalk.green,
      blue: chalk.blue,
      yellow: chalk.yellow,
      red: chalk.red,
      gray: chalk.gray
    }[color];

    console.log(`${indentation}${chalk.dim(key + ':')} ${colorFn(value)}`);
  }

  /**
   * Print a table-like structure
   */
  table(data: Record<string, string>, title?: string): void {
    if (title) {
      this.info(chalk.bold(title));
      this.increaseIndent();
    }

    const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));

    Object.entries(data).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      this.keyValue(paddedKey, value);
    });

    if (title) {
      this.decreaseIndent();
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger {
    const childContext = this.context ? `${this.context}:${context}` : context;
    const child = new Logger(childContext, this.currentLevel);
    child.indent = this.indent;
    return child;
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger('orchestration');

/**
 * Set global log level from environment variable
 */
const envLevel = process.env.LOG_LEVEL?.toUpperCase();
if (envLevel && envLevel in LogLevel) {
  logger.setLevel(LogLevel[envLevel as keyof typeof LogLevel]);
}
