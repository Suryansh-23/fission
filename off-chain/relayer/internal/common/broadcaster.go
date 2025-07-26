package common

import "sync"

type Broadcaster struct {
	mu        *sync.Mutex
	id        int64
	receivers map[int64]chan []byte
}

func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		mu:        &sync.Mutex{},
		id:        0,
		receivers: make(map[int64]chan []byte),
	}
}

func (b *Broadcaster) RegisterReceiver(receiver chan []byte) int64 {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.receivers[b.id] = receiver
	b.id++

	return b.id - 1
}

func (b *Broadcaster) UnregisterReceiver(id int64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, exists := b.receivers[id]; exists {
		close(b.receivers[id])
		delete(b.receivers, id)
	}
}

func (b *Broadcaster) Broadcast(message []byte) {
	go func() {
		b.mu.Lock()
		defer b.mu.Unlock()

		for _, receiver := range b.receivers {
			select {
			case receiver <- message:
			default:
				// If the channel is full, we skip sending the message
				// to avoid blocking the broadcaster.
			}
		}
	}()
}
