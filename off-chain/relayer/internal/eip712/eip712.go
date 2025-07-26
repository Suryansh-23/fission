package eip712

import (
	"fmt"

	"relayer/internal/common"

	ethcommon "github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
)

// GetOrderHash computes the EIP712 hash for a given typed data
func GetOrderHash(typedData apitypes.TypedData) (ethcommon.Hash, error) {
	hash, _, err := apitypes.TypedDataAndHash(typedData)
	if err != nil {
		return ethcommon.Hash{}, fmt.Errorf("failed to compute EIP712 hash: %w", err)
	}
	return ethcommon.BytesToHash(hash), nil
}

// BuildOrderTypedData constructs the EIP712 typed data for a limit order
func BuildOrderTypedData(chainID common.ChainID, verifyingContract ethcommon.Address, name, version string, order common.LimitOrder) apitypes.TypedData {
	chainIDHex := math.NewHexOrDecimal256(int64(chainID))

	return apitypes.TypedData{
		Types: apitypes.Types{
			"EIP712Domain": EIP712Domain,
			"Order":        Order,
		},
		PrimaryType: "Order",
		Domain: apitypes.TypedDataDomain{
			Name:              name,
			Version:           version,
			ChainId:           chainIDHex,
			VerifyingContract: verifyingContract.Hex(),
		},
		Message: apitypes.TypedDataMessage{
			"salt":         order.Salt,
			"maker":        order.Maker,
			"receiver":     order.Receiver,
			"makerAsset":   order.MakerAsset,
			"takerAsset":   order.TakerAsset,
			"makingAmount": order.MakingAmount,
			"takingAmount": order.TakingAmount,
			"makerTraits":  order.MakerTraits,
		},
	}
}

// GetLimitOrderV4Domain returns the EIP712 domain for limit orders
func GetLimitOrderV4Domain(chainID common.ChainID) (apitypes.TypedDataDomain, error) {
	contract, err := GetLimitOrderContract(chainID)
	if err != nil {
		return apitypes.TypedDataDomain{}, fmt.Errorf("failed to get contract address: %w", err)
	}

	chainIDHex := math.NewHexOrDecimal256(int64(chainID))

	return apitypes.TypedDataDomain{
		Name:              LimitOrderV4TypeDataName,
		Version:           LimitOrderV4TypeDataVersion,
		ChainId:           chainIDHex,
		VerifyingContract: contract.Hex(),
	}, nil
}

// GetOrderHashForLimitOrder is a convenience function that builds typed data and computes hash for a limit order
// This is the main function you'll want to call with your order type & chainID
func GetOrderHashForLimitOrder(chainID common.ChainID, order common.LimitOrder) (ethcommon.Hash, error) {
	contract, err := GetLimitOrderContract(chainID)
	if err != nil {
		return ethcommon.Hash{}, fmt.Errorf("failed to get contract address: %w", err)
	}

	typedData := BuildOrderTypedData(
		chainID,
		contract,
		LimitOrderV4TypeDataName,
		LimitOrderV4TypeDataVersion,
		order,
	)

	return GetOrderHash(typedData)
}
