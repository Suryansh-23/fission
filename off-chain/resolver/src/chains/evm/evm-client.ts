import {
  EvmAddress,
  EvmCrossChainOrder,
  HashLock,
  Immutables,
  TakerTraits,
  EvmEscrowFactory,
} from "@1inch/cross-chain-sdk";
import { ethers } from "ethers";
import { EVMConfig } from "../../config/chain";
import { EscrowFactory } from "../helper/escrow-factory";
import * as ResolverJson from "./Resolver.json";
export const RESOLVER_ABI = ResolverJson.abi;

export class EVMClient {
  private config: EVMConfig;
  private signer: any;
  private provider: ethers.JsonRpcProvider;
  private escrowFactory: EscrowFactory;

  // Finality lock timeout for EVM chains (in milliseconds)
  private static readonly FINALITY_LOCK_TIMEOUT = 2000;
  private static readonly SRC_ESCROW_IMPL_ADDRESS = EvmAddress.fromString(
    "0xcD70bf33cFE59759851dB21c83ea47b6B83beF6A"
  );
  private static readonly DST_ESCROW_IMPL_ADDRESS = EvmAddress.fromString(
    "0x9c3e06659f1c34F930cE97fCbce6e04ae88e535B"
  );

  constructor(config: EVMConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.escrowFactory = new EscrowFactory(
      this.provider,
      config.escrowFactoryAddress
    );
    console.log("EVMClient initialized with config");
  }

  async getTimestamp(blockHash: string) {
    const receipt = await this.provider.getBlock(blockHash);
    return receipt!.timestamp;
  }

  async createSrcEscrow(
    chainId: number,
    order: EvmCrossChainOrder,
    hashLock: HashLock, // Different for Full fill and Partial fill
    signature: string,
    fillAmount: bigint, // order.makingAmount
    takerTraits: TakerTraits
  ): Promise<{ txHash: string; blockHash: string }> {
    try {
      // Get hash lock from order
      // TODO: change this hash lock for SingleFill and PartialFill forMultipleFills
      // const hashLock = order.escrowExtension.hashLockInfo;

      // Decode signature to get r, vs components
      const sig = ethers.Signature.from(signature);
      const { r, yParityAndS: vs } = sig;

      // Encode taker traits to get args and trait
      const { args, trait } = takerTraits.encode();

      // Create immutables for source chain using SDK method
      const resolverAddress = EvmAddress.fromString(
        this.config.resolverContractAddress
      );
      console.log(
        "Creating source immutables with resolver address:",
        resolverAddress
      );

      const immutables = order.toSrcImmutables(
        chainId,
        resolverAddress,
        fillAmount,
        hashLock
      );
      console.log(
        "Immutables for source escrow:",
        immutables.maker,
        immutables.taker,
        immutables.hashLock
      );

      // Contract ABI matching the exact Resolver contract
      // TODO: Replace with actual Resolver contract ABI
      const contract = new ethers.Contract(
        this.config.resolverContractAddress,
        RESOLVER_ABI,
        this.signer
      );

      console.log("order:", order.build());

      const tx = await contract.deploySrc(
        immutables.build(),
        order.build(),
        r,
        vs,
        fillAmount,
        trait,
        args,
        {
          value: order.escrowExtension.srcSafetyDeposit,
        }
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      console.log(`Source escrow deployed - TxHash: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockHash: receipt.blockHash,
      };
    } catch (error) {
      console.error("Error creating source escrow:", error);
      throw error;
    }
  }

  async signOrder(srcChainId: number, order: any): Promise<string> {
    const typedData = order.getTypedData(srcChainId);

    return this.signer.signTypedData(
      typedData.domain,
      { Order: typedData.types[typedData.primaryType] },
      typedData.message
    );
  }

  /**
   * Get destination immutables from source escrow deployment
   * Uses escrow factory event monitoring approach
   */
  async getDstImmutables(srcBlockHash: string) {
    try {
      // Get source escrow event from factory
      const complement = await this.escrowFactory.getSrcDeployEvent(
        srcBlockHash
      );

      // Return both immutables and complement for address calculation
      return complement;
    } catch (error) {
      console.error("Error getting destination immutables:", error);
      throw error;
    }
  }

  async createDstEscrow(dstImmutables?: Immutables<EvmAddress>): Promise<any> {
    try {
      console.log("Creating destination escrow on EVM chain");

      if (!dstImmutables) {
        throw new Error(
          "Destination immutables required for EVM createDstEscrow"
        );
      }

      // Extract srcCancellationTimestamp from immutables.timeLocks
      const srcCancellationTimestamp =
        dstImmutables.timeLocks.toSrcTimeLocks().privateCancellation;

      // Contract ABI matching the exact Resolver.deployDst method
      const contract = new ethers.Contract(
        this.config.resolverContractAddress,
        RESOLVER_ABI,
        this.signer
      );

      // Call contract with proper parameters
      const tx = await contract.deployDst(
        dstImmutables.build(),
        srcCancellationTimestamp,
        { value: dstImmutables.safetyDeposit }
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      console.log(`Destination escrow deployed - TxHash: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockHash: receipt.blockHash,
      };
    } catch (error) {
      console.error("Error creating destination escrow:", error);
      throw error;
    }
  }

  async dstWithdrawFromEscrow(
    secret: string,
    immutables: Immutables<EvmAddress>,
    blockHash: string
  ) {
    try {
      console.log("Withdrawing from EVM escrow");

      // Contract ABI matching the exact Resolver.withdraw method
      const contract = new ethers.Contract(
        this.config.resolverContractAddress,
        RESOLVER_ABI,
        this.signer
      );

      // Convert hex secret to bytes32 format
      const secretBytes32 = ethers.id(secret).slice(0, 66);
      const newImmutables = immutables.withDeployedAt(
        BigInt(await this.getTimestamp(blockHash))
      );

      const escrowAddress = new EvmEscrowFactory(
        EvmAddress.fromString(this.getEscrowFactoryAddress())
      ).getSrcEscrowAddress(immutables, EVMClient.DST_ESCROW_IMPL_ADDRESS);

      // Call contract with proper parameter order (escrow, secret, immutables)
      const tx = await contract.withdraw(
        escrowAddress, // address escrow
        secretBytes32, // bytes32 secret
        newImmutables.build() // IBaseEscrow.Immutables
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      console.log(`Withdrawal successful - TxHash: ${receipt.hash}`);
      return {
        txHash: receipt.hash as string,
        blockHash: receipt.blockHash as string,
      };
    } catch (error) {
      console.error("Error withdrawing from escrow:", error);
      throw error;
    }
  }

  async srcWithdrawFromEscrow(
    secret: string,
    immutables: Immutables<EvmAddress>,
    blockHash: string
  ): Promise<any> {
    try {
      console.log("Withdrawing from EVM escrow");

      // Contract ABI matching the exact Resolver.withdraw method
      const contract = new ethers.Contract(
        this.config.resolverContractAddress,
        RESOLVER_ABI,
        this.signer
      );

      const timestamp = BigInt(await this.getTimestamp(blockHash));

      // Convert hex secret to bytes32 format
      const secretBytes32 = ethers.zeroPadValue(secret, 32);

      const newImmutables = immutables.withDeployedAt(timestamp);
      const build = newImmutables.build();

      console.log("src immutables at", timestamp, "are", build);

      const escrowAddress = new EvmEscrowFactory(
        EvmAddress.fromString(this.getEscrowFactoryAddress())
      ).getSrcEscrowAddress(newImmutables, EVMClient.SRC_ESCROW_IMPL_ADDRESS);

      console.log("src escrow address is", escrowAddress.toHex());

      // Call contract with proper parameter order (escrow, secret, immutables)
      const tx = await contract.withdraw(
        escrowAddress.toHex(), // address escrow
        secretBytes32, // bytes32 secret
        newImmutables.build() // IBaseEscrow.Immutables
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      console.log(`Withdrawal successful - TxHash: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockHash: receipt.blockHash,
      };
    } catch (error) {
      console.error("Error withdrawing from escrow:", error);
      throw error;
    }
  }

  /**
   * Cancel escrow on EVM chain
   * @param side - Whether this is source ('src') or destination ('dst') escrow
   * @param escrowAddress - Address of the escrow contract to cancel
   * @param immutables - Immutables object for the escrow
   */
  async cancelOrder(
    side: "src" | "dst",
    escrowAddress: string,
    immutables: any
  ): Promise<{ txHash: string; blockHash: string }> {
    try {
      console.log(`Cancelling ${side} escrow at address: ${escrowAddress}`);

      if (!escrowAddress || !immutables) {
        throw new Error(
          "Escrow address and immutables required for cancellation"
        );
      }

      // Contract ABI matching the exact Resolver.cancel method
      const contract = new ethers.Contract(
        this.config.resolverContractAddress,
        RESOLVER_ABI,
        this.signer
      );

      // Call contract with proper parameter order (escrow, immutables)
      const tx = await contract.cancel(
        escrowAddress, // address escrow
        immutables.build() // IBaseEscrow.Immutables
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      console.log(
        `${side} escrow cancelled successfully - TxHash: ${receipt.hash}`
      );

      return {
        txHash: receipt.hash,
        blockHash: receipt.blockHash,
      };
    } catch (error) {
      console.error(`Error cancelling ${side} escrow:`, error);
      throw error;
    }
  }

  getAddress(): string {
    return this.signer.address;
  }

  getEscrowFactoryAddress(): string {
    return this.config.escrowFactoryAddress;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  // Get finality lock timeout for this chain
  public getFinalityLockTimeout(): number {
    return EVMClient.FINALITY_LOCK_TIMEOUT;
  }

  private async getContract(): Promise<ethers.Contract> {
    // TODO: Replace with actual Resolver contract ABI
    // Placeholder ABI - will be replaced with complete resolver contract ABI
    return new ethers.Contract(
      this.config.resolverContractAddress,
      RESOLVER_ABI,
      this.signer
    );
  }
}

/**
 * internal working
 * deploySrc has these attributes: 
 * chainId, (decided which evm chain are we deploying the src escrow on) , from config.chain ✅ (from RelayerRequestParams)
 * order (CrossChainOrder), create using Sdk.CrossChainOrder.new() method (we have this, from the OrderManager) ✅
 * signature: string, signature = await srcChainUser.signOrder(srcChainId, order) ✅ (we have srcChainId and order)
 * takerTraits: Sdk.TakerTraits, Sdk.TakerTraits.default()
                        .setExtension(order.extension)
                        .setAmountMode(Sdk.AmountMode.maker)
                        .setAmountThreshold(order.takingAmount), 

 * amount, hashLock = order.escrowExtension.hashLockInfo ✅
 * 
 * 
 * USAGE FLOW:
 * 1. Call createSrcEscrow() -> returns { txHash, blockHash }
 * 2. Call getDstImmutables(blockHash) -> returns destination immutables for deployDst
 * 3. Call createDstEscrow() with the destination immutables
 * 
 * used by srcChainUser, this.Signer is from the ethers library, order is CrossChainOrder 
 * public async signOrder(srcChainId: number, order: Sdk.CrossChainOrder): Promise<string> {
        const typedData = order.getTypedData(srcChainId)

        return this.signer.signTypedData(
            typedData.domain,
            {Order: typedData.types[typedData.primaryType]},
            typedData.message
        )
    }
*/
