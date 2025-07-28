package manager

import (
	"relayer/internal/common"

	ethcommon "github.com/ethereum/go-ethereum/common"
	"github.com/google/uuid"
)

const (
	// Relayer -> Resolver

	// Order broadcast event: BROADC <ACTUAL_JSON_OF_ORDER>
	ORDER_EVENT = "BROADC"
	// broadcast orderhash and secret: SECRET <ORDER_HASH_HEX> <SECRET_HEX>
	SECRET_EVENT = "SECRET"

	// Resolver -> Relayer
	// Transaction hash event: TXHASH <ORDER_HASH_HEX> <SRC_TX_HASH> <DST_TX_HASH>
	TXHASH_EVENT = "TXHASH"
)

type QuoteEntry struct {
	QuoteID      uuid.UUID
	QuoteRequest *common.QuoteRequestParams
	Quote        *common.Quote
}

type OrderEntry struct {
	OrderHash   ethcommon.Hash
	Order       *common.Order
	OrderStatus *common.OrderStatus
}
