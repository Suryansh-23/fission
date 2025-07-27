package manager

import (
	"relayer/internal/common"
	"time"
)

const QuoteTTL = time.Minute * 15

// chainID -> finality lock mapping
var FinalityLocks = map[common.ChainID]time.Duration{
	common.EthereumMainnet: time.Minute * 12,
	common.ArbitrumOne:     time.Minute * 12,
	common.Base:            time.Minute * 12,
	common.Optimism:        time.Minute * 12,
	common.Polygon:         time.Second * 5,
	common.BSC:             time.Second * 8,
}

func GetFinalityLock(chainID common.ChainID) time.Duration {
	lock, exists := FinalityLocks[chainID]
	if !exists {
		return time.Minute * 12 // Default fallback lock
	}
	return lock
}
