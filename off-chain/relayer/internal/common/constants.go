package common

// ChainID represents supported network chain IDs as an enum type
type ChainID int64

const (
	EthereumMainnet ChainID = 1
	ArbitrumOne     ChainID = 42161
	Polygon         ChainID = 137
	BSC             ChainID = 56
	Optimism        ChainID = 10
	Base            ChainID = 8453
)
