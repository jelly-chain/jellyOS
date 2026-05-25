import { Logger } from '../../core/utils/Logger';

export interface AlchemyConfig {
  apiKey: string;
  network: string;
  maxRetries: number;
  batchSize: number;
}

export class AlchemyClient {
  private logger: Logger;
  private config: AlchemyConfig;
  private baseUrl: string;

  constructor(config?: Partial<AlchemyConfig>) {
    this.config = {
      apiKey: process.env.ALCHEMY_KEY || '',
      network: 'eth-mainnet',
      maxRetries: 3,
      batchSize: 100,
      ...config,
    };
    this.logger = new Logger('AlchemyClient');
    this.baseUrl = `https://${this.config.network}.g.alchemy.com/v2/${this.config.apiKey}`;
  }

  private getUrl(path: string = ''): string {
    return `${this.baseUrl}${path}`;
  }

  private async rpc(method: string, params: any[] = []): Promise<any> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(this.getUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const data = await response.json() as any;
        if (data.error) throw new Error(data.error.message);
        return data.result;
      } catch (error) {
        if (attempt === this.config.maxRetries - 1) throw error;
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
      }
    }
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.rpc('eth_blockNumber');
    return parseInt(result, 16);
  }

  async getBalance(address: string): Promise<string> {
    return await this.rpc('eth_getBalance', [address, 'latest']);
  }

  async getTransactionReceipt(txHash: string): Promise<any> {
    return await this.rpc('eth_getTransactionReceipt', [txHash]);
  }

  async getTransaction(txHash: string): Promise<any> {
    return await this.rpc('eth_getTransactionByHash', [txHash]);
  }

  async getTokenBalances(address: string, contractAddresses: string[]): Promise<any> {
    return await this.rpc('alchemy_getTokenBalances', [address, contractAddresses]);
  }

  async getTokenMetadata(contractAddress: string): Promise<any> {
    return await this.rpc('alchemy_getTokenMetadata', [contractAddress]);
  }

  async getLogs(params: any): Promise<any[]> {
    return await this.rpc('eth_getLogs', [params]);
  }

  async getAssetTransfers(params: any): Promise<any> {
    return await this.rpc('alchemy_getAssetTransfers', [params]);
  }

  async getTokenAllowance(params: any): Promise<string> {
    return await this.rpc('alchemy_getTokenAllowance', [params]);
  }

  async simulateAssetChanges(params: any): Promise<any> {
    return await this.rpc('alchemy_simulateAssetChanges', [params]);
  }

  async estimateGas(tx: any): Promise<string> {
    return await this.rpc('eth_estimateGas', [tx]);
  }

  async getGasPrice(): Promise<string> {
    return await this.rpc('eth_gasPrice');
  }

  async getFeeHistory(blockCount: number, newestBlock: string, rewardPercentiles: number[]): Promise<any> {
    return await this.rpc('eth_feeHistory', [blockCount, newestBlock, rewardPercentiles]);
  }

  async getBlockByNumber(blockNumber: number, fullTx: boolean = false): Promise<any> {
    return await this.rpc('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, fullTx]);
  }

  async traceTransaction(txHash: string): Promise<any> {
    return await this.rpc('trace_transaction', [txHash]);
  }

  async getContractLogs(address: string, fromBlock: number, toBlock: number): Promise<any[]> {
    return await this.getLogs({
      address,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
    });
  }

  async getNftMetadata(contractAddress: string, tokenId: string): Promise<any> {
    return await this.rpc('alchemy_getNftMetadata', [contractAddress, tokenId]);
  }

  async getOwnedNfts(address: string): Promise<any> {
    return await this.rpc('alchemy_getNfts', [address]);
  }

  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.baseUrl = `https://${this.config.network}.g.alchemy.com/v2/${apiKey}`;
  }

  supportsChain(networkName: string): boolean {
    const supportedNetworks = [
      'ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'avalanche',
      'fantom', 'cronos', 'bsc', 'celo', 'gnosis', 'scroll', 'linea', 'zksync',
      'mantle', 'blast', 'berachain', 'opbnb', 'polygonzkevm', 'metis',
      'rootstock', 'sei', 'sonic'
    ];
    return supportedNetworks.includes(networkName.toLowerCase());
  }
}