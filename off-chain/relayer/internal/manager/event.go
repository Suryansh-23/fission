package manager

import (
	"encoding/json"
	"fmt"
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

	parts := strings.Split(msg, " ")
	switch parts[0] {
	case TXHASH_EVENT:
		return m.handleTxHashEvent(parts)
	default:
		return fmt.Errorf("unknown event type: %s", parts[0])
	}
}

func (m *Manager) handleTxHashEvent(parts []string) error {
	return nil
}
