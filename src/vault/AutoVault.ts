import { VaultManager } from './VaultManager';
import { Logger } from '../core/utils/Logger';

export class AutoVault {
  private vault: VaultManager;
  private logger: Logger;
  private threshold: number;
  private checkInterval: NodeJS.Timeout | null = null;
  private onSweep: ((amount: number) => void) | null = null;

  constructor(vault: VaultManager) {
    this.vault = vault;
    this.logger = new Logger('AutoVault');
    this.threshold = parseFloat(process.env.AUTO_VAULT_THRESHOLD || '500');
  }

  start(getPnL: () => number, onSweep?: (amount: number) => void): void {
    this.onSweep = onSweep || null;
    this.checkInterval = setInterval(() => this.check(getPnL), 60_000);
    this.logger.info(`AutoVault started — threshold: $${this.threshold}`);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async check(getPnL: () => number): Promise<void> {
    const pnl = getPnL();
    if (pnl >= this.threshold && !this.vault.isLocked()) {
      const sweepAmount = Math.round(pnl * 100) / 100;
      try {
        await this.vault.sweep(sweepAmount, `auto-sweep P&L $${sweepAmount.toFixed(2)} (threshold: $${this.threshold})`);
        this.logger.info(`Auto-swept $${sweepAmount.toFixed(2)} to vault`);
        if (this.onSweep) this.onSweep(sweepAmount);
      } catch (err: any) {
        this.logger.error('Auto-sweep failed', err);
      }
    }
  }

  updateThreshold(amount: number): void {
    this.threshold = amount;
    this.logger.info(`AutoVault threshold updated to $${amount}`);
  }
}
