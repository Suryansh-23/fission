package api

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"

	_ "github.com/joho/godotenv/autoload"
)

type APIServer struct {
	port int
}

func NewAPIServer() *http.Server {
	port, _ := strconv.Atoi(os.Getenv("PORT"))
	NewAPIServer := &APIServer{
		port: port,
	}

	// Declare Server config
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", NewAPIServer.port),
		Handler:      NewAPIServer.RegisterRoutes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return server
}
