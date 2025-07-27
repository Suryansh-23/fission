package common

import (
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
)
