export { ConfigLoader, config } from './ConfigLoader';
export { EnvLoader, env } from './EnvLoader';
export { CheckpointManager, checkpoints } from './CheckpointManager';
export { TaskQueue, TaskQueueConfig, Task, TaskStatus, taskQueue } from './TaskQueue';
export { TaskDispatcher, Worker, DispatcherConfig, dispatcher } from './TaskDispatcher';

export type { JellyOSConfig, SystemConfig, AgentConfig, BlockchainConfig, PredictionConfig, TradingConfig, ContextConfig, LoggingConfig, FeatureFlags } from './ConfigLoader';

import { ConfigLoader } from './ConfigLoader';
import { EnvLoader } from './EnvLoader';
import { CheckpointManager } from './CheckpointManager';
import { TaskQueue } from './TaskQueue';
import { TaskDispatcher } from './TaskDispatcher';

export class JellyBrain {
  private config: ConfigLoader;
  private env: EnvLoader;
  private checkpoints: CheckpointManager;
  private taskQueue: TaskQueue;
  private dispatcher: TaskDispatcher;
  private initialized: boolean = false;

  constructor(configPath?: string) {
    this.config = new ConfigLoader(configPath);
    this.env = new EnvLoader();
    this.checkpoints = new CheckpointManager();
    this.taskQueue = new TaskQueue();
    this.dispatcher = new TaskDispatcher(this.taskQueue);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.config.validate();
    this.dispatcher.start();
    this.initialized = true;
  }

  getConfig() { return this.config.getConfig(); }
  getCheckpoints() { return this.checkpoints; }
  getTaskQueue() { return this.taskQueue; }
  getDispatcher() { return this.dispatcher; }
  getEnv() { return this.env; }

  isInitialized(): boolean { return this.initialized; }

  async shutdown(): Promise<void> {
    this.dispatcher.stop();
    this.checkpoints.close();
    this.initialized = false;
  }
}

export const jellyBrain = new JellyBrain();