package hash

import (
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
)

// EIP712Domain defines the EIP712 domain type structure
var EIP712Domain = []apitypes.Type{
	{Name: "name", Type: "string"},
	{Name: "version", Type: "string"},
	{Name: "chainId", Type: "uint256"},
	{Name: "verifyingContract", Type: "address"},
}

// Order defines the Order type structure for EIP712
var Order = []apitypes.Type{
	{Name: "salt", Type: "uint256"},
	{Name: "maker", Type: "address"},
	{Name: "receiver", Type: "address"},
	{Name: "makerAsset", Type: "address"},
	{Name: "takerAsset", Type: "address"},
	{Name: "makingAmount", Type: "uint256"},
	{Name: "takingAmount", Type: "uint256"},
	{Name: "makerTraits", Type: "uint256"},
}
