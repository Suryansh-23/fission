package manager

import (
	"fmt"
	"relayer/internal/common"
	"time"

	"github.com/imkira/go-ttlmap"
)

type Manager struct {
	quotes *ttlmap.Map
	orders *ttlmap.Map
}

func NewManager() *Manager {
	options := &ttlmap.Options{
		InitialCapacity: 32,
		OnWillExpire: func(key string, item ttlmap.Item) {
			fmt.Printf("expired: [%s=%v]\n", key, item.Value())
		},
		OnWillEvict: func(key string, item ttlmap.Item) {
			fmt.Printf("evicted: [%s=%v]\n", key, item.Value())
		},
	}

	quotes := ttlmap.New(options)
	orders := ttlmap.New(options)

	return &Manager{
		quotes: quotes,
		orders: orders,
	}
}

func (m *Manager) SetQuote(quote *common.Quote) error {
	return m.quotes.Set(quote.QuoteID, ttlmap.NewItem(quote, ttlmap.WithTTL(QuoteTTL)), nil)
}

func (m *Manager) GetQuote(quoteID string) (*common.Quote, error) {
	item, err := m.quotes.Get(quoteID)
	if err != nil {
		return nil, fmt.Errorf("quote not found: %s", quoteID)
	}

	quote := (item.Value()).(*common.Quote)
	if quote == nil {
		return nil, fmt.Errorf("invalid quote type for ID: %s", quoteID)
	}

	return quote, nil
}

func (m *Manager) SetOrder(orderEntry OrderEntry) error {
	quote, err := m.GetQuote(orderEntry.Order.QuoteID)
	if err != nil {
		return fmt.Errorf("failed to get quote for order: %w", err)
	}

	return m.orders.Set(orderEntry.OrderHash, ttlmap.NewItem(orderEntry, ttlmap.WithTTL(time.Second*time.Duration(quote.TimeLocks.SrcPublicCancellation))), nil)
}

func (m *Manager) GetOrder(orderHash string) (*OrderEntry, error) {
	item, err := m.orders.Get(orderHash)
	if err != nil {
		return nil, fmt.Errorf("order not found: %s", orderHash)
	}

	orderEntry := (item.Value()).(*OrderEntry)
	if orderEntry == nil {
		return nil, fmt.Errorf("invalid order type for hash: %s", orderHash)
	}

	return orderEntry, nil
}
