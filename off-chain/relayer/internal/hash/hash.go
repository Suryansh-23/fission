package hash

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"

	"relayer/internal/common"

	"github.com/block-vision/sui-go-sdk/mystenbcs"
	ethcommon "github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"
	"github.com/holiman/uint256"
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
	chainIDHex := (*uint256.Int)(chainID)

	return apitypes.TypedData{
		Types: apitypes.Types{
			"EIP712Domain": EIP712Domain,
			"Order":        Order,
		},
		PrimaryType: "Order",
		Domain: apitypes.TypedDataDomain{
			Name:              name,
			Version:           version,
			ChainId:           (*math.HexOrDecimal256)(chainIDHex.ToBig()),
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

	chainIDHex := (*uint256.Int)(chainID)

	return apitypes.TypedDataDomain{
		Name:              LimitOrderV4TypeDataName,
		Version:           LimitOrderV4TypeDataVersion,
		ChainId:           (*math.HexOrDecimal256)(chainIDHex.ToBig()),
		VerifyingContract: contract.Hex(),
	}, nil
}

// GetOrderHashForLimitOrder is a convenience function that builds typed data and computes hash for a limit order
// This is the main function you'll want to call with your order type & chainID
func GetOrderHashForLimitOrder(chainID common.ChainID, order common.LimitOrder) (ethcommon.Hash, error) {
	if (*uint256.Int)(chainID).Eq(common.Sui) {
		bcsEncodedOrder := bytes.Buffer{}
		bcsEncoder := mystenbcs.NewEncoder(&bcsEncodedOrder)

		// salt big.Int from string
		saltBigInt, ok := new(big.Int).SetString(order.Salt, 10)
		if !ok {
			return ethcommon.Hash{}, fmt.Errorf("invalid salt value: %v", order.Salt)
		}
		fmt.Println("Salt value:", saltBigInt.Bytes())

		// hex to bytes for Maker address
		makerBytes := ethcommon.Hex2Bytes(strings.TrimPrefix(order.Maker, "0x"))
		fmt.Println("Maker address bytes:", makerBytes, len(makerBytes), order.Maker)

		receiverBytes := ethcommon.HexToAddress(order.Receiver)
		fmt.Println("Receiver address bytes:", receiverBytes.Bytes(), len(receiverBytes.Bytes()))

		// Convert MakingAmount string to uint64
		makingAmountBigInt, ok := new(big.Int).SetString(order.MakingAmount, 10)
		if !ok {
			return ethcommon.Hash{}, fmt.Errorf("invalid makingAmount value: %s", order.MakingAmount)
		}
		makingAmountUint64 := makingAmountBigInt.Uint64()
		fmt.Println("Making amount:", makingAmountUint64)

		// Convert TakingAmount string to uint64
		takingAmountBigInt, ok := new(big.Int).SetString(order.TakingAmount, 10)
		if !ok {
			return ethcommon.Hash{}, fmt.Errorf("invalid takingAmount value: %s", order.TakingAmount)
		}
		takingAmountUint64 := takingAmountBigInt.Uint64()
		fmt.Println("Taking amount:", takingAmountUint64)

		if err := bcsEncoder.Encode(OrderHashType{
			Salt:         saltBigInt.Bytes(),
			Maker:        makerBytes,
			Receiver:     receiverBytes.Bytes(),
			MakingAmount: makingAmountUint64,
			TakingAmount: takingAmountUint64,
		}); err != nil {
			return ethcommon.Hash{}, fmt.Errorf("failed to encode order: %w", err)
		}

		fmt.Println("Encoded order bytes:", bcsEncodedOrder.Bytes())

		return crypto.Keccak256Hash(bcsEncodedOrder.Bytes()), nil
	}

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

func HexToBytes32Strict(s string) ([32]byte, error) {
	var out [32]byte
	s = strings.TrimPrefix(s, "0x")
	if len(s)%2 != 0 {
		return out, fmt.Errorf("hex must have even length")
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return out, err
	}
	if len(b) != 32 {
		return out, fmt.Errorf("expected 32 bytes, got %d", len(b))
	}
	copy(out[:], b) // copy into fixed array
	return out, nil
}
