import WebSocket from "ws";
import { RelayerRequestParams } from "@1inch/cross-chain-sdk";
import OrderManager from "../core/OrderManager";

// Message types from relayer
export type MessageType = "BROADC" | "SECRET";

export interface SecretData {
  orderHash: string;
  secret: string;
}

export class ResolverWebSocketClient {
  private ws: WebSocket | null = null;
  private relayerUrl: string;
  private resolverId: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000;
  private isConnected: boolean = false;
  private orderManager: OrderManager | null = null;

  constructor(relayerUrl: string, resolverId: string) {
    this.relayerUrl = relayerUrl;
    this.resolverId = resolverId;
  }

  public setOrderManager(orderManager: OrderManager): void {
    this.orderManager = orderManager;
  }

  public connect(): void {
    try {
      console.log(`Attempting to connect to relayer at ${this.relayerUrl}`);
      this.ws = new WebSocket(this.relayerUrl);

      this.ws.on("open", this.handleOpen.bind(this));
      this.ws.on("message", this.handleMessage.bind(this));
      this.ws.on("close", this.handleClose.bind(this));
      this.ws.on("error", this.handleError.bind(this));
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      // TODO: Add proper error handling
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    console.log("Disconnected from relayer");
  }

  public isReady(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send message to relayer
   * @param message - Message to send to the relayer
   */
  public sendToRelayer(message: any): void {
    if (!this.isReady()) {
      console.warn("WebSocket not connected, cannot send message to relayer");
      return;
    }

    try {
      const messageString =
        typeof message === "string" ? message : JSON.stringify(message);
      this.ws!.send(messageString);
    } catch (error) {
      console.error("Failed to send message to relayer:", error);
    }
  }

  private handleOpen(): void {
    console.log("Connected to relayer WebSocket");
    this.isConnected = true;
    this.reconnectAttempts = 0;

    this.sendMessage({
      type: "register",
      resolverId: this.resolverId,
      timestamp: Date.now(),
    });

    // TODO: Notify OrderManager of connection
    console.log("WebSocket connected successfully");
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const rawMessage = data.toString();
      console.log(
        `[ResolverWebSocketClient] Received raw message: ${rawMessage.substring(
          0,
          100
        )}...`
      );

      if (!this.orderManager) {
        console.warn("No order manager set, ignoring message");
        return;
      }

      // Parse message format: "BROADC <JSON>" or "SECRET <data>"
      if (rawMessage.startsWith("BROADC ")) {
        // Extract JSON part after "BROADC "
        const jsonPart = rawMessage.substring(7); // Remove "BROADC " prefix

        try {
          const orderData = JSON.parse(jsonPart) as RelayerRequestParams;

          console.log(
            `Processing broadcast order for chain ${orderData.srcChainId}`
          );
          console.log(`Order maker: ${orderData.order.maker}`);
          console.log(`Quote ID: ${orderData.quoteId}`);

          this.orderManager.registerOrder(orderData);

          // TODO: Later integrate with executeOrder function
          console.log("Order registered successfully");
        } catch (parseError) {
          console.error("Failed to parse broadcast JSON:", parseError);
          console.error("JSON part:", jsonPart.substring(0, 200) + "...");
        }
      } else if (rawMessage.startsWith("SECRET ")) {
        // Extract secret data after "SECRET "
        const secretPart = rawMessage.substring(7); // Remove "SECRET " prefix
        const parts = secretPart.split(" ");

        if (parts.length >= 2) {
          const [orderHash, secret] = parts;

          console.log(
            `Processing secret reveal for order: ${orderHash.substring(
              0,
              10
            )}...`
          );
          this.orderManager.handleSecretReveal({ orderHash, secret });

          // TODO: Later integrate with withdraw function
          console.log("Secret processed successfully");
        } else {
          console.error(
            'Invalid secret message format. Expected: "SECRET <orderHash> <secret>"'
          );
          console.error("Received:", secretPart);
        }
      } else {
        console.warn(`Unknown message format: ${rawMessage.substring(0, 50)}`);
        console.warn(
          'Expected format: "BROADC <JSON>" or "SECRET <orderHash> <secret>"'
        );
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
      console.error("Raw message:", data.toString());
    }
  }

  private handleClose(code: number, reason: string): void {
    console.log(`WebSocket closed with code ${code}: ${reason}`);
    this.isConnected = false;

    // TODO: Notify OrderManager of disconnection
    console.log("WebSocket disconnected");

    if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect();
    }
  }

  private handleError(error: Error): void {
    console.error("WebSocket error:", error);
    // TODO: Notify OrderManager of error
  }

  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected, cannot send message");
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(
      `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }
}

export default ResolverWebSocketClient;
