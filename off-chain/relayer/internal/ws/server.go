package ws

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	_ "github.com/joho/godotenv/autoload"
)

type WSServer struct {
	port int
}

func NewWSServer() *http.Server {
	port, _ := strconv.Atoi(os.Getenv("PORT"))
	NewWSServer := &WSServer{
		port: port,
	}

	// Declare Server config
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", NewWSServer.port),
		Handler:      NewWSServer.RegisterRoutes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return server
}
