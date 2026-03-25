import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../../../src/utils/logger.js';

describe('Logger', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Constructor and Configuration', () => {
    it('should create logger with default values', () => {
      const logger = new Logger();
      expect(logger).toBeDefined();
    });

    it('should create logger with context', () => {
      const logger = new Logger('test-context');
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should create logger with custom log level', () => {
      const logger = new Logger('test', LogLevel.ERROR);
      logger.info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should set log level', () => {
      const logger = new Logger();
      logger.setLevel(LogLevel.ERROR);
      logger.info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should set context', () => {
      const logger = new Logger();
      logger.setContext('new-context');
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('Indentation', () => {
    it('should increase indent', () => {
      const logger = new Logger();
      logger.increaseIndent();
      logger.info('indented message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should decrease indent', () => {
      const logger = new Logger();
      logger.increaseIndent();
      logger.decreaseIndent();
      logger.info('message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not go below zero indent', () => {
      const logger = new Logger();
      logger.decreaseIndent();
      logger.decreaseIndent();
      logger.info('message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should reset indent', () => {
      const logger = new Logger();
      logger.increaseIndent();
      logger.increaseIndent();
      logger.resetIndent();
      logger.info('message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('Logging Methods', () => {
    it('should log debug message when level is DEBUG', () => {
      const logger = new Logger('test', LogLevel.DEBUG);
      logger.debug('debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('debug message');
    });

    it('should not log debug message when level is INFO', () => {
      const logger = new Logger('test', LogLevel.INFO);
      logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log info message', () => {
      const logger = new Logger('test', LogLevel.INFO);
      logger.info('info message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('info message');
    });

    it('should log success message', () => {
      const logger = new Logger('test', LogLevel.SUCCESS);
      logger.success('success message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('success message');
    });

    it('should log warn message', () => {
      const logger = new Logger('test', LogLevel.WARN);
      logger.warn('warn message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('warn message');
    });

    it('should log error message', () => {
      const logger = new Logger('test', LogLevel.ERROR);
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('error message');
    });

    it('should log error with error object', () => {
      const logger = new Logger('test', LogLevel.ERROR);
      const error = new Error('test error');
      logger.error('error message', error);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should respect log level hierarchy', () => {
      const logger = new Logger('test', LogLevel.ERROR);
      logger.debug('debug');
      logger.info('info');
      logger.success('success');
      logger.warn('warn');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should not log when level is SILENT', () => {
      const logger = new Logger('test', LogLevel.SILENT);
      logger.debug('debug');
      logger.info('info');
      logger.success('success');
      logger.warn('warn');
      logger.error('error');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Formatting Methods', () => {
    it('should log section', () => {
      const logger = new Logger();
      logger.section('Test Section');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log divider', () => {
      const logger = new Logger();
      logger.divider();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log blank line', () => {
      const logger = new Logger();
      logger.blank();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log key-value pair', () => {
      const logger = new Logger();
      logger.keyValue('key', 'value');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log key-value with different colors', () => {
      const logger = new Logger();
      logger.keyValue('key1', 'value1', 'green');
      logger.keyValue('key2', 'value2', 'blue');
      logger.keyValue('key3', 'value3', 'yellow');
      logger.keyValue('key4', 'value4', 'red');
      logger.keyValue('key5', 'value5', 'gray');
      expect(consoleLogSpy).toHaveBeenCalledTimes(5);
    });

    it('should log table', () => {
      const logger = new Logger();
      const data = {
        'Key 1': 'Value 1',
        'Key 2': 'Value 2'
      };
      logger.table(data);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should log table with title', () => {
      const logger = new Logger();
      const data = {
        'Key 1': 'Value 1'
      };
      logger.table(data, 'Test Table');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('Spinner Methods', () => {
    it('should create and stop spinner', () => {
      const logger = new Logger();
      const spinner = logger.spinner('test spinner');
      expect(spinner).toBeDefined();
      logger.stopAllSpinners();
    });

    it('should create agent spinner', () => {
      const logger = new Logger('test');
      const spinner = logger.agentSpinner('agent task');
      expect(spinner).toBeDefined();
      logger.stopAllSpinners();
    });

    it('should create spinner with id', () => {
      const logger = new Logger();
      const spinner = logger.spinner('test', 'spinner-id');
      expect(spinner).toBeDefined();
      logger.stopAllSpinners();
    });

    it('should update spinner', () => {
      const logger = new Logger();
      logger.spinner('test', 'update-id');
      logger.updateSpinner('update-id', 'updated text');
      logger.stopAllSpinners();
    });

    it('should update spinner with custom bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'update-color-id');
      logger.updateSpinner('update-color-id', 'updated text', '#FF0000');
      logger.stopAllSpinners();
    });

    it('should update spinner with dim bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'update-dim-id');
      logger.updateSpinner('update-dim-id', 'updated text', 'dim');
      logger.stopAllSpinners();
    });

    it('should succeed spinner', () => {
      const logger = new Logger();
      logger.spinner('test', 'succeed-id');
      logger.succeedSpinner('succeed-id', 'success!');
    });

    it('should succeed spinner without text', () => {
      const logger = new Logger();
      logger.spinner('test', 'succeed-no-text-id');
      logger.succeedSpinner('succeed-no-text-id');
    });

    it('should succeed spinner with custom bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'succeed-color-id');
      logger.succeedSpinner('succeed-color-id', 'success!', '#00FF00');
    });

    it('should succeed spinner with dim bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'succeed-dim-id');
      logger.succeedSpinner('succeed-dim-id', 'success!', 'dim');
    });

    it('should fail spinner', () => {
      const logger = new Logger();
      logger.spinner('test', 'fail-id');
      logger.failSpinner('fail-id', 'failed!');
    });

    it('should fail spinner without text', () => {
      const logger = new Logger();
      logger.spinner('test', 'fail-no-text-id');
      logger.failSpinner('fail-no-text-id');
    });

    it('should fail spinner with custom bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'fail-color-id');
      logger.failSpinner('fail-color-id', 'failed!', '#FF0000');
    });

    it('should fail spinner with dim bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'fail-dim-id');
      logger.failSpinner('fail-dim-id', 'failed!', 'dim');
    });

    it('should warn spinner', () => {
      const logger = new Logger();
      logger.spinner('test', 'warn-id');
      logger.warnSpinner('warn-id', 'warning!');
    });

    it('should warn spinner without text', () => {
      const logger = new Logger();
      logger.spinner('test', 'warn-no-text-id');
      logger.warnSpinner('warn-no-text-id');
    });

    it('should warn spinner with custom bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'warn-color-id');
      logger.warnSpinner('warn-color-id', 'warning!', '#FFFF00');
    });

    it('should warn spinner with dim bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'warn-dim-id');
      logger.warnSpinner('warn-dim-id', 'warning!', 'dim');
    });

    it('should info spinner', () => {
      const logger = new Logger();
      logger.spinner('test', 'info-id');
      logger.infoSpinner('info-id', 'info!');
    });

    it('should info spinner without text', () => {
      const logger = new Logger();
      logger.spinner('test', 'info-no-text-id');
      logger.infoSpinner('info-no-text-id');
    });

    it('should info spinner with custom bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'info-color-id');
      logger.infoSpinner('info-color-id', 'info!', '#0000FF');
    });

    it('should info spinner with dim bracket color', () => {
      const logger = new Logger('test');
      logger.spinner('test', 'info-dim-id');
      logger.infoSpinner('info-dim-id', 'info!', 'dim');
    });

    it('should replace existing spinner with same id', () => {
      const logger = new Logger();
      logger.spinner('first', 'same-id');
      logger.spinner('second', 'same-id');
      logger.stopAllSpinners();
    });
  });

  describe('Child Logger', () => {
    it('should create child logger', () => {
      const parent = new Logger('parent');
      const child = parent.child('child');
      expect(child).toBeDefined();
      child.info('child message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should inherit parent log level', () => {
      const parent = new Logger('parent', LogLevel.ERROR);
      const child = parent.child('child');
      child.info('should not log');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should inherit parent indent', () => {
      const parent = new Logger('parent');
      parent.increaseIndent();
      const child = parent.child('child');
      child.info('indented child message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should create nested context', () => {
      const parent = new Logger('parent');
      const child = parent.child('child');
      child.info('nested message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[parent:child]');
    });
  });

  describe('Concurrent Agent Tracking', () => {
    it('should start tracking concurrent agent', () => {
      const logger = new Logger();
      logger.trackConcurrentAgentStart('agent-1', 'Agent 1', 'Processing...');
      logger.stopConcurrentTracking();
    });

    it('should succeed concurrent agent', () => {
      const logger = new Logger();
      logger.trackConcurrentAgentStart('agent-1', 'Agent 1', 'Processing...');
      logger.trackConcurrentAgentSucceed('agent-1', 'Completed!');
      logger.stopConcurrentTracking();
    });

    it('should fail concurrent agent', () => {
      const logger = new Logger();
      logger.trackConcurrentAgentStart('agent-1', 'Agent 1', 'Processing...');
      logger.trackConcurrentAgentFail('agent-1', 'Failed!');
      logger.stopConcurrentTracking();
    });

    it('should warn concurrent agent', () => {
      const logger = new Logger();
      logger.trackConcurrentAgentStart('agent-1', 'Agent 1', 'Processing...');
      logger.trackConcurrentAgentWarn('agent-1', 'Warning!');
      logger.stopConcurrentTracking();
    });

    it('should update concurrent agent', () => {
      const logger = new Logger();
      logger.trackConcurrentAgentStart('agent-1', 'Agent 1', 'Processing...');
      logger.trackConcurrentAgentUpdate('agent-1', 'Still processing...');
      logger.stopConcurrentTracking();
    });
  });

  describe('LogLevel Enum', () => {
    it('should have correct log level values', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.SUCCESS).toBe(2);
      expect(LogLevel.WARN).toBe(3);
      expect(LogLevel.ERROR).toBe(4);
      expect(LogLevel.SILENT).toBe(5);
    });
  });
});
