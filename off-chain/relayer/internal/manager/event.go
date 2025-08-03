package manager

import (
	"encoding/json"
	"fmt"
	"math"
	"time"

	"relayer/internal/common"

	"strings"
)

func (m *Manager) HandleOrderEvent(order common.Order) error {
	op := []byte(ORDER_EVENT + " ")
	orderBytes, err := json.Marshal(order)
	if err != nil {
		return err
	}

	orderBytes = append(op, orderBytes...)
	m.Broadcast(orderBytes)
	return nil
}

func (m *Manager) HandleSecretEvent(secret common.Secret) error {
	op := []byte(SECRET_EVENT + " ")
	secretBytes := []byte(secret.OrderHash + " " + secret.Secret)
	secretBytes = append(op, secretBytes...)

	m.Broadcast(secretBytes)
	return nil
}

func (m *Manager) HandleReceiveEvent(event []byte) error {
	msg := string(event)
	m.logger.Printf("Received event: %s", msg)

	parts := strings.Split(msg, " ")
	switch parts[0] {
	case TXHASH_EVENT:
		m.logger.Printf("Received tx hash event: %s", msg)
		m.handleTxHashEvent(parts[1:])
	default:
		return fmt.Errorf("unknown event type: %s", parts[0])
	}

	return nil
}

func (m *Manager) handleTxHashEvent(parts []string) {
	if len(parts) != 3 {
		m.logger.Printf("invalid tx hash event format, expected 3 parts, got %d", len(parts))
		return
	}

	orderHash := parts[0]
	m.allowSecretRelease(orderHash, 0, "", "")
}

func computeTTL(_ time.Time, dstTimestamp time.Time, _ *common.Quote) time.Duration {
	dstDuration := time.Since(dstTimestamp)

	return time.Duration(math.Max(2-dstDuration.Seconds(), 0) * float64(time.Second))
}

func (m *Manager) allowSecretRelease(orderHash string, hashIdx int, srcTxHash string, dstTxHash string) {
	orderEntry, err := m.GetOrder(orderHash)
	if err != nil {
		m.logger.Printf("Error getting order for hash %s: %v", orderHash, err)
		return
	}

	orderEntry.OrderMutMutex.Lock()
	defer orderEntry.OrderMutMutex.Unlock()

	orderEntry.OrderFills.Fills = append(orderEntry.OrderFills.Fills, common.ReadyToAcceptSecretFill{
		Idx:                   hashIdx,
		SrcEscrowDeployTxHash: srcTxHash,
		DstEscrowDeployTxHash: dstTxHash,
	})

	fmt.Println("Allowing secret release for order:", orderHash, "hash index:", hashIdx, "src tx hash:", srcTxHash, "dst tx hash:", dstTxHash)
}
