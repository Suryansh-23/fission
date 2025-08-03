# Fission Resolver

**TypeScript-based Resolver Service for Cross-Chain Atomic Swaps**

The Fission Resolver is a critical off-chain component that acts as an intermediary in cross-chain atomic swaps, facilitating secure order fulfillment between different blockchain networks. Built with TypeScript and leveraging industry-standard blockchain SDKs, it provides reliable order matching, escrow management, and atomic settlement coordination.

## 🎯 Core Functions

### Order Processing & Coordination
- **Real-time Order Reception**: Receives broadcasted orders from the relayer via WebSocket connections
- **Cross-Chain Validation**: Validates order parameters across EVM and Sui networks
- **Escrow Deployment**: Automatically deploys escrow contracts for secure fund custody
- **Atomic Settlement**: Coordinates secret revelation and fund release for atomic swaps

### Multi-Chain Integration
- **EVM Support**: Full integration with Ethereum and EVM-compatible chains using Ethers.js
- **Sui Integration**: Native Sui blockchain support using Mysten Labs SDK
- **Universal Interface**: Consistent API for interacting with different blockchain architectures

### Risk Management & Security
- **Order Validation**: Comprehensive validation of order parameters and signatures
- **Finality Monitoring**: Tracks transaction finality across different consensus mechanisms
- **Secret Management**: Secure handling of cryptographic secrets for atomic swaps
- **Error Recovery**: Robust error handling and recovery mechanisms

## 🏗️ Architecture

```
                    ┌─────────────────┐
                    │     Relayer     │
                    │   (Go Service)  │
                    └─────────┬───────┘
                              │ WebSocket
                              │ (ws://localhost:8080)
                              ▼
              ┌─────────────────────────────────┐
              │         Resolver Service        │
              │       (TypeScript/Node.js)      │
              │                                 │
              │  ┌─────────────┐                │
              │  │  WebSocket  │                │
              │  │   Client    │◄────────────── ┼──── Order Broadcasting
              │  │(/src/communication/ws.ts)    │
              │  └─────────────┘                │
              │         │                       │
              │         ▼                       │
              │  ┌─────────────┐                │
              │  │Order Manager│                │
              │  │ (/src/core) │                │
              │  └─────────────┘                │
              │    │         │                  │
              │    ▼         ▼                  │
              │ ┌─────┐   ┌─────┐               │
              │ │ EVM │   │ Sui │               │
              │ │Client│  │Client│              │
              │ └─────┘   └─────┘               │
              └─────┼───────────┼───────────────┘
                    │           │
                    ▼           ▼
        ┌─────────────────┐   ┌─────────────────┐
        │   EVM Networks  │   │   Sui Network   │
        │   ┌─────────┐   │   │   ┌─────────┐   │
        │   │Ethereum │   │   │   │   Sui   │   │
        │   │Polygon  │   │   │   │ Mainnet │   │
        │   │Arbitrum │   │   │   │         │   │
        │   │  Base   │   │   │   │         │   │
        │   └─────────┘   │   │   └─────────┘   │
        │                 │   │                 │
        │ Ethers.js v6    │   │ Mysten Labs SDK │
        │ Provider/Signer │   │ SuiClient       │
        └─────────────────┘   └─────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** with TypeScript support
- **Environment Variables** for blockchain configuration
- **Network Access** to EVM and Sui RPC endpoints
- **Private Keys** for both EVM and Sui accounts (for testing)


### Installation & Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start resolver in development mode
npm run dev

# Test relayer connection
npm run test-connection
```

## 🔧 Development

### Project Structure

```
resolver/
├── src/
│   ├── index.ts                    # Application entry point
│   ├── core/
│   │   ├── Resolver.ts            # Main resolver orchestrator
│   │   └── OrderManager.ts        # Order processing logic
│   ├── communication/
│   │   └── ws.ts                  # WebSocket client for relayer connection
│   ├── chains/
│   │   ├── evm/
│   │   │   ├── evm-client.ts      # EVM blockchain client (Ethers.js)
│   │   │   └── Resolver.json      # EVM resolver contract ABI
│   │   ├── sui/
│   │   │   ├── sui-client.ts      # Sui blockchain client (Mysten SDK)
│   │   │   ├── src-escrow.ts      # Sui source escrow operations
│   │   │   └── dst-escrow.ts      # Sui destination escrow operations
│   │   ├── interface/
│   │   │   └── chain-interface.ts # Common chain client interface
│   │   └── helper/
│   │       ├── escrow-factory.ts  # Escrow contract factory
│   │       ├── coin-sui.ts        # Sui coin utilities
│   │       └── immutables-sui.ts  # Sui immutable data helpers
│   └── config/
│       └── ConfigManager.ts       # Configuration management
├── test/
│   └── mock-relayer.ts            # Mock relayer for testing
├── package.json                   # Dependencies and scripts
└── tsconfig.json                  # TypeScript configuration
```

### Key Components Deep Dive

#### 1. WebSocket Communication (`/src/communication/ws.ts`)

Establishes persistent connection with the relayer service for real-time order updates:

```typescript
export class ResolverWebSocketClient {
  private ws: WebSocket | null = null;
  private relayerUrl: string;
  private resolverId: string;
  
  // Handles incoming messages from relayer
  private handleMessage(data: WebSocket.Data): void {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
      case "BROADC": // Broadcast order
        this.handleBroadcastOrder(message.data);
        break;
      case "SECRET": // Secret revelation
        this.handleSecretReveal(message.data);
        break;
    }
  }
}
```

**Key Features:**
- Automatic reconnection with exponential backoff
- Message type handling for order broadcasts and secret sharing
- Connection health monitoring and error recovery

#### 2. EVM Integration (`/src/chains/evm/evm-client.ts`)

Utilizes [Ethers.js v6](https://docs.ethers.org/v6/) for comprehensive EVM blockchain interaction:

```typescript
export class EVMClient {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  
  constructor(config: EVMConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
  }
  
  // Deploy escrow contract for order fulfillment
  async deployEscrow(orderData: EvmCrossChainOrder): Promise<string> {
    const factory = new ethers.Contract(
      this.config.escrowFactoryAddress,
      RESOLVER_ABI,
      this.signer
    );
    
    const tx = await factory.deployEscrow(orderData);
    const receipt = await tx.wait();
    return receipt.contractAddress;
  }
}
```

**Integration Features:**
- Smart contract deployment and interaction
- Transaction monitoring and finality confirmation
- Gas optimization and error handling
- Support for multiple EVM networks (Ethereum, Polygon, Arbitrum, etc.)

#### 3. Sui Integration (`/src/chains/sui/sui-client.ts`)

Leverages [Mysten Labs Sui SDK](https://sdk.mystenlabs.com/typescript) for native Sui blockchain operations:

```typescript
export class SuiClient {
  private client: SuiSdkClient;
  private keypair: Ed25519Keypair;
  
  constructor(config: SuiConfig) {
    this.client = new SuiSdkClient({ url: config.rpcUrl });
    this.keypair = Ed25519Keypair.fromSecretKey(config.privateKey);
  }
  
  // Create destination escrow on Sui
  async createDstEscrow(params: CreateDstEscrowParams): Promise<string> {
    const tx = new Transaction();
    
    tx.moveCall({
      target: `${this.config.packageId}::escrow::create_dst_escrow`,
      arguments: [
        tx.pure.address(params.maker),
        tx.pure.vector('u8', params.orderHash),
        tx.pure.u64(params.amount),
        // ... other parameters
      ],
      typeArguments: [params.coinType]
    });
    
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair
    });
    
    return result.digest;
  }
}
```

**Integration Features:**
- Move call execution for smart contract interaction
- Object management and state tracking
- Coin handling and balance management
- Transaction building and execution with proper type arguments

## 📡 API Reference

### WebSocket Message Types

#### Order Broadcast Message
```json
{
  "type": "BROADC",
  "data": {
    "orderHash": "0x1234...",
    "maker": "0xabcd...",
    "srcChain": "ethereum",
    "dstChain": "sui", 
    "srcAsset": "0x1234...",
    "dstAsset": "0x5678...",
    "srcAmount": "1000000000000000000",
    "dstAmount": "2000000",
    "hashLock": "0x9876...",
    "timeLock": 1691234567,
    "signature": "0xdef0..."
  }
}
```

#### Secret Revelation Message
```json
{
  "type": "SECRET",
  "data": {
    "orderHash": "0x1234...",
    "secret": "0xabcd...",
    "timestamp": 1691234567
  }
}
```



npm test -- --grep "WebSocket"

## 🧪 Testing

### Mock Relayer

For development and testing, use the included mock relayer:

```typescript
// test/mock-relayer.ts
const mockRelayer = new MockRelayerServer(8080);
mockRelayer.start();

// Simulate order broadcast
mockRelayer.broadcastOrder({
  orderHash: "0x1234...",
  maker: "0xabcd...",
  // ... order data
});
```


## 🔗 External Dependencies

### Core Blockchain SDKs
- **[Ethers.js v6](https://docs.ethers.org/v6/)**: Ethereum and EVM blockchain interaction
- **[Mysten Labs Sui SDK](https://sdk.mystenlabs.com/typescript)**: Sui blockchain native integration
- **[1inch Cross-Chain SDK](../../cross-chain-sdk/)**: Cross-chain order management and utilities

### Communication & Utilities
- **[ws](https://github.com/websockets/ws)**: WebSocket client for relayer communication
- **[dotenv](https://github.com/motdotla/dotenv)**: Environment configuration management

---

Built with ⚡ TypeScript for reliable cross-chain order resolution 