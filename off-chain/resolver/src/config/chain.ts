export interface EVMConfig {
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  relayerContractAddress: string;
  escrowFactoryAddress: string;
  gasMultiplier?: number;
  maxGasPrice?: bigint;
  confirmations?: number;
}

export interface SuiConfig {
  network: string;
  privateKey: string;
  relayerPackageId: string;
  escrowFactoryAddress: string;
  gasBudget: number;
  maxGasPrice?: number;
}