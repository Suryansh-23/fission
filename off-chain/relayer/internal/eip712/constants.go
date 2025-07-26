package eip712

import (
	"fmt"

	"relayer/internal/common"

	ethcommon "github.com/ethereum/go-ethereum/common"
)

// EIP712 constants for 1inch Aggregation Router V6
const (
	LimitOrderV4TypeDataName    = "1inch Aggregation Router"
	LimitOrderV4TypeDataVersion = "6"
)

// 1inch Aggregation Router V6 contract addresses by chain ID
var limitOrderContracts = map[common.ChainID]string{
	common.EthereumMainnet: "0x111111125421cA6dc452d289314280a0f8842A65", // Example address - replace with actual
	common.ArbitrumOne:     "0x111111125421cA6dc452d289314280a0f8842A65", // Example address - replace with actual
	common.Polygon:         "0x111111125421cA6dc452d289314280a0f8842A65", // Example address - replace with actual
	common.BSC:             "0x111111125421cA6dc452d289314280a0f8842A65", // Example address - replace with actual
	common.Optimism:        "0x111111125421cA6dc452d289314280a0f8842A65", // Example address - replace with actual
	common.Base:            "0x111111125421cA6dc452d289314280a0f8842A65", // Example address - replace with actual
}

// GetLimitOrderContract returns the 1inch Aggregation Router contract address for the given chain ID
// This is equivalent to the TypeScript getLimitOrderContract function
func GetLimitOrderContract(chainID common.ChainID) (ethcommon.Address, error) {
	contractAddress, exists := limitOrderContracts[chainID]
	if !exists {
		return ethcommon.Address{}, fmt.Errorf("unsupported chain ID: %d", chainID)
	}

	return ethcommon.HexToAddress(contractAddress), nil
}
