import { Logger } from '../../core/utils/Logger';

export class SolanaClient {
  private logger: Logger;
  private rpcUrl: string;
  private commitment: string;

  constructor(rpcUrl?: string) {
    this.rpcUrl = rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.commitment = 'confirmed';
    this.logger = new Logger('SolanaClient');
  }

  setRpcUrl(url: string): void { this.rpcUrl = url; }

  private async rpc(method: string, params: any[] = []): Promise<any> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await response.json() as any;
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async getBalance(address: string): Promise<number> {
    return await this.rpc('getBalance', [address]);
  }

  async getTokenAccountBalance(tokenAccount: string): Promise<any> {
    return await this.rpc('getTokenAccountBalance', [tokenAccount]);
  }

  async getTokenAccountsByOwner(owner: string, mint?: string): Promise<any> {
    const filter = mint
      ? { mint }
      : { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' };
    return await this.rpc('getTokenAccountsByOwner', [owner, filter]);
  }

  async getRecentBlockhash(): Promise<string> {
    const result = await this.rpc('getRecentBlockhash');
    return result.blockhash;
  }

  async getBlock(blockNumber: number): Promise<any> {
    return await this.rpc('getBlock', [blockNumber]);
  }

  async getTransaction(txSignature: string): Promise<any> {
    return await this.rpc('getTransaction', [txSignature]);
  }

  async getSignaturesForAddress(address: string, limit: number = 100): Promise<any[]> {
    return await this.rpc('getSignaturesForAddress', [address, { limit }]);
  }

  async sendTransaction(tx: string): Promise<string> {
    return await this.rpc('sendTransaction', [tx]);
  }

  async simulateTransaction(tx: string): Promise<any> {
    return await this.rpc('simulateTransaction', [tx]);
  }

  async getAccountInfo(address: string): Promise<any> {
    return await this.rpc('getAccountInfo', [address]);
  }

  async getProgramAccounts(programId: string): Promise<any[]> {
    return await this.rpc('getProgramAccounts', [programId]);
  }

  async getMultipleAccounts(addresses: string[]): Promise<any[]> {
    return await this.rpc('getMultipleAccounts', [addresses]);
  }

  async getSlot(): Promise<number> {
    return await this.rpc('getSlot');
  }

  async getEpochInfo(): Promise<any> {
    return await this.rpc('getEpochInfo');
  }

  async getSupply(): Promise<any> {
    return await this.rpc('getSupply');
  }

  async getInflationRate(): Promise<any> {
    return await this.rpc('getInflationRate');
  }

  async requestAirdrop(address: string, lamports: number): Promise<string> {
    return await this.rpc('requestAirdrop', [address, lamports]);
  }

  async getMinimumBalanceForRentExemption(dataLength: number): Promise<number> {
    return await this.rpc('getMinimumBalanceForRentExemption', [dataLength]);
  }

  async getLatestBlockhash(): Promise<any> {
    return await this.rpc('getLatestBlockhash', [{ commitment: this.commitment }]);
  }
}