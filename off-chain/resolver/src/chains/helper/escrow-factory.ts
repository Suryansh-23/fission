import * as Sdk from "@1inch/cross-chain-sdk";
import { ethers } from "ethers";

export class EscrowFactory {
  private provider: ethers.JsonRpcProvider;
  private address: string;
  private iface: ethers.Interface;

  constructor(provider: ethers.JsonRpcProvider, factoryAddress: string) {
    this.provider = provider;
    this.address = factoryAddress;

    // TODO: Replace with actual EscrowFactory contract ABI
    // Placeholder ABI - will be replaced with complete escrow factory ABI
    const escrowFactoryAbi = [
      {
        anonymous: false,
        inputs: [
          {
            components: [
              {
                internalType: "bytes32",
                name: "orderHash",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "hashlock",
                type: "bytes32",
              },
              {
                internalType: "Address",
                name: "maker",
                type: "uint256",
              },
              {
                internalType: "Address",
                name: "taker",
                type: "uint256",
              },
              {
                internalType: "Address",
                name: "token",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "safetyDeposit",
                type: "uint256",
              },
              {
                internalType: "Timelocks",
                name: "timelocks",
                type: "uint256",
              },
            ],
            indexed: false,
            internalType: "struct IBaseEscrow.Immutables",
            name: "srcImmutables",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "Address",
                name: "maker",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256",
              },
              {
                internalType: "Address",
                name: "token",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "safetyDeposit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "chainId",
                type: "uint256",
              },
            ],
            indexed: false,
            internalType: "struct IEscrowFactory.DstImmutablesComplement",
            name: "dstImmutablesComplement",
            type: "tuple",
          },
        ],
        name: "SrcEscrowCreated",
        type: "event",
      },
    ];

    this.iface = new ethers.Interface(escrowFactoryAbi);
  }

  /**
   * Get source escrow deployment event from block hash
   * Returns immutables and complement needed for destination deployment
   */
  public async getSrcDeployEvent(blockHash: string) {
    const event = this.iface.getEvent("SrcEscrowCreated")!;
    const logs = await this.provider.getLogs({
      blockHash,
      address: this.address,
      topics: [event.topicHash],
    });

    if (logs.length === 0) {
      throw new Error(`No SrcEscrowCreated events found in block ${blockHash}`);
    }

    const [data] = logs.map((l) => this.iface.decodeEventLog(event, l.data));
    const complement = data.at(1);

    return [
      {
        maker: Sdk.Address.fromBigInt(complement[0]), // Type assertion for SDK compatibility
        amount: complement[1] as bigint,
        token: Sdk.SuiAddress.fromBigInt(complement[2]),
        taker: Sdk.Address.fromBigInt(complement[3]),
        safetyDeposit: complement[4] as bigint,
      },
    ];
  }
}
