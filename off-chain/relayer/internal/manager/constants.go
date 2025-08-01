package manager

import (
	"time"
)

// QuoteTTL defines the time-to-live for quotes in the manager
const (
	QuoteTTL        = time.Minute * 15
	SecretTTLBuffer = time.Second * 2
)

// // chainID -> finality lock mapping
// var FinalityLocks = map[common.ChainID]time.Duration{
// 	common.EthereumMainnet: time.Minute * 12, // roughly 2 epochs
// 	common.ArbitrumOne:     time.Minute * 12, // equal to L1 finality since its an L2
// 	common.Base:            time.Minute * 12, // equal to L1 finality since its an L2
// 	common.Optimism:        time.Minute * 12, // equal to L1 finality since its an L2
// 	common.Polygon:         time.Second * 5,  // finality gadget update on polygon
// 	common.BSC:             time.Second * 8,
// 	common.Sui:             time.Second * 2, // txn finality under normal conditions
// }

// func GetFinalityLock(chainID common.ChainID) time.Duration {
// 	lock, exists := FinalityLocks[chainID]
// 	if !exists {
// 		return time.Minute * 12 // Default fallback lock
// 	}
// 	return lock
// }
