export interface EVMConfig {
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  resolverContractAddress: string;
  escrowFactoryAddress: string;
  gasMultiplier?: number;
  maxGasPrice?: bigint;
  confirmations?: number;
}

export interface SuiConfig {
  network: string;
  rpcUrl: string;
  privateKey: string;
  packageId: string;
  registryObjectId: string;
  relayerPackageId: string;
  escrowFactoryAddress: string;
  gasBudget: number;
  maxGasPrice?: number;
}
