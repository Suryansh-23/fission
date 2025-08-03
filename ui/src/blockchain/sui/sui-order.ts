import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiTransactionBlockResponse } from "@mysten/sui/client";

export interface CreateOrderParams {
    receiver: string; // eth address
    makingAmount: bigint; // user gives
    takingAmount: bigint; // user receives
    makerAsset: Uint8Array; // asset type user gives
    takerAsset: Uint8Array; // asset type user receives
    salt: Uint8Array; // ? 
    isPartialFillAllowed: boolean; // from toggle button
    isMultipleFillsAllowed: boolean; // from toggle button
    depositAmount: bigint; // vs makingAmount ??
    coinType: string; // sui or usdc
    startTime: bigint; // unix timestamp
    duration: bigint; // ? 
    initialRateBump: bigint; // ? 
    pointsAndTimeDeltas: Uint8Array; // ? 
}

export interface OrderInfo {
    orderId: string;
    maker: string;
    receiver: string;
    orderHash: Uint8Array;
    makingAmount: bigint;
    takingAmount: bigint;
    remainingAmount: bigint;
    filledAmount: bigint;
    isPartialFillAllowed: boolean;
    isMultipleFillsAllowed: boolean;
    isActive: boolean;
}

// Type for wallet signing - can be either keypair or wallet
type Signer = Ed25519Keypair | {
  signAndExecuteTransaction: (params: { transaction: Transaction }) => Promise<{ digest: string; effects?: any; objectChanges?: any; events?: any; }>;
} | null;

export class SuiOrder {
    public static readonly SUI_TYPE = '0x2::sui::SUI';
    public static readonly USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

    private client: SuiClient;
    private signer: Signer;

    constructor(client: SuiClient, signer: Signer) {
        this.client = client;
        this.signer = signer;
    }

    async createOrder(params: CreateOrderParams, callerPackageId: string): Promise<SuiTransactionBlockResponse> {
        // params.coinType can be either sui or usdc
        console.log('[SuiOrder] Creating order with package ID:', callerPackageId);
        console.log('[SuiOrder] Receiver (EVM address):', params.receiver);
        console.log('[SuiOrder] Making amount:', params.makingAmount.toString());
        console.log('[SuiOrder] Taking amount:', params.takingAmount.toString());
        console.log('[SuiOrder] Coin type:', params.coinType);
        console.log('[SuiOrder] Partial fills allowed:', params.isPartialFillAllowed);
        console.log('[SuiOrder] Multiple fills allowed:', params.isMultipleFillsAllowed);
        console.log('[SuiOrder] Deposit amount:', params.depositAmount.toString());
        console.log('[SuiOrder] Start time:', params.startTime.toString());
        console.log('[SuiOrder] Salt:', params.salt);
        console.log('[SuiOrder] Maker asset', params.makerAsset);
        console.log('[SuiOrder] Taker asset', params.takerAsset);
        console.log('[SuiOrder] Signer type:', this.signer ? 'available' : 'null');
        console.log('[SuiOrder] Signer properties:', this.signer ? Object.keys(this.signer) : 'N/A');
        console.log('[SuiOrder] Has signAndExecuteTransaction:', this.signer && 'signAndExecuteTransaction' in this.signer);
        console.log('[SuiOrder] Has getPublicKey:', this.signer && 'getPublicKey' in this.signer);

        const tx = new Transaction();
        let depositCoin;
        [depositCoin] = tx.splitCoins(tx.gas, [params.makingAmount]);
        console.log('[SuiOrder] Created deposit coin for amount:', params.makingAmount.toString());
        
        tx.moveCall({
            target: `${callerPackageId}::order::create_order`,
            typeArguments: [params.coinType],
            arguments: [
                tx.pure.address(params.receiver),
                tx.pure.u64(params.makingAmount.toString()),
                tx.pure.u64(params.takingAmount.toString()),
                tx.pure.vector('u8', Array.from(params.makerAsset)),
                tx.pure.vector('u8', Array.from(params.takerAsset)),
                tx.pure.vector('u8', Array.from(params.salt)),
                tx.pure.bool(params.isPartialFillAllowed),
                tx.pure.bool(params.isMultipleFillsAllowed),
                depositCoin,
                tx.pure.u64(params.startTime.toString()),
                tx.pure.u64(params.duration.toString()),
                tx.pure.u64(params.initialRateBump.toString()),
                tx.pure.vector('u8', Array.from(params.pointsAndTimeDeltas)),
            ],
        });

        // Handle different signer types for production wallet integration
        if (!this.signer) {
            throw new Error('[SuiOrder] No signer available - wallet not connected');
        }

        let result: { digest: string };

        // Check if using Ed25519Keypair (development) or wallet (production)
        if ('getPublicKey' in this.signer && typeof (this.signer as any).getPublicKey === 'function') {
          // Development: Using Ed25519Keypair
          console.log('[SuiOrder] Using keypair for signing (development mode)');
          result = await this.client.signAndExecuteTransaction({
            transaction: tx,
            signer: this.signer as Ed25519Keypair,
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
        } else if ('signAndExecuteTransaction' in this.signer) {
          // Production: Using connected wallet through dapp-kit
          console.log('[SuiOrder] Using wallet for signing (production mode)');
          result = await (this.signer as any).signAndExecuteTransaction({ 
            transaction: tx,
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
        } else {
          // Fallback error
          console.log('[SuiOrder] Unknown signer type - cannot sign transaction');
          throw new Error('[SuiOrder] Unknown signer type - wallet integration failed');
        }        const transaction = await this.client.waitForTransaction({
            digest: result.digest,
            options: {
                showEffects: true,
                showEvents: true,
                showObjectChanges: true
            }
        });

        return transaction;
    }

    // Build a transaction without executing it (for testing/preview)
    buildTransaction(params?: CreateOrderParams, callerPackageId?: string): Transaction {
        console.log('[SuiOrder] Building transaction (preview mode)');
        
        const tx = new Transaction();
        
        if (params && callerPackageId) {
            let depositCoin;
            [depositCoin] = tx.splitCoins(tx.gas, [params.makingAmount]);
            
            tx.moveCall({
                target: `${callerPackageId}::order::create_order`,
                typeArguments: [params.coinType],
                arguments: [
                    tx.pure.address(params.receiver),
                    tx.pure.u64(params.makingAmount.toString()),
                    tx.pure.u64(params.takingAmount.toString()), // was giving error, invalid u64 value: out of range
                    tx.pure.vector('u8', Array.from(params.makerAsset)),
                    tx.pure.vector('u8', Array.from(params.takerAsset)),
                    tx.pure.vector('u8', Array.from(params.salt)),
                    tx.pure.bool(params.isPartialFillAllowed),
                    tx.pure.bool(params.isMultipleFillsAllowed),
                    depositCoin,
                    tx.pure.u64(params.startTime.toString()),
                    tx.pure.u64(params.duration.toString()),
                    tx.pure.u64(params.initialRateBump.toString()),
                    tx.pure.vector('u8', Array.from(params.pointsAndTimeDeltas)),
                ],
            });
        }
        
        console.log('[SuiOrder] Transaction built successfully');
        return tx;
    }


}
