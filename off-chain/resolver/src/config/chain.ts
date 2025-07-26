export interface EVMConfig {
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  relayerContractAddress: string;
  escrowFactoryAddress: string;
  escrowImplementationAddress: string; // For address calculation
  gasMultiplier?: number;
  maxGasPrice?: bigint;
  confirmations?: number;
}

export interface SuiConfig {
  network: string;
  privateKey: string;
  relayerPackageId: string;
  escrowFactoryAddress: string;
  escrowImplementationAddress: string; // For address calculation
  gasBudget: number;
  masxGasPrice?: number;
}