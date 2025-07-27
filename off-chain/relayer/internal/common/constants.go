package common

import (
	"math/big"

	"github.com/holiman/uint256"
)

// ChainID represents supported network chain IDs as an enum type
type ChainID *uint256.Int

var (
	EthereumMainnet ChainID = uint256.NewInt(1)
	ArbitrumOne     ChainID = uint256.NewInt(42161)
	Polygon         ChainID = uint256.NewInt(137)
	BSC             ChainID = uint256.NewInt(56)
	Optimism        ChainID = uint256.NewInt(10)
	Base            ChainID = uint256.NewInt(8453)
	Sui             ChainID = uint256.NewInt(101)
)

func GetChainID(num big.Int) ChainID {
	val, overflow := uint256.FromBig(&num)
	if overflow {
		return nil
	}

	// Check if the chain ID is supported
	switch {
	case val.Eq(EthereumMainnet):
		return EthereumMainnet
	case val.Eq(ArbitrumOne):
		return ArbitrumOne
	case val.Eq(Polygon):
		return Polygon
	case val.Eq(BSC):
		return BSC
	case val.Eq(Optimism):
		return Optimism
	case val.Eq(Base):
		return Base
	case val.Eq(Sui):
		return Sui
	default:
		return nil
	}
}
