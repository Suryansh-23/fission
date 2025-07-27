package manager

import (
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/imkira/go-ttlmap"
)

type Manager struct {
	quotes      *ttlmap.Map
	orders      *ttlmap.Map
	broadcaster *Broadcaster
	logger      *log.Logger
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

	broadcaster := NewBroadcaster()

	return &Manager{
		quotes:      quotes,
		orders:      orders,
		broadcaster: broadcaster,
	}
}

func (m *Manager) SetQuote(quote QuoteEntry) error {
	return m.quotes.Set(quote.QuoteID.String(), ttlmap.NewItem(quote, ttlmap.WithTTL(QuoteTTL)), nil)
}

func (m *Manager) GetQuote(quoteID uuid.UUID) (QuoteEntry, error) {
	item, err := m.quotes.Get(quoteID.String())
	if err != nil {
		return QuoteEntry{}, fmt.Errorf("quote not found: %s", quoteID)
	}

	quote := (item.Value()).(QuoteEntry)
	if quote.QuoteID == uuid.Nil || quote.Quote == nil {
		return QuoteEntry{}, fmt.Errorf("invalid quote type for ID: %s", quoteID)
	}

	return quote, nil
}

func (m *Manager) SetOrder(orderEntry OrderEntry) error {
	quote, err := m.GetQuote(orderEntry.Order.QuoteID)
	if err != nil {
		return fmt.Errorf("failed to get quote for order: %w", err)
	}

	return m.orders.Set(orderEntry.OrderHash.String(), ttlmap.NewItem(orderEntry, ttlmap.WithTTL(time.Second*time.Duration(quote.Quote.TimeLocks.SrcPublicCancellation))), nil)
}

func (m *Manager) GetOrder(orderHash string) (OrderEntry, error) {
	item, err := m.orders.Get(orderHash)
	if err != nil {
		return OrderEntry{}, fmt.Errorf("order not found: %s", orderHash)
	}

	orderEntry := (item.Value()).(OrderEntry)
	if orderEntry.OrderHash.String() == "" {
		return OrderEntry{}, fmt.Errorf("invalid order type for hash: %s", orderHash)
	}

	return orderEntry, nil
}

func (m *Manager) RegisterReceiver(receiver chan []byte) uint64 {
	return m.broadcaster.RegisterReceiver(receiver)
}

func (m *Manager) UnregisterReceiver(id uint64) {
	m.broadcaster.UnregisterReceiver(id)
}

func (m *Manager) Broadcast(msg []byte) error {
	if len(msg) == 0 {
		return fmt.Errorf("message cannot be nil or empty")
	}

	m.broadcaster.Broadcast(msg)
	return nil
}

func (m *Manager) Close() {
	m.quotes.Drain()
	m.orders.Drain()
	m.broadcaster.Close()
	m.logger.Println("Manager closed, all resources drained/draining.")

	<-m.quotes.Draining()
	<-m.orders.Draining()
	m.logger.Println("All quotes and orders have been drained successfully.")
}
