# Resolver Test Infrastructure

This directory contains testing infrastructure for the cross-chain resolver system.

## Overview

The test infrastructure includes:
- **MockRelayerServer**: Simulates a relayer WebSocket server for testing
- **ResolverTestRunner**: Orchestrates complete system tests

## Components

### Mock Relayer Server (`relayer-mock/mock-relayer.ts`)

A WebSocket server that simulates the behavior of a real relayer:

- Accepts client connections
- Sends test broadcast messages (`BROADC <JSON>`)
- Sends test secret reveals (`SECRET <secret>`)
- Supports manual message broadcasting

**Features:**
- Automatic test message generation
- Real-time client management
- Message format validation
- Graceful shutdown handling

### Test Runner (`resolver-test.ts`)

Complete integration test that:
1. Starts a mock relayer server
2. Initializes the resolver system
3. Tests WebSocket message handling
4. Validates order processing flow

## Running Tests

### Start Mock Relayer Only
```bash
# Terminal 1: Start mock relayer
cd off-chain/resolver
npx ts-node test/relayer-mock/mock-relayer.ts
```

### Run Complete Integration Test
```bash
# Terminal 1: Run full test
cd off-chain/resolver
npx ts-node test/resolver-test.ts
```

## Test Messages

### Broadcast Message Format
```
BROADC {
  "srcChainId": 137,
  "order": {
    "salt": "9445680539062707577101788567473077321018098965545264085818030520662873087459",
    "maker": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    "receiver": "0x0000000000000000000000000000000000000000",
    "makerAsset": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    "takerAsset": "0xda0000d4000015a526378bb6fafc650cea5966f8",
    "makingAmount": "10000000",
    "takingAmount": "9948907786114518",
    "makerTraits": "62419173104490761595518734107569287444564197129067859129427930236703456886784"
  },
  "signature": "0x7e72788f578ca5464b62f0405dfa4361dc3447c3a8136def58ca0489650cf2462b56e18c3ebf545ad6b1cc0b520cf84e0f200b6fa11ba34c78aa103a8030cb4e1c",
  "quoteId": "ddcae159-e73d-4f22-9234-4085e1b7f7dc",
  "extension": "0x0000011b0000004a0000004a0000004a0000004a000000250000000000000000a7bcb4eac8964306f9e3764f67db6a7af6ddf99a000000000000006884f49c0000b40ac27fa7bcb4eac8964306f9e3764f67db6a7af6ddf99a000000000000006884f49c0000b40ac27fa7bcb4eac8964306f9e3764f67db6a7af6ddf99a6884f48b2078c33fd9d03fc36b23000072f8a0c8c415454f629c0000101d89b656b7a810a03ebe0ac0b527e94559e691f87d561e71a12c26e34fe07fa0000000000000000000000000000000000000000000000000000000000000003800000000000000000000000000000000000000000000000000000000000000000000000000000000007e15f78c9e427000000000000000000003baf82d03a0000000000000000228000001b00000000c000003780000030000000264000000b4"
}
```

### Secret Reveal Format
```
SECRET 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

## Environment Variables

Set these environment variables for testing:

```bash
# WebSocket Configuration
WEBSOCKET_URL=ws://localhost:8080

# EVM Configuration
EVM_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
EVM_ESCROW_FACTORY=0x0000000000000000000000000000000000000000
EVM_ESCROW_IMPL=0x0000000000000000000000000000000000000000

# Sui Configuration  
SUI_PRIVATE_KEY=your_sui_private_key
SUI_ESCROW_FACTORY=your_sui_escrow_factory
SUI_ESCROW_IMPL=your_sui_escrow_implementation
```

## Expected Behavior

1. **Mock Relayer Startup**: Server starts on port 8080
2. **Resolver Connection**: Connects to WebSocket server
3. **Message Processing**: 
   - Receives broadcast → calls `registerOrder()`
   - Receives secret → calls `handleSecretReveal()`
4. **Order Management**: Creates cross-chain orders using SDK
5. **Chain Operations**: Executes blockchain transactions

## Architecture

```
┌─────────────────┐    WebSocket     ┌──────────────────┐
│   Mock Relayer  │ ←─────────────→  │     Resolver     │
│                 │                  │                  │
│ • Broadcasts    │                  │ • OrderManager   │
│ • Secrets       │                  │ • EVMClient      │
│ • Test Data     │                  │ • SuiClient      │
└─────────────────┘                  └──────────────────┘
```

## Troubleshooting

- **Connection Issues**: Check WebSocket URL and port availability
- **Message Format**: Ensure BROADC/SECRET prefixes are correct
- **Config Issues**: Verify all required environment variables are set
- **SDK Errors**: Check cross-chain SDK version compatibility
