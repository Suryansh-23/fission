# Fission Project Makefile

# Default target
help:
	@echo "Available commands:"
	@echo "  build                 - Build all contracts"
	@echo "  deploy-resolver-contract - Deploy resolver to local/anvil network"

# Build contracts
build:
	@echo "Building EVM contracts..."
	@cd contracts/evm/resolver && forge build

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@cd contracts/evm/resolver && forge clean

# Deploy resolver to local network (anvil)
deploy-resolver-contract:
	@echo "Deploying Resolver to local network..."
	@cd contracts/evm/resolver && forge script script/DeployResolver.s.sol:DeployResolver --rpc-url http://localhost:8545 --broadcast

# Install dependencies
install:
	@echo "Installing Foundry dependencies..."
	@cd contracts/evm/resolver && forge install
