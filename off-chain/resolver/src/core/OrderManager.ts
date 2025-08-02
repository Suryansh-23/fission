import {
  AmountMode,
  Extension,
  HashLock,
  TakerTraits,
  RelayerRequestParams,
  SupportedChain,
  SuiAddress,
  EvmEscrowFactory,
  EvmEscrowFactoryFacade,
  EvmCrossChainOrder,
  ESCROW_DST_IMPLEMENTATION,
  ESCROW_FACTORY,
  EvmAddress,
  DstImmutablesComplement,
} from "@1inch/cross-chain-sdk";
import { EVMClient } from "../chains/evm/evm-client";
import { SuiClient } from "../chains/sui/sui-client";
import { ResolverWebSocketClient } from "../communication/ws";

// Order data stored in the mapping - includes original params + converted order + runtime data
interface StoredOrderData {
  // Original params from relayer
  originalParams: RelayerRequestParams;
  // Converted cross-chain order from SDK
  crossChainOrder: EvmCrossChainOrder;
  // Runtime data for cross-chain execution
  srcComplement?: any;
  dstDeployedAt?: bigint;
  isPartialFill?: boolean;
  // Sui escrow IDs for object-based tracking
  srcEscrowId?: string;
  dstEscrowId?: string;
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
    console.log("Registering order from RelayerRequestParams");
    // @note order stored for this resolver needs to compute this - hash lock will be the secretHash[resolverId + 1], if this is an array then store variable in stored order that partial fills is true.
    // Decode the extension from the relayer params
    const extension = Extension.decode(relayerParams.extension);
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
        console.log(`EVM source escrow deployed - TxHash: ${srcResult.txHash}`);

        // Get source complement from factory event
        const srcComplement = await this.evmClient.getDstImmutables(
          srcResult.blockHash
        );
        storedOrder.srcComplement = srcComplement;
      } else {
        console.log(`Using Sui client for source deployment`);

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
        const makerAddress = originalParams.order.maker;
        const takerAddress = this.suiClient.getAddress();

        // Extract amounts from cross-chain order
        const depositAmount = crossChainOrder.takingAmount; // Amount to deposit on destination
        const safetyDepositAmount =
          crossChainOrder.escrowExtension.dstSafetyDeposit;

        // Get destination token type (for Sui, this would be the coin type)
        const dstToken = crossChainOrder.takerAsset;
        // TODO: Convert EVM address to Sui coin type properly
        const coinType = "0x2::sui::SUI"; // Default to SUI for now, should be mapped from dstToken

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
          coinType
        );

        console.log(
          `[OrderManager] Sui destination escrow deployed - TxHash: ${dstResult.txHash}`
        );
        console.log(
          `[OrderManager] BlockHash: ${dstResult.blockHash || dstResult.txHash}`
        );

        // Store destination escrow ID if available (for future use in withdrawals/cancellations)
        if (dstResult.escrowId) {
          storedOrder.dstEscrowId = dstResult.escrowId;
          console.log(
            `[OrderManager] Stored destination escrow ID: ${dstResult.escrowId}`
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
      ? this.evmClient.getAddress()
      : this.suiClient.getAddress();

    return crossChainOrder.toSrcImmutables(
      originalParams.srcChainId,
      EvmAddress.fromString(resolverAddress),
      crossChainOrder.takingAmount,
      crossChainOrder.escrowExtension.hashLockInfo
    );
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
        const evmClient = this.evmClient; // We have single EVM client for now

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
        const result = await evmClient.withdrawFromEscrow(
          escrowAddress,
          secret,
          dstImmutables
        );
        console.log(`EVM withdrawal successful:`, result);
      } else {
        // For Sui chains, use escrow ID from stored data
        const { originalParams } = storedOrder;
        const srcIsEVM = this.isEVMChain(originalParams.srcChainId);

        // Determine if this is source or destination escrow on Sui
        // If source is EVM and destination is Sui (EVM -> Sui), withdraw from destination escrow
        // If source is Sui and destination is EVM (Sui -> EVM), withdraw from source escrow
        const isWithdrawFromDst = srcIsEVM; // EVM -> Sui means withdraw from Sui destination

        let escrowId: string | undefined;
        let targetAddress: string | undefined;

        if (isWithdrawFromDst) {
          // Withdrawing from destination escrow (ETH to Sui)
          escrowId = storedOrder.dstEscrowId;
          if (!escrowId) {
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
          console.log(`[OrderManager]   Escrow ID: ${escrowId}`);
          console.log(`[OrderManager]   Direction: ETH → Sui`);
          const secretBytes = new Uint8Array(
            Buffer.from(secret.replace("0x", ""), "hex")
          );
          const coinType = this.getSuiCoinType(storedOrder, "dst");
          console.log(`[OrderManager]   Coin Type: ${coinType}`);

          const result = await this.suiClient.withdrawFromDstEscrow(
            escrowId,
            secretBytes,
            coinType
          );
          console.log(
            `[OrderManager] Sui destination withdrawal successful:`,
            result
          );
        } else {
          // Withdrawing from source escrow (Sui to ETH)
          escrowId = storedOrder.srcEscrowId;
          if (!escrowId) {
            console.error(
              "[OrderManager] Source escrow ID not found for Sui withdrawal"
            );
            console.log(
              "[OrderManager] TODO: Implement escrow ID extraction from relayer or transaction events"
            );
            return;
          }

          // For source escrow withdrawal, we need a target address (on destination EVM chain)
          targetAddress = this.evmClient.getAddress();

          console.log(`[OrderManager] Withdrawing from Sui source escrow...`);
          console.log(`[OrderManager]   Escrow ID: ${escrowId}`);
          console.log(`[OrderManager]   Direction: Sui → ETH`);
          console.log(`[OrderManager]   Target Address: ${targetAddress}`);
          const secretBytes = new Uint8Array(
            Buffer.from(secret.replace("0x", ""), "hex")
          );
          const coinType = this.getSuiCoinType(storedOrder, "src");
          console.log(`[OrderManager]   Coin Type: ${coinType}`);

          const result = await this.suiClient.withdrawFromSrcEscrow(
            escrowId,
            secretBytes,
            targetAddress,
            coinType
          );
          console.log(
            `[OrderManager] Sui source withdrawal successful:`,
            result
          );
        }
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
   * Withdraw funds from escrow after successful cross-chain execution
   * @param orderHash - Hash of the order to withdraw from
   * @param side - Whether to withdraw from 'src' or 'dst' escrow
   * @param secret - Secret to unlock the escrow
   * @param escrowAddress - Address of the escrow contract
   */
  public async withdrawFromEscrow(
    orderHash: string,
    side: "src" | "dst",
    secret: string,
    escrowAddress: string
  ): Promise<{ txHash: string; blockHash: string }> {
    console.log(`Withdrawing from ${side} escrow: ${escrowAddress}`);

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
        // Get immutables for the withdrawal
        const immutables =
          side === "src"
            ? this.getSrcImmutables(storedOrder, srcIsEVM)
            : this.getDstImmutables(storedOrder, srcIsEVM);

        return await this.evmClient.withdrawFromEscrow(
          escrowAddress,
          secret,
          immutables
        );
      } else {
        // Use Sui client for withdrawal
        const escrowId =
          side === "src" ? storedOrder.srcEscrowId : storedOrder.dstEscrowId;
        if (!escrowId) {
          console.error(
            `[OrderManager] ${side.toUpperCase()} escrow ID not found for Sui withdrawal`
          );
          console.log(
            `[OrderManager] TODO: Implement escrow ID extraction from relayer or transaction events`
          );
          throw new Error(
            `${side.toUpperCase()} escrow ID not found for Sui withdrawal`
          );
        }

        console.log(`[OrderManager]   Sui Escrow ID: ${escrowId}`);
        const secretBytes = new Uint8Array(
          Buffer.from(secret.replace("0x", ""), "hex")
        );
        const coinType = this.getSuiCoinType(storedOrder, side);
        console.log(`[OrderManager]   Coin Type: ${coinType}`);

        if (side === "src") {
          // Source escrow withdrawal requires target address
          const targetAddress = this.evmClient.getAddress();
          console.log(`[OrderManager]   Target Address: ${targetAddress}`);
          console.log(`[OrderManager]   Calling Sui source withdrawal...`);
          const result = await this.suiClient.withdrawFromSrcEscrow(
            escrowId,
            secretBytes,
            targetAddress,
            coinType
          );
          console.log(
            `[OrderManager] Sui source withdrawal completed:`,
            result
          );
          return result;
        } else {
          // Destination escrow withdrawal
          console.log(`[OrderManager]   Calling Sui destination withdrawal...`);
          const result = await this.suiClient.withdrawFromDstEscrow(
            escrowId,
            secretBytes,
            coinType
          );
          console.log(
            `[OrderManager] Sui destination withdrawal completed:`,
            result
          );
          return result;
        }
      }
    } catch (error) {
      console.error(`Withdrawal failed for ${orderHash}:`, error);
      throw error;
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
