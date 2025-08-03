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
        console.log('[sui-order.ts] === SUI ORDER CREATE FUNCTION CALLED ===');
        console.log('[sui-order.ts] Function: createOrder');
        console.log('[sui-order.ts] Caller package ID provided:', callerPackageId);
        console.log('[sui-order.ts] === CREATE ORDER PARAMETERS BREAKDOWN ===');
        console.log('[sui-order.ts] Receiver EVM address:', params.receiver);
        console.log('[sui-order.ts] Making amount (user gives):', {
            value: params.makingAmount.toString(),
            type: typeof params.makingAmount,
            inHex: '0x' + params.makingAmount.toString(16)
        });
        console.log('[sui-order.ts] Taking amount (user receives):', {
            value: params.takingAmount.toString(),
            type: typeof params.takingAmount,
            inHex: '0x' + params.takingAmount.toString(16)
        });
        console.log('[sui-order.ts] Coin type for transaction:', params.coinType);
        console.log('[sui-order.ts] Partial fills configuration:', {
            isPartialFillAllowed: params.isPartialFillAllowed,
            isMultipleFillsAllowed: params.isMultipleFillsAllowed
        });
        console.log('[sui-order.ts] Deposit amount details:', {
            value: params.depositAmount.toString(),
            comparedToMaking: params.depositAmount === params.makingAmount ? 'EQUAL' : 'DIFFERENT',
            difference: params.depositAmount !== params.makingAmount ? 
                (params.depositAmount - params.makingAmount).toString() : '0'
        });
        console.log('[sui-order.ts] Timing parameters:', {
            startTime: params.startTime.toString(),
            startTimeDate: new Date(Number(params.startTime) * 1000).toISOString(),
            duration: params.duration.toString(),
            durationHours: (Number(params.duration) / 3600).toFixed(2) + ' hours'
        });
        console.log('[sui-order.ts] Cryptographic parameters:', {
            saltLength: params.salt.length + ' bytes',
            saltHex: Array.from(params.salt).map(b => b.toString(16).padStart(2, '0')).join(''),
            makerAssetLength: params.makerAsset.length + ' bytes',
            makerAssetHex: Array.from(params.makerAsset).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 64) + '...',
            takerAssetLength: params.takerAsset.length + ' bytes',
            takerAssetHex: Array.from(params.takerAsset).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 64) + '...'
        });
        console.log('[sui-order.ts] Auction parameters:', {
            initialRateBump: params.initialRateBump.toString(),
            pointsAndTimeDeltasLength: params.pointsAndTimeDeltas.length + ' bytes',
            pointsAndTimeDeltasPreview: Array.from(params.pointsAndTimeDeltas).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('') + '...'
        });
        console.log('[sui-order.ts] === WALLET AND SIGNER STATUS ===');
        console.log('[sui-order.ts] Signer availability:', this.signer ? 'AVAILABLE' : 'NULL');
        if (this.signer) {
            console.log('[sui-order.ts] Signer type detection:', {
                hasGetPublicKey: 'getPublicKey' in this.signer,
                hasSignAndExecuteTransaction: 'signAndExecuteTransaction' in this.signer,
                signerObjectKeys: Object.keys(this.signer),
                signerConstructorName: this.signer.constructor.name
            });
        }
        console.log('[sui-order.ts] ===========================');

        const tx = new Transaction();
        let depositCoin;
        [depositCoin] = tx.splitCoins(tx.gas, [params.makingAmount]);
        
        console.log('[sui-order.ts] === TRANSACTION CONSTRUCTION ===');
        console.log('[sui-order.ts] Created new Sui Transaction object');
        console.log('[sui-order.ts] Split coins operation:', {
            sourceGasObject: 'tx.gas',
            splitAmount: params.makingAmount.toString(),
            resultingCoinVariable: 'depositCoin'
        });
        
        const moveCallParams = {
            target: `${callerPackageId}::order::create_order`,
            typeArguments: [params.coinType],
            argumentsBreakdown: {
                receiver: params.receiver,
                makingAmount: params.makingAmount.toString(),
                takingAmount: params.takingAmount.toString(),
                makerAssetVector: 'u8[' + params.makerAsset.length + ']',
                takerAssetVector: 'u8[' + params.takerAsset.length + ']',
                saltVector: 'u8[' + params.salt.length + ']',
                isPartialFillAllowed: params.isPartialFillAllowed,
                isMultipleFillsAllowed: params.isMultipleFillsAllowed,
                depositCoin: 'split_coin_result',
                startTime: params.startTime.toString(),
                duration: params.duration.toString(),
                initialRateBump: params.initialRateBump.toString(),
                pointsAndTimeDeltas: 'u8[' + params.pointsAndTimeDeltas.length + ']'
            }
        };
        
        console.log('[sui-order.ts] === MOVE CALL PARAMETERS ===');
        console.log('[sui-order.ts] Move call target function:', moveCallParams.target);
        console.log('[sui-order.ts] Type arguments for Move call:', moveCallParams.typeArguments);
        console.log('[sui-order.ts] Move call arguments breakdown:', moveCallParams.argumentsBreakdown);
        console.log('[sui-order.ts] ===========================');
        
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
        
        console.log('[sui-order.ts] Move call added to transaction successfully');

        // Handle different signer types for production wallet integration
        if (!this.signer) {
            console.error('[sui-order.ts] === SIGNING ERROR ===');
            console.error('[sui-order.ts] No signer available - wallet connection failed');
            console.error('[sui-order.ts] ==================');
            throw new Error('[SuiOrder] No signer available - wallet not connected');
        }

        let result: { digest: string };

        console.log('[sui-order.ts] === TRANSACTION SIGNING PROCESS ===');
        
        // Check if using Ed25519Keypair (development) or wallet (production)
        if ('getPublicKey' in this.signer && typeof (this.signer as any).getPublicKey === 'function') {
          // Development: Using Ed25519Keypair
          console.log('[sui-order.ts] Signer type detected: Ed25519Keypair (development mode)');
          console.log('[sui-order.ts] Using SuiClient.signAndExecuteTransaction method');
          console.log('[sui-order.ts] Transaction options:', {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          });
          
          result = await this.client.signAndExecuteTransaction({
            transaction: tx,
            signer: this.signer as Ed25519Keypair,
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
          
          console.log('[sui-order.ts] Ed25519Keypair signing completed');
          console.log('[sui-order.ts] Transaction digest from keypair signing:', result.digest);
          
        } else if ('signAndExecuteTransaction' in this.signer) {
          // Production: Using connected wallet through dapp-kit
          console.log('[sui-order.ts] Signer type detected: Connected wallet (production mode)');
          console.log('[sui-order.ts] Using wallet.signAndExecuteTransaction method');
          console.log('[sui-order.ts] Transaction options:', {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true
          });
          
          result = await (this.signer as any).signAndExecuteTransaction({ 
            transaction: tx,
            options: {
              showEffects: true,
              showEvents: true,
              showObjectChanges: true
            }
          });
          
          console.log('[sui-order.ts] Wallet signing completed');
          console.log('[sui-order.ts] Transaction digest from wallet signing:', result.digest);
          
        } else {
          // Fallback error
          console.error('[sui-order.ts] === SIGNING ERROR ===');
          console.error('[sui-order.ts] Unknown signer type detected');
          console.error('[sui-order.ts] Signer has getPublicKey:', 'getPublicKey' in this.signer);
          console.error('[sui-order.ts] Signer has signAndExecuteTransaction:', 'signAndExecuteTransaction' in this.signer);
          console.error('[sui-order.ts] Available signer methods:', Object.getOwnPropertyNames(this.signer));
          console.error('[sui-order.ts] ==================');
          throw new Error('[SuiOrder] Unknown signer type - wallet integration failed');
        }        console.log('[sui-order.ts] === TRANSACTION CONFIRMATION PROCESS ===');
        console.log('[sui-order.ts] Waiting for transaction confirmation...');
        console.log('[sui-order.ts] Transaction digest to confirm:', result.digest);
        
        const transaction = await this.client.waitForTransaction({
            digest: result.digest,
            options: {
                showEffects: true,
                showEvents: true,
                showObjectChanges: true
            }
        });

        console.log('[sui-order.ts] === TRANSACTION CONFIRMATION COMPLETED ===');
        console.log('[sui-order.ts] Transaction confirmed successfully');
        console.log('[sui-order.ts] Final transaction details:', {
            digest: transaction.digest,
            status: transaction.effects?.status?.status,
            gasUsed: transaction.effects?.gasUsed,
            eventsCount: transaction.events?.length || 0,
            objectChangesCount: transaction.objectChanges?.length || 0,
            timestampMs: transaction.timestampMs
        });
        
        if (transaction.events && transaction.events.length > 0) {
            console.log('[sui-order.ts] Transaction events detected:', transaction.events.length + ' events');
            transaction.events.forEach((event, index) => {
                console.log('[sui-order.ts] Event ' + (index + 1) + ':', {
                    type: event.type,
                    packageId: event.packageId,
                    parsedJsonExists: !!event.parsedJson
                });
            });
        }
        
        if (transaction.objectChanges && transaction.objectChanges.length > 0) {
            console.log('[sui-order.ts] Object changes detected:', transaction.objectChanges.length + ' changes');
            transaction.objectChanges.forEach((change, index) => {
                console.log('[sui-order.ts] Object change ' + (index + 1) + ':', {
                    type: change.type,
                    objectType: (change as any).objectType,
                    objectId: (change as any).objectId
                });
            });
        }
        console.log('[sui-order.ts] ========================================');

        return transaction;
    }

    // Build a transaction without executing it (for testing/preview)
    buildTransaction(params?: CreateOrderParams, callerPackageId?: string): Transaction {
        console.log('[sui-order.ts] === BUILD TRANSACTION FUNCTION CALLED ===');
        console.log('[sui-order.ts] Function: buildTransaction (preview mode)');
        console.log('[sui-order.ts] Parameters provided:', !!params);
        console.log('[sui-order.ts] Package ID provided:', !!callerPackageId);
        
        const tx = new Transaction();
        
        if (params && callerPackageId) {
            console.log('[sui-order.ts] === BUILDING TRANSACTION WITH PARAMETERS ===');
            console.log('[sui-order.ts] Creating splitCoins operation for amount:', params.makingAmount.toString());
            
            let depositCoin;
            [depositCoin] = tx.splitCoins(tx.gas, [params.makingAmount]);
            
            console.log('[sui-order.ts] Adding moveCall to transaction...');
            console.log('[sui-order.ts] Move call details:', {
                target: `${callerPackageId}::order::create_order`,
                typeArguments: [params.coinType],
                argumentCount: 13
            });
            
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
            
            console.log('[sui-order.ts] Transaction built with Move call');
        } else {
            console.log('[sui-order.ts] === BUILDING EMPTY TRANSACTION ===');
            console.log('[sui-order.ts] No parameters provided, creating empty transaction');
        }
        
        console.log('[sui-order.ts] Transaction build completed successfully');
        console.log('[sui-order.ts] =====================================');
        return tx;
    }


}
