package manager

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/block-vision/sui-go-sdk/sui"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/google/uuid"
	"github.com/imkira/go-ttlmap"
)

type Manager struct {
	quotes      *ttlmap.Map
	orders      *ttlmap.Map
	broadcaster *Broadcaster
	evmClient   *ethclient.Client
	suiClient   *sui.Client
	logger      *log.Logger
}

func NewManager(logger *log.Logger) *Manager {
	options := &ttlmap.Options{
		InitialCapacity: 32,
		OnWillExpire: func(key string, item ttlmap.Item) {
			fmt.Printf("expired: [%s=%v]\n", key, item.Value())
		},
		OnWillEvict: func(key string, item ttlmap.Item) {
			fmt.Printf("evicted: [%s=%v]\n", key, item.Value())
		},
	}

	// init the ttlmap for quotes and orders
	quotes := ttlmap.New(options)
	orders := ttlmap.New(options)

	// Initialize the broadcaster for comms
	broadcaster := NewBroadcaster()

	// init the clients
	evmRPC := os.Getenv("EVM_RPC_URL")
	if evmRPC == "" {
		logger.Fatal("EVM_RPC_URL environment variable is not set")
	}
	evmClient, err := ethclient.Dial(evmRPC)
	if err != nil {
		logger.Fatalf("failed to connect to EVM RPC: %v", err)
	}

	suiRPC := os.Getenv("SUI_RPC_URL")
	if suiRPC == "" {
		logger.Fatal("SUI_RPC_URL environment variable is not set")
	}
	suiClient := (sui.NewSuiClient(suiRPC)).(*sui.Client)

	return &Manager{
		quotes:      quotes,
		orders:      orders,
		broadcaster: broadcaster,
		evmClient:   evmClient,
		suiClient:   suiClient,
		logger:      logger,
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

	m.evmClient.Close()
}
