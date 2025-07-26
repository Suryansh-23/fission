export interface ChainClient {
    createSrcEscrow(chainId: number, order: any, signature: string, fillAmount: bigint): Promise<{ txHash: string; blockHash: string }>;
    createDstEscrow(): Promise<any>;
    withdrawFromEscrow(): Promise<any>;
    cancelOrder(side: 'src' | 'dst', escrowAddress: string, immutables: any): Promise<{ txHash: string; blockHash: string }>;
    getAddress(): string;
    isHealthy(): Promise<boolean>;
    getFinalityLockTimeout(): number;
}

// TODO: Add methods for balance, gas estimation, and transaction sending
// @note assuming the params (and return data) and underlying mechanism for using sdk to interact with the contract will be same across chains

