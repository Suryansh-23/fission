# Fission 🚀

**Trustless Cross-Chain Atomic Swaps Between Ethereum and Sui**

Fission enables secure, decentralized token exchanges across Ethereum and Sui blockchains without requiring trusted intermediaries. Using cryptographic hash locks and time-locked escrows, Fission guarantees that swaps either complete atomically or allow safe fund recovery.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.23-red.svg)](https://soliditylang.org/)
[![Move](https://img.shields.io/badge/Move-Sui-blue.svg)](https://docs.sui.io/concepts/sui-move-concepts)

## 🌟 Key Features

- **🔒 Trustless**: No custody of funds by centralized parties
- **⚛️ Atomic**: Swaps complete entirely or fail safely with fund recovery
- **🌐 Cross-Chain**: Seamless exchanges between Ethereum and Sui ecosystems  
- **🛡️ Secure**: Time-locked escrows with cryptographic guarantees
- **📊 Flexible**: Support for partial fills and multiple order fulfillment
- **🏆 Economically Secure**: Safety deposits prevent griefing attacks

## 🏗️ Architecture Overview

Fission operates through a **dual-escrow system**:

1. **Source Escrow**: Holds maker's tokens on the origin chain
2. **Destination Escrow**: Holds resolver's tokens on the target chain
3. **Hash Lock**: Cryptographic secret enables atomic claiming
4. **Time Locks**: Escalating permissions ensure safe fund recovery

**📖 For detailed technical specifications, see [Architecture Documentation](./architecture.md)**

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- Rust and Cargo (for Sui development)
- Foundry (for Ethereum development)

### Installation

```bash
# Clone the repository
git clone https://github.com/Suryansh-23/fission.git
cd fission

# Install dependencies for cross-chain SDK
cd cross-chain-sdk
npm install

# Install dependencies for off-chain services
cd ../off-chain/resolver
npm install
```

### Basic Usage

#### Creating a Cross-Chain Order

```typescript
import { SuiCrossChainOrder, EvmCrossChainOrder } from '@fission/cross-chain-sdk'

// Sui → Ethereum swap
const suiOrder = SuiCrossChainOrder.new({
  makerAsset: new SuiAddress('0x2::sui::SUI'),
  takerAsset: EvmAddress.fromString('0xA0b86a33E6441E27'), // USDC
  makingAmount: 1000000000n, // 1 SUI
  takingAmount: 2000000n,    // 2 USDC
  maker: new SuiAddress('0x...'),
  receiver: EvmAddress.fromString('0x...')
}, escrowParams, auctionDetails)

// Ethereum → Sui swap  
const evmOrder = EvmCrossChainOrder.new(
  factoryAddress,
  orderData,
  escrowParams,
  auctionDetails
)
```

#### Running a Resolver

```bash
cd off-chain/resolver
npm run start
```

## 📁 Project Structure

```
fission/
├── contracts/                    # Smart contracts
│   ├── evm/                     # Ethereum Solidity contracts
│   │   └── resolver/            # Resolver and escrow contracts
│   └── move/                    # Sui Move contracts
│       └── fusion_plus/         # Source/destination escrow modules
├── cross-chain-sdk/             # TypeScript SDK
│   ├── src/                     # SDK implementation
│   └── tests/                   # Integration tests
├── off-chain/                   # Off-chain infrastructure
│   ├── resolver/                # Order fulfillment service
│   └── relayer/                 # Order broadcast service
└── docs/                        # Documentation
```

## 🔧 Development

### Smart Contract Development

#### Sui Move Contracts

```bash
cd contracts/move/fusion_plus
sui move test                    # Run tests
sui move build                   # Build contracts
```

#### Ethereum Solidity Contracts

```bash
cd contracts/evm/resolver
forge test                       # Run tests
forge build                      # Build contracts
forge script Deploy             # Deploy contracts
```

### SDK Development

```bash
cd cross-chain-sdk
npm run test                     # Run unit tests
npm run test:integration         # Run integration tests
npm run build                    # Build SDK
```

### Off-Chain Services

```bash
# Resolver service
cd off-chain/resolver
npm run dev                      # Development mode
npm run test                     # Run tests

# Relayer service (Go)
cd off-chain/relayer
make build                       # Build relayer
make test                        # Run tests
```

## 🧪 Testing

### End-to-End Testing

```bash
# Start local networks
npm run start:anvil              # Ethereum local node
npm run start:sui-local          # Sui local network

# Run integration tests
cd cross-chain-sdk
npm run test:e2e
```

### Contract Testing

```bash
# Sui Move tests
cd contracts/move/fusion_plus
sui move test

# Ethereum tests
cd contracts/evm/resolver
forge test -vvv
```

## 🌐 Supported Networks

### Mainnet
- **Ethereum**: Mainnet, Arbitrum, Polygon
- **Sui**: Mainnet

### Testnet  
- **Ethereum**: Sepolia, Arbitrum Sepolia
- **Sui**: Testnet, Devnet

## 🔐 Security

### Audit Status
- [ ] Smart contract audits pending
- [ ] Economic security analysis in progress

### Bug Bounty
We take security seriously. If you discover vulnerabilities, please report them to:
- **Email**: security@fission.exchange
- **GPG Key**: [Public Key](./security/pgp-key.asc)

### Security Features
- **Time-locked escrows** with escalating withdrawal permissions
- **Cryptographic hash locks** ensuring atomic execution
- **Economic incentives** via safety deposits
- **Multi-signature** resolver registration and management

This project is licensed under the [MIT License](./LICENSE).
