package manager

import "relayer/internal/common"

type OrderEntry struct {
	OrderHash   string
	OrderStatus common.OrderStatus
	Order       *common.Order
}
