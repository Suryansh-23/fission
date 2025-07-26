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
	baseURL string
	authKey string
}

func NewAPIServer() *http.Server {
	port, _ := strconv.Atoi(os.Getenv("API_PORT"))
	baseURL := os.Getenv("1INCH_URL")
	authKey := os.Getenv("1INCH_API_KEY")

	NewAPIServer := &APIServer{
		port: port,
		baseURL: baseURL,
		authKey: authKey,
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
