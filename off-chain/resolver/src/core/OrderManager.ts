import {
  AmountMode,
  DstImmutablesComplement,
  ESCROW_DST_IMPLEMENTATION,
  ESCROW_FACTORY,
  EvmAddress,
  EvmCrossChainOrder,
  EvmEscrowFactory,
  EvmEscrowFactoryFacade,
  Extension as EvmExtension,
  SuiEscrowExtension,
  HashLock,
  RelayerRequestParams,
  SuiAddress,
  SupportedChain,
  TakerTraits,
  SuiCrossChainOrder,
  AuctionDetails,
} from "@1inch/cross-chain-sdk";
import { EVMClient } from "../chains/evm/evm-client";
import { SuiClient } from "../chains/sui/sui-client";
import { ResolverWebSocketClient } from "../communication/ws";

// Type guards
function isEvmCrossChainOrder(
  order: EvmCrossChainOrder | SuiCrossChainOrder
): order is EvmCrossChainOrder {
  return "extension" in order;
}

function isSuiCrossChainOrder(
  order: EvmCrossChainOrder | SuiCrossChainOrder
): order is SuiCrossChainOrder {
  return "escrowExtension" in order;
}

// Order data stored in the mapping - includes original params + converted order + runtime data
interface StoredOrderData {
  // Original params from relayer
  originalParams: RelayerRequestParams;
  // Converted cross-chain order from SDK
  crossChainOrder: EvmCrossChainOrder | SuiCrossChainOrder;
  // Runtime data for cross-chain execution
  srcComplement?: any;
  dstDeployedAt?: bigint;
  isPartialFill?: boolean;
  // Sui escrow IDs for object-based tracking

  srcBlockHash?: string;
  dstBlockHash?: string;

  srcEscrowId?: string;
  dstEscrow?: {
    id: string;
    version?: string;
    type?: string;
  };
}

export interface SecretData {
  orderHash: string;
  secret: string;
}

export class OrderManager {
  private orders: Map<string, StoredOrderData>;
  private evmClient: EVMClient;
  private suiClient: SuiClient;
  private wsClient: ResolverWebSocketClient | null = null;

  constructor(evmClient: EVMClient, suiClient: SuiClient) {
    this.orders = new Map();
    this.evmClient = evmClient;
    this.suiClient = suiClient;
    console.log("OrderManager initialized");
  }

  /**
   * Get resolver ID from environment with validation
   * @returns Resolver ID (1-indexed)
   */
  private getResolverId(): number {
    const resolverId = parseInt(process.env.RESOLVER_ID || "1");
    if (isNaN(resolverId) || resolverId < 1) {
      throw new Error(
        `Invalid RESOLVER_ID: ${process.env.RESOLVER_ID}. Must be a positive integer.`
      );
    }
    return resolverId;
  }

  /**
   * Set WebSocket client for sending messages to relayer
   * @param wsClient - WebSocket client instance
   */
  public setWebSocketClient(wsClient: ResolverWebSocketClient): void {
    this.wsClient = wsClient;
    console.log("WebSocket client set in OrderManager");
  }

  /**
   * Register order from relayer - converts RelayerRequestParams to EvmCrossChainOrder
   * and stores with order hash as key
   */
  public async registerOrder(
    relayerParams: RelayerRequestParams
  ): Promise<void> {
    console.log(
      relayerParams.srcChainId,
      this.isEVMChain(relayerParams.srcChainId)
    );
    if (this.isEVMChain(relayerParams.srcChainId)) {
      console.log("Registering order from RelayerRequestParams for EVM -> SUI");
      // @note order stored for this resolver needs to compute this - hash lock will be the secretHash[resolverId + 1], if this is an array then store variable in stored order that partial fills is true.
      // Decode the extension from the relayer params
      const extension = EvmExtension.decode(relayerParams.extension);
      console.log("Decoded extension:", extension);

      // Convert RelayerRequestParams to EvmCrossChainOrder using SDK method
      const crossChainOrder = EvmCrossChainOrder.fromDataAndExtension(
        {
          ...relayerParams.order,
          receiver: SuiAddress.fromString(relayerParams.order.receiver)
            .splitToParts()[1]
            .toHex(),
          takerAsset: SuiAddress.fromString(relayerParams.order.takerAsset)
            .splitToParts()[1]
            .toHex(),
        },
        extension
      );
      const orderHash = crossChainOrder.getOrderHash(relayerParams.srcChainId);

      // Store all the data we need for execution
      const storedOrderData: StoredOrderData = {
        originalParams: relayerParams,
        crossChainOrder: crossChainOrder,
        srcComplement: undefined,
        dstDeployedAt: undefined,
      };

      if (relayerParams.secretHashes && relayerParams.secretHashes.length > 2) {
        console.log("Partial fill detected, storing secret hashes");
        storedOrderData.isPartialFill = true;
      }

      this.orders.set(orderHash, storedOrderData);
      console.log(`Order registered with hash: ${orderHash}`);
      console.log(
        `Source Chain: ${relayerParams.srcChainId}, Destination Chain: ${crossChainOrder.dstChainId}`
      );

      // TODO: this will call the executeOrder function, which will deploy the src and dst escrow function.
      console.log(
        `[OrderManager] Registering order:`,
        relayerParams,
        crossChainOrder.toJSON()
      );
      console.log(`[OrderManager] Executing order: ${orderHash}`);
      await this.executeOrder(
        orderHash,
        this.isEVMChain(relayerParams.srcChainId)
      );
    } else {
      console.log("Registering order from RelayerRequestParams for SUI -> EVM");
      // @note order stored for this resolver needs to compute this - hash lock will be the secretHash[resolverId + 1], if this is an array then store variable in stored order that partial fills is true.
      // Decode the extension from the relayer params
      const extensionBytes = new Uint8Array(
        Buffer.from(relayerParams.extension.replace("0x", ""), "hex")
      );
      const extension = SuiEscrowExtension.decode(extensionBytes);
      console.log("Decoded extension:", extension);

      // Convert RelayerRequestParams to SuiCrossChainOrder using SDK method
      // Create a SuiEscrowExtension from the decoded data and relayer params
      const auctionDetails = AuctionDetails.noAuction(
        300n,
        BigInt(Math.floor(Date.now() / 1000))
      );

      const escrowExtension = new SuiEscrowExtension(
        SuiAddress.fromString(relayerParams.order.makerAsset),
        SuiAddress.fromString(relayerParams.order.takerAsset),
        BigInt(relayerParams.order.makingAmount),
        BigInt(relayerParams.order.takingAmount),
        SuiAddress.fromString(relayerParams.order.maker),
        SuiAddress.fromString(relayerParams.order.receiver),
        auctionDetails,
        extension.hashLock,
        extension.dstChainId,
        extension.dstToken,
        extension.srcSafetyDeposit,
        extension.dstSafetyDeposit,
        extension.timeLocks,
        BigInt(relayerParams.order.salt || 0)
      );

      const crossChainOrder = SuiCrossChainOrder.fromEscrowExtension(
        escrowExtension,
        {
          auction: auctionDetails,
        }
      );
      const orderHash = crossChainOrder.getOrderHash(relayerParams.srcChainId);

      // Store all the data we need for execution
      const storedOrderData: StoredOrderData = {
        originalParams: relayerParams,
        crossChainOrder: crossChainOrder,
        srcComplement: undefined,
        dstDeployedAt: undefined,
      };

      if (relayerParams.secretHashes && relayerParams.secretHashes.length > 2) {
        console.log("Partial fill detected, storing secret hashes");
        storedOrderData.isPartialFill = true;
      }

      this.orders.set(orderHash, storedOrderData);
      console.log(`Order registered with hash: ${orderHash}`);
      console.log(
        `Source Chain: ${relayerParams.srcChainId}, Destination Chain: ${crossChainOrder.dstChainId}`
      );

      // TODO: this will call the executeOrder function, which will deploy the src and dst escrow function.
      console.log(
        `[OrderManager] Registering order:`,
        relayerParams,
        crossChainOrder.toJSON()
      );
      console.log(`[OrderManager] Executing order: ${orderHash}`);
      await this.executeOrder(
        orderHash,
        this.isEVMChain(relayerParams.srcChainId)
      );
    }
  }

  /**
   * Determine if a chain ID corresponds to an EVM chain using SDK helper
   */
  private isEVMChain(chainId: SupportedChain): boolean {
    // Check if it's an EVM chain (not SUI which is typically 101 or similar Move-based chain)
    return chainId !== 101; // Assuming 101 is SUI testnet/devnet
  }

  public async getClientsHealth(): Promise<{ evm: boolean; sui: boolean }> {
    try {
      const [evmHealth, suiHealth] = await Promise.all([
        this.evmClient.isHealthy(),
        this.suiClient.isHealthy(),
      ]);

      return { evm: evmHealth, sui: suiHealth };
    } catch (error) {
      console.error("Error checking client health:", error);
      return { evm: false, sui: false };
    }
  }

  /**
   * Execute cross-chain order using stored order data
   * @param orderHash - Hash of the order to execute
   * @param fromEVM - Whether the source chain is EVM (true) or Sui (false)
   */
  public async executeOrder(
    orderHash: string,
    fromEVM: boolean
  ): Promise<void> {
    console.log(`Starting order execution: ${orderHash}`);
    console.log(`Direction: ${fromEVM ? "EVM to Sui" : "Sui to EVM"}`);

    // Get stored order data
    const storedOrder = this.orders.get(orderHash);
    if (!storedOrder) {
      throw new Error(`Order not found: ${orderHash}`);
    }

    const crossChainOrder = storedOrder.crossChainOrder;
    const originalParams = storedOrder.originalParams;

    // Extract parameters from stored data
    const signature = originalParams.signature;
    const srcChainId = originalParams.srcChainId;
    const dstChainId = crossChainOrder.dstChainId;
    // @note and the fillAmount (param of EVMClient) will be divided by total count (stored in ENV)
    let fillAmount;
    if (storedOrder.isPartialFill) {
      fillAmount =
        crossChainOrder.makingAmount / BigInt(process.env.TOTAL_COUNT || 2);
    } else {
      fillAmount = crossChainOrder.makingAmount;
    }
    // const fillAmount = crossChainOrder.takingAmount / process.env.TOTAL_COUNT;
    console.log(`Fill amount: ${fillAmount.toString()}`);
    console.log(
      `Source chain: ${srcChainId}, Destination chain: ${dstChainId}`
    );

    try {
      // Step 1: Deploy source escrow
      console.log(
        `\nStep 1: Deploying source escrow on ${
          fromEVM ? "EVM" : "Sui"
        } chain (${srcChainId})`
      );

      let srcResult: { txHash: string; blockHash: string };
      let srcClient = fromEVM ? this.evmClient : this.suiClient;

      if (fromEVM) {
        console.log(`Using EVM client for source deployment`);

        // Ensure we have an EVM order for EVM operations
        if (!isEvmCrossChainOrder(crossChainOrder)) {
          throw new Error(
            "Expected EvmCrossChainOrder for EVM source deployment"
          );
        }

        // Get resolver ID from environment (1-indexed)
        const resolverId = this.getResolverId();
        console.log(`Resolver ID: ${resolverId}`);

        let hashLock: HashLock;
        let takerTraits: TakerTraits;

        if (
          storedOrder.isPartialFill &&
          originalParams.secretHashes &&
          originalParams.secretHashes.length > 1
        ) {
          // Multiple fills (partial fills) - check if this resolver should handle this order
          if (resolverId > originalParams.secretHashes.length) {
            console.log(
              `Resolver ID ${resolverId} exceeds available secret hashes (${originalParams.secretHashes.length}). Skipping order execution.`
            );
            return;
          }

          console.log(
            `Multiple fills detected with ${originalParams.secretHashes.length} secret hashes`
          );

          // Calculate index based on resolver ID (0-indexed, so resolverId - 1)
          const idx = resolverId - 1;

          // Get secrets and create merkle leaves from secret hashes
          const secretHashes = originalParams.secretHashes;
          const merkleLeaves =
            HashLock.getMerkleLeavesFromSecretHashes(secretHashes);

          // Get proof for this specific index
          const proof = HashLock.getProof(merkleLeaves, idx);

          // Use the specific secret hash for this resolver
          const specificSecretHash = secretHashes[idx];
          hashLock = HashLock.fromString(specificSecretHash);

          // Create EscrowFactory instance with the factory address from config
          const escrowFactoryAddress = EvmAddress.fromString(
            this.evmClient.getEscrowFactoryAddress()
          );
          const escrowFactory = new EvmEscrowFactory(escrowFactoryAddress);

          // Build TakerTraits with the multiple fill interaction
          takerTraits = TakerTraits.default()
            .setExtension(crossChainOrder.extension)
            .setInteraction(
              escrowFactory.getMultipleFillInteraction(
                proof,
                idx,
                specificSecretHash
              )
            )
            .setAmountMode(AmountMode.maker)
            .setAmountThreshold(crossChainOrder.takingAmount);

          console.log("[EXECUTE ORDER] Taker Traits:");
          console.log("Extensions:", crossChainOrder.extension);
          console.log(
            "Interactions:",
            escrowFactory.getMultipleFillInteraction(
              proof,
              idx,
              specificSecretHash
            )
          );
          console.log("Maker:", AmountMode.maker);
          console.log("Amount Threshold:", crossChainOrder.takingAmount);
          console.log(takerTraits);

          console.log(
            `Created TakerTraits for multiple fills with index ${idx}, secret hash: ${specificSecretHash.substring(
              0,
              10
            )}...`
          );
        } else {
          // Single fill - check if this resolver should handle it (only resolver ID 1)
          if (resolverId !== 1) {
            console.log(
              `Single fill order but resolver ID is ${resolverId}. Only resolver ID 1 handles single fills. Skipping order execution.`
            );
            return;
          }

          console.log(`Single fill detected`);

          // Single fill - use the first (and only) secret hash
          const secretHash = originalParams.secretHashes?.[0];
          if (!secretHash) {
            throw new Error("No secret hash available for single fill order");
          }

          hashLock = HashLock.fromString(secretHash);
          console.log(`Created hashlock for single fill: ${secretHash}`);

          // Build TakerTraits for single fill (no interaction needed)
          takerTraits = TakerTraits.default()
            .setExtension(crossChainOrder.extension)
            .setAmountMode(AmountMode.maker)
            .setAmountThreshold(crossChainOrder.takingAmount);

          console.log("[EXECUTE ORDER] Taker Traits:");
          console.log("Extensions:", crossChainOrder.extension);
          console.log("Maker:", AmountMode.maker);
          console.log("Amount Threshold:", crossChainOrder.takingAmount);
          console.log("Maker Amount Flag:", takerTraits.getAmountMode());
          console.log(takerTraits);

          console.log(
            `Created TakerTraits for single fill with secret hash: ${secretHash.substring(
              0,
              10
            )}...`
          );
        }

        srcResult = await this.evmClient.createSrcEscrow(
          srcChainId,
          crossChainOrder,
          hashLock,
          signature,
          fillAmount,
          takerTraits
        );
        storedOrder.srcBlockHash = srcResult.blockHash;

        console.log(`EVM source escrow deployed - TxHash: ${srcResult.txHash}`);

        // Get source complement from factory event
        const srcComplement = await this.evmClient.getDstImmutables(
          srcResult.blockHash
        );
        storedOrder.srcComplement = srcComplement;
      } else {
        console.log(`Using Sui client for source deployment`);

        // Ensure we have a Sui order for Sui operations
        if (!isSuiCrossChainOrder(crossChainOrder)) {
          throw new Error(
            "Expected SuiCrossChainOrder for Sui source deployment"
          );
        }

        // Get resolver ID from environment (1-indexed)
        const resolverId = this.getResolverId();
        console.log(`Resolver ID: ${resolverId}`);

        let hashLock: any; // Modified to handle both scenarios

        if (
          storedOrder.isPartialFill &&
          originalParams.secretHashes &&
          originalParams.secretHashes.length > 1
        ) {
          // Multiple fills (partial fills) - check if this resolver should handle this order
          if (resolverId > originalParams.secretHashes.length) {
            console.log(
              `Resolver ID ${resolverId} exceeds available secret hashes (${originalParams.secretHashes.length}). Skipping order execution.`
            );
            return;
          }

          console.log(
            `Partial fill detected with ${originalParams.secretHashes.length} secret hashes`
          );

          // Calculate index based on resolver ID (0-indexed, so resolverId - 1)
          const idx = resolverId - 1;

          // Get secrets and create merkle leaves from secret hashes
          const secretHashes = originalParams.secretHashes;
          const merkleLeaves =
            HashLock.getMerkleLeavesFromSecretHashes(secretHashes);

          // Get proof for this specific index
          const proof = HashLock.getProof(merkleLeaves, idx);

          // Use the specific secret hash for this resolver
          const specificSecretHash = secretHashes[idx];

          // Convert secret hashes to merkle leaves for multiple fills
          const hashlockForMultipleFills =
            HashLock.forMultipleFills(merkleLeaves);

          // Create enhanced hashlock object with all necessary information
          hashLock = {
            ...hashlockForMultipleFills,
            secretHash: Buffer.from(
              specificSecretHash.replace("0x", ""),
              "hex"
            ),
            secretIndex: idx,
            proof: proof,
            isMultipleFills: () => true,
            toBuffer: () => hashlockForMultipleFills.toBuffer(),
          };

          console.log(
            `Created hashlock for partial fills with ${
              merkleLeaves.length
            } leaves, index ${idx}, secret hash: ${specificSecretHash.substring(
              0,
              10
            )}...`
          );
        } else {
          // Single fill - check if this resolver should handle it (only resolver ID 1)
          if (resolverId !== 1) {
            console.log(
              `Single fill order but resolver ID is ${resolverId}. Only resolver ID 1 handles single fills. Skipping order execution.`
            );
            return;
          }

          // Single fill - use the first (and only) secret hash
          const secretHash = originalParams.secretHashes?.[0];
          if (!secretHash) {
            throw new Error("No secret hash available for single fill order");
          }

          const singleFillHashLock = HashLock.fromString(secretHash);

          // Create enhanced hashlock object for single fill
          hashLock = {
            ...singleFillHashLock,
            secretHash: Buffer.from(secretHash.replace("0x", ""), "hex"),
            secretIndex: 0,
            proof: [],
            isMultipleFills: () => false,
            toBuffer: () => Buffer.from(secretHash.replace("0x", ""), "hex"),
          };

          console.log(`Created hashlock for single fill`);
        }

        // Create a minimal order object for Sui deployment
        const suiOrder = {
          orderId: crossChainOrder.getOrderHash(srcChainId), // Use order hash as ID for now
          id: crossChainOrder.getOrderHash(srcChainId),
          coinType: "0x2::sui::SUI", // Default to SUI, should be derived from crossChainOrder.makerAsset
        };

        srcResult = await this.suiClient.createSrcEscrow(
          srcChainId,
          suiOrder,
          hashLock,
          signature,
          fillAmount
        );

        storedOrder.srcBlockHash = srcResult.blockHash;

        console.log(`[OrderManager] Sui source escrow deployed successfully`);
        console.log(`[OrderManager]   TxHash: ${srcResult.txHash}`);
        console.log(`[OrderManager]   BlockHash: ${srcResult.blockHash}`);

        // TODO: Extract source escrow ID from transaction events or relayer
        // This will be implemented once escrow ID extraction is available
        console.log(
          `[OrderManager] TODO: Extract and store source escrow ID for future withdrawals/cancellations`
        );

        // Get source complement from Sui factory event
        console.log(
          `[OrderManager] Retrieving source complement from Sui events...`
        );
        storedOrder.srcComplement = await this.suiClient.getSrcComplement(
          srcResult.blockHash
        );
        console.log(`[OrderManager] Source complement retrieved successfully`);
      }

      // Step 2: Wait for source chain finality lock
      const srcFinalityTimeout = srcClient.getFinalityLockTimeout();
      console.log(
        `Waiting for source chain finality lock: ${srcFinalityTimeout}ms`
      );
      await this.sleep(srcFinalityTimeout);
      console.log(`Source chain finality lock completed`);

      ///////////////////////////////////////////////////////
      // Step 3: Deploy destination escrow //////////////////
      ///////////////////////////////////////////////////////

      console.log(
        `\nStep 3: Deploying destination escrow on ${
          fromEVM ? "Sui" : "EVM"
        } chain (${dstChainId})`
      );

      let dstResult: any;
      let dstClient = fromEVM ? this.suiClient : this.evmClient;

      if (fromEVM) {
        // EVM -> Sui: Build destination immutables from stored data
        console.log(`Using Sui client for destination deployment`);

        if (!storedOrder.srcComplement) {
          throw new Error(
            "Source complement not available from source deployment"
          );
        }

        // Extract parameters for Sui destination escrow creation
        const orderHashBytes = new Uint8Array(
          Buffer.from(orderHash.slice(2), "hex")
        );

        // Get hashlock from cross-chain order
        const hashlockBytes =
          crossChainOrder.escrowExtension.hashLockInfo.toBuffer();

        // Extract addresses
        const makerAddress = originalParams.order.receiver;
        const takerAddress = this.suiClient.getAddress();

        // Extract amounts from cross-chain order
        const depositAmount = crossChainOrder.takingAmount; // Amount to deposit on destination
        const safetyDepositAmount =
          crossChainOrder.escrowExtension.dstSafetyDeposit;

        // Get destination token type (for Sui, this would be the coin type)
        const dstToken = originalParams.order.takerAsset;
        // TODO: Convert EVM address to Sui coin type properly
        // const coinType = "0x2::sui::SUI"; // Default to SUI for now, should be mapped from dstToken

        console.log(
          `[${dstChainId}] Depositing ${depositAmount} for order ${orderHash}`
        );

        // Call Sui destination escrow creation following the same pattern as test scripts
        dstResult = await this.suiClient.createDstEscrow(
          orderHashBytes,
          hashlockBytes,
          makerAddress,
          takerAddress,
          depositAmount,
          safetyDepositAmount,
          dstToken
        );

        console.log(
          `[OrderManager] Sui destination escrow deployed - TxHash: ${dstResult.txHash}`
        );
        console.log(
          `[OrderManager] BlockHash: ${dstResult.blockHash || dstResult.txHash}`
        );

        // Store destination escrow ID if available (for future use in withdrawals/cancellations)
        if (dstResult.escrow) {
          storedOrder.dstEscrow = {
            id: dstResult.escrow.id,
            version: dstResult.escrow.version,
            type: dstResult.escrow.type,
          };
          console.log(
            `[OrderManager] Stored destination escrow ID: ${dstResult.escrow.id}`
          );
        } else {
          console.log(
            `[OrderManager] TODO: Extract destination escrow ID from transaction events or relayer`
          );
        }

        // Store destination deployment timestamp
        storedOrder.dstDeployedAt = BigInt(Math.floor(Date.now() / 1000));
      } else {
        // Sui -> EVM: Build destination immutables from stored data
        console.log(`Using EVM client for destination deployment`);

        if (!storedOrder.srcComplement) {
          throw new Error(
            "Source complement not available from source deployment"
          );
        }

        // Get source immutables and build destination immutables following test script pattern
        const srcImmutables = this.getSrcImmutables(storedOrder, fromEVM);
        const dstImmutables = srcImmutables
          .withComplement(storedOrder.srcComplement)
          .withTaker(EvmAddress.fromString(this.evmClient.getAddress()));

        console.log(
          `[${dstChainId}] Depositing ${dstImmutables.amount} for order ${orderHash}`
        );

        // Deploy destination escrow using the same pattern as test scripts
        dstResult = await this.evmClient.createDstEscrow(dstImmutables);

        console.log(
          `EVM destination escrow deployed - TxHash: ${dstResult.txHash}`
        );

        // Store destination deployment timestamp from block timestamp
        storedOrder.dstDeployedAt = BigInt(Math.floor(Date.now() / 1000));
      }

      // Step 4: Wait for destination chain finality lock
      const dstFinalityTimeout = dstClient.getFinalityLockTimeout();
      console.log(
        `Waiting for destination chain finality lock: ${dstFinalityTimeout}ms`
      );
      await this.sleep(dstFinalityTimeout);
      console.log(`Destination chain finality lock completed`);

      // Step 5: Order execution completed
      console.log(`\nOrder execution completed successfully`);
      console.log(`Order Hash: ${orderHash}`);
      console.log(`Source TxHash: ${srcResult.txHash}`);
      console.log(`Destination Result:`, dstResult);
      this.sendExecutionDataToRelayer(
        orderHash,
        srcResult.txHash,
        dstResult.txHash
      );
    } catch (error) {
      console.error(`Order execution failed for ${orderHash}:`, error);
      throw new Error(
        `Order execution failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Helper function to create delays for finality locks
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Derive source immutables from stored order data
   */
  private getSrcImmutables(
    storedOrder: StoredOrderData,
    fromEVM: boolean
  ): any {
    const { crossChainOrder, originalParams } = storedOrder;
    const resolverAddress = fromEVM
      ? process.env.EVM_RESOLVER_CONTRACT!
      : process.env.SUI_RESOLVER_CONTRACT!;

    if (isEvmCrossChainOrder(crossChainOrder)) {
      return crossChainOrder.toSrcImmutables(
        originalParams.srcChainId,
        EvmAddress.fromString(resolverAddress),
        crossChainOrder.makingAmount,
        crossChainOrder.escrowExtension.hashLockInfo
      );
    } else if (isSuiCrossChainOrder(crossChainOrder)) {
      return crossChainOrder.toSrcImmutables(
        originalParams.srcChainId,
        SuiAddress.fromString(resolverAddress),
        crossChainOrder.makingAmount,
        crossChainOrder.escrowExtension.hashLockInfo
      );
    } else {
      throw new Error("Unknown cross-chain order type");
    }
  }

  /**
   * Derive destination immutables from stored order data
   */
  private getDstImmutables(
    storedOrder: StoredOrderData,
    fromEVM: boolean
  ): any {
    if (!storedOrder.srcComplement || !storedOrder.dstDeployedAt) {
      throw new Error(
        "Missing srcComplement or dstDeployedAt for destination immutables calculation"
      );
    }

    const srcImmutables = this.getSrcImmutables(storedOrder, fromEVM);
    const resolverAddress = fromEVM
      ? this.suiClient.getAddress()
      : this.evmClient.getAddress();

    return srcImmutables
      .withComplement(storedOrder.srcComplement)
      .withTaker(EvmAddress.fromString(resolverAddress))
      .withDeployedAt(storedOrder.dstDeployedAt);
  }

  /**
   * Handle secret reveal from maker
   * Processes secrets for both single and partial fill orders with resolver ID validation
   */
  public async handleSecretReveal(secretData: SecretData): Promise<void> {
    try {
      console.log(`Secret revealed for order ${secretData.orderHash}`);
      console.log(`Secret: ${secretData.secret}`);

      // Get stored order data to determine fill type
      const storedOrder = this.orders.get(secretData.orderHash);
      if (!storedOrder) {
        console.warn(
          `Order not found for hash: ${secretData.orderHash}. Ignoring secret reveal.`
        );
        return;
      }

      // Get resolver ID from environment (1-indexed)
      const resolverId = this.getResolverId();
      console.log(`Processing secret reveal for resolver ID: ${resolverId}`);

      if (
        storedOrder.isPartialFill &&
        storedOrder.originalParams.secretHashes &&
        storedOrder.originalParams.secretHashes.length > 1
      ) {
        // Partial fill case
        console.log(
          `Partial fill order detected with ${storedOrder.originalParams.secretHashes.length} secret hashes`
        );

        // Check if this resolver should handle any part of this order
        if (resolverId > storedOrder.originalParams.secretHashes.length) {
          console.log(
            `Resolver ID ${resolverId} exceeds available secret hashes (${storedOrder.originalParams.secretHashes.length}). Ignoring secret reveal.`
          );
          return;
        }

        // For multiple fills, check if the secret matches our specific secret hash
        const idx = resolverId - 1; // Convert to 0-based index
        const specificSecretHash = storedOrder.originalParams.secretHashes[idx];

        // Validate that the received secret matches our assigned secret hash
        const receivedSecretHash = HashLock.hashSecret(secretData.secret);
        if (receivedSecretHash !== specificSecretHash) {
          console.log(
            `Secret does not match assigned hash for resolver ID ${resolverId}. Ignoring secret reveal.`
          );
          return;
        }

        console.log(
          `✅ Secret validated for multiple fill, resolver ID ${resolverId}`
        );

        // Trigger withdrawal for the appropriate chain
        await this.triggerWithdrawal(storedOrder, secretData.secret);
      } else {
        // Single fill case
        if (resolverId !== 1) {
          console.log(
            `Single fill order but resolver ID is ${resolverId}. Only resolver ID 1 handles single fills. Ignoring secret reveal.`
          );
          return;
        }

        console.log(`[SINGLE FILL] Secret revealed for resolver ID 1`);

        // Validate the secret matches the expected hash
        const expectedSecretHash = storedOrder.originalParams.secretHashes?.[0];
        if (expectedSecretHash) {
          const revealedSecretHash = HashLock.hashSecret(secretData.secret);
          if (revealedSecretHash !== expectedSecretHash) {
            console.warn(
              `Revealed secret hash does not match expected hash. Ignoring.`
            );
            return;
          }
        }

        console.log(`✅ Secret validated for single fill`);

        // Trigger withdrawal for the appropriate chain
        await this.triggerWithdrawal(storedOrder, secretData.secret);
      }
    } catch (error) {
      console.error("Error handling secret reveal:", error);
    }
  }

  /**
   * Trigger withdrawal from escrow based on stored order data
   */
  private async triggerWithdrawal(
    storedOrder: StoredOrderData,
    secret: string
  ): Promise<void> {
    try {
      const { originalParams } = storedOrder;
      const dstChainId = storedOrder.crossChainOrder.dstChainId;

      console.log(`Triggering withdrawal on chain ${dstChainId}`);

      // Determine destination chain type
      const isDstEVM = this.isEVMChain(dstChainId);

      if (isDstEVM) {
        // For EVM chains, calculate escrow address and call withdrawFromEscrow
        // Get destination immutables for address calculation
        const dstImmutables = this.getDstImmutables(
          storedOrder,
          !this.isEVMChain(originalParams.srcChainId)
        );

        // Calculate destination escrow address using EscrowFactoryFacade
        const escrowAddress = await this.calculateDstEscrowAddress(
          dstChainId,
          storedOrder,
          dstImmutables
        );

        if (!escrowAddress) {
          console.error("Failed to calculate destination escrow address");
          return;
        }

        console.log(`Withdrawing from EVM escrow at address: ${escrowAddress}`);
        const result = await this.evmClient.dstWithdrawFromEscrow(
          secret,
          dstImmutables,
          storedOrder.dstBlockHash!
        );
        console.log(`EVM withdrawal successful:`, result);
      } else {
        // For Sui chains, use escrow ID from stored data
        let escrow: { id: string; version?: string; type?: string } | undefined;
        // Withdrawing from destination escrow (ETH to Sui)
        escrow = storedOrder.dstEscrow;
        if (!escrow) {
          console.error(
            "[OrderManager] Destination escrow ID not found for Sui withdrawal"
          );
          console.log(
            "[OrderManager] TODO: Implement escrow ID extraction from relayer or transaction events"
          );
          return;
        }

        console.log(
          `[OrderManager] Withdrawing from Sui destination escrow...`
        );
        console.log(`[OrderManager]   Escrow ID: ${escrow.id}`);
        console.log(`[OrderManager]   Direction: ETH → Sui`);
        const secretBytes = new Uint8Array(
          Buffer.from(secret.replace("0x", ""), "hex")
        );
        const coinType = this.getSuiCoinType(storedOrder, "dst");
        console.log(`[OrderManager]   Coin Type: ${coinType}`);

        // dstWithdrawalTimelock
        console.log(
          `[OrderManager]   Waiting for destination withdrawal timelock...`
        );
        // Wait for the timelock period before withdrawal
        await this.sleep(6000);

        const result = await this.suiClient.withdrawFromDstEscrow(
          secretBytes,
          escrow.id,
          escrow.version!,
          storedOrder.originalParams.order.takerAsset
        );
        console.log(
          `[OrderManager] Sui destination withdrawal successful:`,
          result
        );

        console.log("[OrderManager]   Now trying src withdrawal...");
        const srcResult = await this.evmClient.srcWithdrawFromEscrow(
          secret,
          this.getSrcImmutables(storedOrder, true),
          storedOrder.srcBlockHash!
        );

        console.log("[OrderManager]   Src withdrawal successful:", srcResult);
      }
    } catch (error) {
      console.error("Error triggering withdrawal:", error);
    }
  }

  /**
   * Calculate destination escrow address for EVM chains
   */
  private async calculateDstEscrowAddress(
    chainId: number,
    storedOrder: StoredOrderData,
    dstImmutables: any
  ): Promise<string | null> {
    try {
      // Get source immutables
      const srcImmutables = this.getSrcImmutables(
        storedOrder,
        !this.isEVMChain(storedOrder.originalParams.srcChainId)
      );

      // Get factory address for the destination chain
      const factoryAddress =
        ESCROW_FACTORY[chainId as keyof typeof ESCROW_FACTORY];
      const implementationAddress =
        ESCROW_DST_IMPLEMENTATION[
          chainId as keyof typeof ESCROW_DST_IMPLEMENTATION
        ];

      if (!factoryAddress || !implementationAddress) {
        console.error(
          `No factory or implementation address found for chain ID ${chainId}`
        );
        return null;
      }

      // Create escrow factory facade - chainId values should match NetworkEnum
      const factory = new EvmEscrowFactoryFacade(chainId, factoryAddress);

      // Create destination immutables complement
      const complement = DstImmutablesComplement.new({
        maker: dstImmutables.maker,
        amount: dstImmutables.amount,
        token: dstImmutables.token,
        taker: dstImmutables.taker,
        safetyDeposit: dstImmutables.safetyDeposit,
      });

      // Get deployment timestamp (if available from stored data)
      const deployedAt =
        storedOrder.dstDeployedAt || BigInt(Math.floor(Date.now() / 1000));

      // Calculate destination escrow address
      const escrowAddress = factory.getDstEscrowAddress(
        srcImmutables,
        complement,
        deployedAt,
        dstImmutables.taker,
        implementationAddress
      );

      return escrowAddress.toString();
    } catch (error) {
      console.error("Error calculating destination escrow address:", error);
      return null;
    }
  }

  /**
   * Send execution data to relayer
   * @param orderHash - Hash of the order
   * @param srcHash - Source chain transaction hash
   * @param dstHash - Destination chain transaction hash
   */
  public sendExecutionDataToRelayer(
    orderHash: string,
    srcHash: string,
    dstHash: string
  ): void {
    if (!this.wsClient) {
      console.warn(
        "WebSocket client not set, cannot send execution data to relayer"
      );
      return;
    }

    if (!this.wsClient.isReady()) {
      console.warn(
        "WebSocket not connected, cannot send execution data to relayer"
      );
      return;
    }

    try {
      const relayerMessage = `TXHASH ${orderHash} ${srcHash} ${dstHash}`;
      console.log(
        `[OrderManager] Sending to relayer: TXHASH ${orderHash.substring(
          0,
          10
        )}... ${srcHash.substring(0, 10)}... ${dstHash.substring(0, 10)}...`
      );
      this.wsClient.sendToRelayer(relayerMessage);
    } catch (error) {
      console.error("Failed to send execution data to relayer:", error);
    }
  }

  /**
   * Cancel escrow when cross-chain execution fails or times out
   * @param orderHash - Hash of the order to cancel
   * @param side - Whether to cancel 'src' or 'dst' escrow
   * @param escrowAddress - Address of the escrow contract
   */
  public async cancelEscrow(
    orderHash: string,
    side: "src" | "dst",
    escrowAddress: string
  ): Promise<{ txHash: string; blockHash: string }> {
    console.log(`Cancelling ${side} escrow: ${escrowAddress}`);

    const storedOrder = this.orders.get(orderHash);
    if (!storedOrder) {
      throw new Error(`Order not found: ${orderHash}`);
    }

    try {
      // Determine which client to use based on side and order direction
      const { originalParams } = storedOrder;
      const srcIsEVM = this.isEVMChain(originalParams.srcChainId);
      const useEVMClient = side === "src" ? srcIsEVM : !srcIsEVM;

      if (useEVMClient) {
        // Get immutables for the cancellation
        const immutables =
          side === "src"
            ? this.getSrcImmutables(storedOrder, srcIsEVM)
            : this.getDstImmutables(storedOrder, srcIsEVM);

        return await this.evmClient.cancelOrder(
          side,
          escrowAddress,
          immutables
        );
      } else {
        // Get immutables for the cancellation
        const immutables =
          side === "src"
            ? this.getSrcImmutables(storedOrder, srcIsEVM)
            : this.getDstImmutables(storedOrder, srcIsEVM);

        // TODO: Implement Sui cancellation
        return await this.suiClient.cancelOrder(
          side,
          escrowAddress,
          immutables
        );
      }
    } catch (error) {
      console.error(`Cancellation failed for ${orderHash}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to determine Sui coin type based on order data and escrow side
   */
  private getSuiCoinType(
    storedOrder: StoredOrderData,
    side: "src" | "dst"
  ): string {
    const { crossChainOrder } = storedOrder;

    // For source escrow, use maker asset; for destination escrow, use taker asset
    const assetAddress =
      side === "src" ? crossChainOrder.makerAsset : crossChainOrder.takerAsset;

    // Convert to string for comparison
    const assetAddressStr = assetAddress.toString().toLowerCase();

    console.log(`[OrderManager] Determining Sui coin type for ${side} escrow`);
    console.log(`[OrderManager]   Asset Address: ${assetAddressStr}`);

    // TODO: Implement proper EVM address to Sui coin type mapping
    // For now, default to SUI for most cases
    if (
      assetAddressStr === "0x0000000000000000000000000000000000000000" ||
      assetAddressStr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    ) {
      // Native ETH maps to SUI
      console.log(`[OrderManager]   Mapped native ETH to SUI coin type`);
      return "0x2::sui::SUI";
    }

    // For other tokens, we would need a mapping service or registry
    // For now, default to SUI
    console.warn(
      `[OrderManager] Using default SUI coin type for asset: ${assetAddressStr}`
    );
    console.log(
      `[OrderManager] TODO: Implement proper EVM → Sui coin type mapping for token: ${assetAddressStr}`
    );
    return "0x2::sui::SUI";
  }
}

export default OrderManager;
