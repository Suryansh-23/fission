package ws

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"relayer/internal/common"
	"strconv"
	"time"

	_ "github.com/joho/godotenv/autoload"
)

type WSServer struct {
	port        int
	broadcaster *common.Broadcaster
	logger      *log.Logger
}

func NewWSServer(broadcaster *common.Broadcaster, logger *log.Logger) *http.Server {
	port, _ := strconv.Atoi(os.Getenv("WS_PORT"))
	NewWSServer := &WSServer{
		port:        port,
		broadcaster: broadcaster,
		logger:      logger,
	}

	// Declare Server config
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", NewWSServer.port),
		Handler:      NewWSServer.Serve(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return server
}
