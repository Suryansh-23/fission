import WebSocket from 'ws';
import { RelayerRequest, RelayerRequestParams } from "../../../cross-chain-sdk/src"
import OrderManager from '../core/OrderManager';

// Temporary empty interfaces - will be moved to types folder
export interface SecretData {}
export interface CancelData {}
export interface OrderData {}

export interface WSMessage {
    type: 'broadcast_order' | 'secret_reveal' | 'cancel_order';
    data: OrderData | SecretData | CancelData;
    timestamp: number;
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

            this.ws.on('open', this.handleOpen.bind(this));
            this.ws.on('message', this.handleMessage.bind(this));
            this.ws.on('close', this.handleClose.bind(this));
            this.ws.on('error', this.handleError.bind(this));

        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            // TODO: Add proper error handling
        }
    }

    public disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.isConnected = false;
        console.log('Disconnected from relayer');
    }

    public isReady(): boolean {
        return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
    }

    private handleOpen(): void {
        console.log('Connected to relayer WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        this.sendMessage({
            type: 'register',
            resolverId: this.resolverId,
            timestamp: Date.now()
        });
        
        // TODO: Notify OrderManager of connection
        console.log('WebSocket connected successfully');
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const message = JSON.parse(data.toString()) as WSMessage;
            console.log(`Received message type: ${message.type}`);
            
            if (!this.orderManager) {
                console.warn('No order manager set, ignoring message');
                return;
            }

            switch (message.type) {
                case 'broadcast_order':
                    this.orderManager.registerOrder(message.data as RelayerRequestParams);
                    break;
                
                case 'secret_reveal':
                    this.orderManager.handleSecretReveal(message.data);
                    break;
                
                case 'cancel_order':
                    this.orderManager.cancelOrder(message.data as any)
                        .then(() => {
                            console.log('Order cancellation completed successfully');
                        })
                        .catch((error) => {
                            console.error('Order cancellation failed:', error);
                        });
                    break;
                
                default:
                    console.warn(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
            // TODO: Notify OrderManager of error
        }
    }

    private handleClose(code: number, reason: string): void {
        console.log(`WebSocket closed with code ${code}: ${reason}`);
        this.isConnected = false;

        // TODO: Notify OrderManager of disconnection
        console.log('WebSocket disconnected');

        if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
        }
    }

    private handleError(error: Error): void {
        console.error('WebSocket error:', error);
        // TODO: Notify OrderManager of error
    }

    private sendMessage(message: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, cannot send message');
        }
    }

    private attemptReconnect(): void {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        
        console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            this.connect();
        }, delay);
    }
}

export default ResolverWebSocketClient;
