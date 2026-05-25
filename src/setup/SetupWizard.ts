import { Logger } from '../core/utils/Logger';
import { ContextStore } from '../context/ContextStore';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import * as readline from 'readline';
import { homedir } from 'os';

export interface SetupState {
  step: number;
  completed: boolean;
  config: Record<string, any>;
  environment: Record<string, string>;
}

export class SetupWizard {
  private logger: Logger;
  private context: ContextStore;
  private state: SetupState;

  constructor(context: ContextStore) {
    this.context = context;
    this.logger = new Logger('SetupWizard');
    this.state = { step: 0, completed: false, config: {}, environment: {} };
  }

  async run(): Promise<SetupState> {
    this.logger.info('Starting JellyOS setup wizard...');
    this.printBanner();

    await this.stepWelcome();
    await this.stepEnvironment();
    await this.stepBlockchain();
    await this.stepAgents();
    await this.stepTrading();
    await this.stepSummary();
    await this.stepSave();

    this.state.completed = true;
    this.logger.info('Setup completed successfully!');
    return this.state;
  }

  private printBanner(): void {
    console.log(`
╔══════════════════════════════════════════════════╗
║           JellyOS Setup Wizard v1.0.0            ║
║   AI Prediction & Trading System Configuration   ║
╚══════════════════════════════════════════════════╝
    `);
  }

  private async ask(question: string, defaultValue: string = ''): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      rl.question(`  ${question} ${defaultValue ? `[${defaultValue}]: ` : ': '}`, answer => {
        rl.close();
        resolve(answer || defaultValue);
      });
    });
  }

  private async stepWelcome(): Promise<void> {
    console.log('\nStep 1: Welcome\n');
    console.log('This wizard will help you configure JellyOS for your environment.');
    console.log('You can press Enter to accept default values.\n');
    await this.ask('Press Enter to continue...');
    this.state.step++;
  }

  private async stepEnvironment(): Promise<void> {
    console.log('\n--- Step 2: Environment Configuration ---\n');

    this.state.config.mode = await this.ask('Environment mode', 'development');
    this.state.config.apiPort = await this.ask('API port', '3000');
    this.state.config.maxAgents = await this.ask('Maximum agents', '10');

    this.state.environment.ALCHEMY_KEY = await this.ask('Alchemy API key', '');
    this.state.environment.SOLANA_RPC_URL = await this.ask('Solana RPC URL', 'https://api.mainnet-beta.solana.com');

    this.state.step++;
  }

  private async stepBlockchain(): Promise<void> {
    console.log('\n--- Step 3: Blockchain Configuration ---\n');
    console.log('Select chains to monitor (comma-separated):');
    console.log('  ethereum, bsc, solana, arbitrum, base, polygon, avalanche');

    const chains = await this.ask('Chains', 'ethereum,bsc,solana');
    this.state.config.chains = chains.split(',').map((c: string) => c.trim());

    const predictionMarkets = await this.ask('Prediction markets', 'polymarket,kalshi,jupiter');
    this.state.config.predictionMarkets = predictionMarkets.split(',').map((m: string) => m.trim());

    this.state.step++;
  }

  private async stepAgents(): Promise<void> {
    console.log('\n--- Step 4: Agent Configuration ---\n');

    this.state.config.enableBlockchainAgent = await this.ask('Enable Blockchain Agent?', 'true');
    this.state.config.enableSentimentAgent = await this.ask('Enable Sentiment Agent?', 'true');
    this.state.config.enableTradingAgent = await this.ask('Enable Trading Agent?', 'false');

    const riskTolerance = await this.ask('Risk tolerance (1=low, 5=high)', '3');
    this.state.config.riskTolerance = parseInt(riskTolerance);

    this.state.step++;
  }

  private async stepTrading(): Promise<void> {
    console.log('\n--- Step 5: Trading Configuration ---\n');

    this.state.config.tradingEnabled = (await this.ask('Enable automated trading?', 'false')).toLowerCase() === 'true';
    this.state.config.maxPositionSize = await this.ask('Max position size (0-1)', '0.2');
    this.state.config.stopLoss = await this.ask('Default stop loss (0-1)', '0.05');
    this.state.config.takeProfit = await this.ask('Default take profit (0-1)', '0.15');

    this.state.step++;
  }

  private async stepSummary(): Promise<void> {
    console.log('\n--- Configuration Summary ---\n');
    console.log(JSON.stringify(this.state.config, null, 2));
    console.log('');
    const confirm = await this.ask('Apply this configuration?', 'yes');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Setup cancelled. Run "jellyos setup" to restart.');
      process.exit(0);
    }
    this.state.step++;
  }

  private async stepSave(): Promise<void> {
    const basePath = resolve(homedir(), '.jellyos');
    const configPath = resolve(basePath, 'config', 'config.json');
    const envPath = resolve(basePath, '.env');

    // Ensure directories exist
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true });
    }
    if (!existsSync(resolve(basePath, 'config'))) {
      mkdirSync(resolve(basePath, 'config'), { recursive: true });
    }

    writeFileSync(configPath, JSON.stringify(this.state.config, null, 2), 'utf-8');
    this.logger.info(`Configuration saved to ${configPath}`);

    const envContent = Object.entries(this.state.environment)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    writeFileSync(envPath, envContent, 'utf-8');
    this.logger.info(`Environment saved to ${envPath}`);

    this.state.step++;
  }
}