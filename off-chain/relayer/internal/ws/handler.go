package ws

import (
	"net/http"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/net/context"
)

func (ws *WSServer) Serve() http.Handler {
	ws.logger.Println("WebSocket server listening on port", ws.port)
	mux := http.NewServeMux()

	// main and only route for the WebSocket server
	mux.HandleFunc("/", ws.MainHandler)
	ws.logger.Println("WebSocket server routes registered.")

	// Wrap the mux with CORS middleware
	return ws.corsMiddleware(mux)
}

func (ws *WSServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*") // Replace "*" with specific origins if needed
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-CSRF-Token")
		w.Header().Set("Access-Control-Allow-Credentials", "false") // Set to "true" if credentials are required

		// Handle preflight OPTIONS requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Proceed with the next handler
		next.ServeHTTP(w, r)
	})
}

func (ws *WSServer) MainHandler(w http.ResponseWriter, r *http.Request) {
	ws.logger.Println("WebSocket connection request received from", r.RemoteAddr)

	// Upgrade the HTTP connection to a WebSocket connection
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{})
	if err != nil {
		http.Error(w, "WebSocket connection failed", http.StatusInternalServerError)
		return
	}
	defer c.CloseNow()

	msgChan := make(chan []byte)
	id := ws.manager.RegisterReceiver(msgChan)
	defer ws.manager.UnregisterReceiver(id)

	for {
		select {
		case m := <-msgChan:
			ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond*10)
			defer cancel()

			if err := c.Write(ctx, websocket.MessageText, m); err != nil {
				ws.logger.Printf("Failed to write message: %v", err)
				return
			}
		case <-r.Context().Done():
			// Client disconnected
			return
		}
	}
}
