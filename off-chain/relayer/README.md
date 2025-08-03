# Fission Cross-Chain Relayer

A Go-based service that coordinates cross-chain atomic swaps by monitoring blockchain events, managing order lifecycles, and facilitating real-time communication between makers, takers, and resolvers in the Fission protocol.

## Overview

The relayer acts as the central coordination hub for cross-chain operations, monitoring EVM and Sui blockchain events, managing order state with TTL-based storage, and broadcasting updates through WebSocket connections to connected resolvers.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   HTTP Server   │     │ WebSocket Server│
│    Port 8080    │     │    Port 8081    │
└─────────┬───────┘     └─────────┬───────┘
          │                       │
          └───────────┬───────────┘
                      │
          ┌───────────▼───────────┐
          │       Manager         │
          │  - TTL Maps (Orders)  │
          │  - Broadcaster        │
          │  - EVM Client         │
          │  - Sui Client         │
          └───────────────────────┘
```

## Core Components

### Manager (`internal/manager/`)
Central coordination service that handles:
- **Order Storage**: TTL-based maps for quotes and orders with automatic expiration
- **Blockchain Clients**: EVM (go-ethereum) and Sui (sui-go-sdk) connections  
- **Event Broadcasting**: Distributes events to WebSocket connections via broadcaster
- **RPC Health**: Monitors blockchain endpoint connectivity

### HTTP API Server (`internal/api/`)
RESTful API for order management:
- **Quote Endpoint**: `GET /quoter/v1.0/quote/receive` - Price quote retrieval
- **Order Submission**: `POST /relayer/v1.0/submit` - Submit cross-chain orders
- **Secret Handling**: `POST /relayer/v1.0/submit/secret` - Secret reveal coordination
- **Order Status**: `GET /orders/v1.0/order/status/:orderHash` - Order state queries
- **Ready Check**: `GET /orders/v1.0/order/ready-to-accept-secret-fills/:orderHash`

### WebSocket Server (`internal/ws/`)
Real-time communication layer:
- **Connection Management**: Handles multiple concurrent WebSocket connections
- **Message Broadcasting**: Distributes blockchain events to connected resolvers
- **CORS Support**: Cross-origin resource sharing for web clients
- **Connection Registration**: Manages resolver subscriptions and message routing

### Blockchain Monitoring (`internal/chain/`)
Multi-chain event monitoring:
- **EVM Events**: Monitors `SrcEscrowCreated` events using go-ethereum client
- **Sui Events**: Tracks Move-based events using sui-go-sdk client
- **Event Parsing**: Extracts order data from blockchain transaction events
- **Time Synchronization**: Maintains accurate cross-chain timestamps

## Installation

### Prerequisites
- Go 1.23+ installed
- Access to EVM RPC endpoint (Ethereum/Sepolia)
- Access to Sui RPC endpoint
- Git for version control

### Setup

1. **Clone and build**:
```bash
cd off-chain/relayer
go mod download
go build -o relayer cmd/main.go
```

2. **Environment configuration**:
Set required environment variables for blockchain RPC endpoints and server ports before starting the service.

3. **Run the service**:
```bash
./relayer
```

## Configuration

The relayer requires blockchain RPC endpoints for EVM and Sui networks, along with optional server port configuration. Environment variables control the service behavior including logging verbosity and connection timeouts.

## API Reference

### HTTP Endpoints

#### Order Management
```bash
# Submit cross-chain order
POST /relayer/v1.0/submit
Content-Type: application/json

{
  "orderHash": "0x...",
  "srcChainId": 11155111,
  "order": { ... },
  "signature": "0x..."
}

# Get order status
GET /orders/v1.0/order/status/0x1234...

# Check if ready for secret reveal
GET /orders/v1.0/order/ready-to-accept-secret-fills/0x1234...
```

#### Quote System
```bash
# Get price quote
GET /quoter/v1.0/quote/receive?src=ETH&dst=SUI&amount=1000000

# Submit secret for order completion
POST /relayer/v1.0/submit/secret
Content-Type: application/json

{
  "orderHash": "0x...",
  "secret": "0x..."
}
```

### WebSocket API

Connect to `ws://localhost:8081/` for real-time events:

```javascript
const ws = new WebSocket('ws://localhost:8081');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle order updates, quotes, secrets
};
```

## Blockchain Integration

### EVM Chain Monitoring
The relayer implements comprehensive EVM blockchain monitoring using the go-ethereum client library. It establishes persistent connections to Ethereum-compatible networks and monitors contract events through:

- **Event Filtering**: Implements ABI-based event parsing for `SrcEscrowCreated` events from escrow factory contracts
- **Block Synchronization**: Maintains synchronized state with the latest blockchain blocks to detect new events
- **Transaction Analysis**: Extracts transaction data including order hashes, hashlock commitments, maker/taker addresses, and token amounts
- **Geth Integration**: Leverages the official go-ethereum client for reliable blockchain interaction and event subscription
- **Web3 Provider Support**: Compatible with various RPC providers including Infura, Alchemy, and custom node endpoints

The EVM monitoring system uses structured event data containing order identifiers, cryptographic hashlocks for atomic swap coordination, participant addresses, and cross-chain amount specifications.

### Sui Chain Monitoring  
Sui blockchain integration utilizes the sui-go-sdk for Move-based smart contract event monitoring:

- **Move Event Processing**: Parses structured events from Sui Move smart contracts using the native object model
- **Object ID Tracking**: Monitors Sui object IDs for state changes and ownership transfers in escrow contracts
- **RPC Client Integration**: Uses Sui's JSON-RPC interface for querying transaction events and object states
- **Transaction Digest Analysis**: Processes transaction digests to extract escrow creation events and participant data
- **Checkpoint Synchronization**: Maintains consistency with Sui network checkpoints for reliable event detection

The Sui monitoring leverages Move's type-safe event system to capture cross-chain order data including object references, participant addresses, and token transfer amounts while maintaining compatibility with Sui's object-centric blockchain model.

## Development

### Project Structure
```
relayer/
├── cmd/
│   └── main.go              # Application entry point
├── internal/
│   ├── api/                 # HTTP API server
│   │   ├── server.go        # HTTP server setup
│   │   └── routes.go        # API route handlers
│   ├── ws/                  # WebSocket server
│   │   ├── server.go        # WebSocket server setup
│   │   └── handler.go       # Connection handling
│   ├── manager/             # Core business logic
│   │   ├── manager.go       # Main coordination
│   │   └── broadcaster.go   # Event broadcasting
│   ├── chain/               # Blockchain clients
│   │   ├── evm.go           # Ethereum integration
│   │   └── move.go          # Sui integration
│   ├── common/              # Shared utilities
│   └── hash/                # Cryptographic functions
├── go.mod                   # Go dependencies
└── Makefile                 # Build automation
```

### Building

The relayer supports standard Go build processes with optional Makefile automation for development workflows including hot reload capabilities and test execution.
