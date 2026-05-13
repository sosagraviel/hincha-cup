import Spinnies from 'spinnies';
import chalk from 'chalk';

interface AgentStatus {
  id: string;
  name: string;
  status: 'running' | 'success' | 'failure' | 'warning';
  message: string;
  startTime: number;
}

/**
 * Concurrent agent tracker using Spinnies for multi-line spinner display
 */
export class ConcurrentAgentTracker {
  private agents: Map<string, AgentStatus> = new Map();
  private spinnies: Spinnies | null = null;
  private isActive = false;

  /**
   * Initialize Spinnies instance
   */
  private initSpinnies(): void {
    if (!this.spinnies) {
      this.spinnies = new Spinnies({
        spinner: {
          interval: 80,
          frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        },
        color: 'cyan',
        succeedColor: 'green',
        failColor: 'red',
        spinnerColor: 'cyan',
      });
    }
  }

  /**
   * Format agent label with lavender color
   */
  private formatAgentLabel(name: string): string {
    const lavender = chalk.hex('#9EA1D4');
    return lavender(`[${name}]`);
  }

  /**
   * Start tracking a new agent
   */
  start(id: string, name: string, message: string): void {
    this.initSpinnies();

    this.agents.set(id, {
      id,
      name,
      status: 'running',
      message,
      startTime: Date.now(),
    });

    const formattedText = `${this.formatAgentLabel(name)} ${message}`;

    this.spinnies!.add(id, {
      text: formattedText,
      color: 'cyan',
    });

    this.isActive = true;
  }

  /**
   * Update an agent's message
   */
  update(id: string, message: string): void {
    const agent = this.agents.get(id);
    if (agent && this.spinnies) {
      agent.message = message;
      const formattedText = `${this.formatAgentLabel(agent.name)} ${message}`;
      this.spinnies.update(id, { text: formattedText });
    }
  }

  /**
   * Mark an agent as successful
   */
  succeed(id: string, message?: string): void {
    const agent = this.agents.get(id);
    if (agent && this.spinnies) {
      agent.status = 'success';
      if (message) {
        agent.message = message;
      }
      const formattedText = `${this.formatAgentLabel(agent.name)} ${agent.message}`;
      this.spinnies.succeed(id, { text: formattedText });
    }
    this.checkIfAllComplete();
  }

  /**
   * Mark an agent as failed
   */
  fail(id: string, message?: string): void {
    const agent = this.agents.get(id);
    if (agent && this.spinnies) {
      agent.status = 'failure';
      if (message) {
        agent.message = message;
      }
      const formattedText = `${this.formatAgentLabel(agent.name)} ${agent.message}`;
      this.spinnies.fail(id, { text: formattedText });
    }
    this.checkIfAllComplete();
  }

  /**
   * Mark an agent as warning
   */
  warn(id: string, message?: string): void {
    const agent = this.agents.get(id);
    if (agent && this.spinnies) {
      agent.status = 'warning';
      if (message) {
        agent.message = message;
      }
      const formattedText = `${this.formatAgentLabel(agent.name)} ${agent.message}`;
      this.spinnies.update(id, {
        text: `${chalk.yellow('⚠')} ${formattedText}`,
        status: 'stopped',
      });
    }
    this.checkIfAllComplete();
  }

  /**
   * Returns true when at least one tracked agent is in the `running`
   * state — i.e. Spinnies is actively re-rendering its display.
   */
  isAnyAgentRunning(): boolean {
    if (!this.isActive) return false;
    for (const agent of this.agents.values()) {
      if (agent.status === 'running') return true;
    }
    return false;
  }

  /**
   * Stop tracking all agents and clear display
   */
  stop(): void {
    if (this.spinnies) {
      this.spinnies.stopAll();
    }
    this.agents.clear();
    this.spinnies = null;
    this.isActive = false;
  }

  /**
   * Stop tracking and render final state
   */
  done(): void {
    if (this.spinnies) {
      this.spinnies.stopAll('succeed');
    }
    this.isActive = false;
  }

  /**
   * Check if all agents are complete and stop rendering if so
   */
  private checkIfAllComplete(): void {
    const allComplete = Array.from(this.agents.values()).every(
      (agent) => agent.status !== 'running',
    );

    if (allComplete && this.isActive) {
      if (this.spinnies) {
        this.spinnies.stopAll();
      }
      this.isActive = false;
    }
  }
}

let globalTracker: ConcurrentAgentTracker | null = null;

/**
 * Get or create the global concurrent agent tracker
 */
export function getGlobalTracker(): ConcurrentAgentTracker {
  if (!globalTracker) {
    globalTracker = new ConcurrentAgentTracker();
  }
  return globalTracker;
}

/**
 * Returns true if a global tracker is rendering spinners RIGHT NOW.
 * Used by `Logger.warn` / `Logger.error` to decide whether they need
 * to print a leading newline so they don't get spliced into the
 * spinner's current line on the shared terminal display (both stdout
 * and stderr write to the same TTY cell range).
 */
export function hasActiveTracker(): boolean {
  return globalTracker?.isAnyAgentRunning() ?? false;
}

/**
 * Stop and clear the global tracker
 */
export function stopGlobalTracker(): void {
  if (globalTracker) {
    globalTracker.stop();
    globalTracker = null;
  }
}
