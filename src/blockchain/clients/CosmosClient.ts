import { Logger } from '../../core/utils/Logger';

export class CosmosClient {
  private logger: Logger;
  private rpcUrl: string;

  constructor(rpcUrl?: string) {
    this.rpcUrl = rpcUrl || 'https://rpc.cosmos.network';
    this.logger = new Logger('CosmosClient');
  }

  private async rest(endpoint: string): Promise<any> {
    const response = await fetch(`${this.rpcUrl.replace('/rpc', '')}${endpoint}`);
    return await response.json();
  }

  async getBalance(address: string, denom: string = 'uatom'): Promise<any> {
    return await this.rest(`/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${denom}`);
  }

  async getAllBalances(address: string): Promise<any> {
    return await this.rest(`/cosmos/bank/v1beta1/balances/${address}`);
  }

  async getAccount(address: string): Promise<any> {
    return await this.rest(`/cosmos/auth/v1beta1/accounts/${address}`);
  }

  async getLatestBlock(): Promise<any> {
    return await this.rest('/cosmos/base/tendermint/v1beta1/blocks/latest');
  }

  async getBlockByHeight(height: number): Promise<any> {
    return await this.rest(`/cosmos/base/tendermint/v1beta1/blocks/${height}`);
  }

  async getValidators(): Promise<any> {
    return await this.rest('/cosmos/staking/v1beta1/validators');
  }

  async getDelegations(delegator: string): Promise<any> {
    return await this.rest(`/cosmos/staking/v1beta1/delegations/${delegator}`);
  }

  async getUnbondingDelegations(delegator: string): Promise<any> {
    return await this.rest(`/cosmos/staking/v1beta1/delegators/${delegator}/unbonding_delegations`);
  }

  async getProposals(): Promise<any> {
    return await this.rest('/cosmos/gov/v1beta1/proposals');
  }

  async getProposal(id: number): Promise<any> {
    return await this.rest(`/cosmos/gov/v1beta1/proposals/${id}`);
  }

  async getVotes(proposalId: number): Promise<any> {
    return await this.rest(`/cosmos/gov/v1beta1/proposals/${proposalId}/votes`);
  }

  async getInflation(): Promise<any> {
    return await this.rest('/cosmos/mint/v1beta1/inflation');
  }

  async getSupply(): Promise<any> {
    return await this.rest('/cosmos/bank/v1beta1/supply');
  }

  async getStakingPool(): Promise<any> {
    return await this.rest('/cosmos/staking/v1beta1/pool');
  }

  async getNodeInfo(): Promise<any> {
    return await this.rest('/cosmos/base/tendermint/v1beta1/node_info');
  }

  async getTx(hash: string): Promise<any> {
    return await this.rest(`/cosmos/tx/v1beta1/txs/${hash}`);
  }

  async getTxsByEvent(event: string, limit: number = 50): Promise<any> {
    return await this.rest(`/cosmos/tx/v1beta1/txs?events=${event}&pagination.limit=${limit}`);
  }

  async getIbcDenoms(): Promise<any> {
    return await this.rest('/ibc/apps/transfer/v1/denom_traces');
  }

  async getValidatorsDelegations(): Promise<any> {
    return await this.rest('/cosmos/staking/v1beta1/delegations');
  }
}