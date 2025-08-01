package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"relayer/internal/api"
	"relayer/internal/manager"
	"relayer/internal/ws"
	"syscall"
	"time"
)

func initServer(server *http.Server, done chan bool, logger *log.Logger) {
	// Start the server in a separate goroutine
	err := server.ListenAndServe()
	if err != nil && err != http.ErrServerClosed {
		panic(fmt.Sprintf("server error: %s", err))
	}

	// Create context that listens for the interrupt signal from the OS.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Listen for the interrupt signal.
	<-ctx.Done()

	logger.Println("shutting down gracefully, press Ctrl+C again to force")
	stop() // Allow Ctrl+C to force shutdown

	// The context is used to inform the server it has 5 seconds to finish
	// the request it is currently handling
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Printf("Server forced to shutdown with error: %v", err)
	}

	logger.Println("Server exiting")

	// Notify the main goroutine that the shutdown is complete
	done <- true
}

func main() {
	// Initialize logger
	logger := log.New(os.Stdout, "relayer: ", log.LstdFlags)

	// Initialize the manager
	manager := manager.NewManager(logger)

	// create the servers
	apiServer := api.NewAPIServer(manager, logger)
	wsServer := ws.NewWSServer(manager, logger)

	// Create apiDone channels to signal when the shutdown is complete
	apiDone := make(chan bool, 1)
	wsDone := make(chan bool, 1)

	// Run graceful shutdown in a separate goroutine
	go initServer(apiServer, apiDone, logger)
	go initServer(wsServer, wsDone, logger)

	// test
	// chain.FetchMoveDstEscrowEvent(context.Background(), manager.SuiClient, "AyUtNpDt9jCRvu4TZVhu54ZYxi2uAvmfKsX2T6XWtp46")
	// timestamp, err := chain.FetchMoveTimeByTx(context.Background(), manager.SuiClient, "AyUtNpDt9jCRvu4TZVhu54ZYxi2uAvmfKsX2T6XWtp46")
	// if err != nil {
	// 	logger.Printf("failed to fetch move time: %v", err)
	// }

	// logger.Printf("Move time: %s", timestamp)

	// Wait for the graceful shutdown to complete
	select {
	case <-apiDone:
		logger.Println("API server shutdown complete.")
	case <-wsDone:
		logger.Println("WebSocket server shutdown complete.")
	}

	logger.Println("Servers down, now closing the manager...")
	manager.Close()

	logger.Println("Manager closed.")
	logger.Println("Graceful shutdown complete.")
}
