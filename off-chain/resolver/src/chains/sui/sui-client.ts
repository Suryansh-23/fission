import { SuiConfig } from "../../config/chain";
import { ChainClient } from "../interface/chain-interface";

export class SuiClient implements ChainClient {
    private config: SuiConfig;

    // Finality lock timeout for Sui chain (in milliseconds)
    private static readonly FINALITY_LOCK_TIMEOUT = 10000;

    constructor(config: SuiConfig) {
        this.config = config;
        console.log("SuiClient initialized with config");
    }
    
    async createSrcEscrow(chainId: number, order: any, signature: string, fillAmount: bigint): Promise<{ txHash: string; blockHash: string }> {
        // TODO: Implement Sui source escrow deployment
        throw new Error("Sui createSrcEscrow not implemented yet");
    }

    async createDstEscrow(): Promise<any> {}

    async withdrawFromEscrow(): Promise<any> {}

    /**
     * Cancel escrow on Sui chain (placeholder implementation)
     * @param side - Whether this is source ('src') or destination ('dst') escrow
     * @param escrowAddress - Address of the escrow contract to cancel
     * @param immutables - Immutables object for the escrow
     */
    async cancelOrder(
        side: 'src' | 'dst', 
        escrowAddress: string, 
        immutables: any
    ): Promise<{ txHash: string; blockHash: string }> {
        // TODO: Implement Sui escrow cancellation
        console.log(`TODO: Cancel ${side} escrow at address: ${escrowAddress} on Sui`);
        throw new Error("Sui cancelOrder not implemented yet");
    }

    getAddress(): string {
        return ""
    }

    async isHealthy(): Promise<boolean> {
        return true; 
    }

    // Get finality lock timeout for this chain
    public getFinalityLockTimeout(): number {
        return SuiClient.FINALITY_LOCK_TIMEOUT;
    }
}