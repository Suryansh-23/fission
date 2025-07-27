import { WebSocketServer, WebSocket } from 'ws';
import { RelayerRequestParams } from "../../../../cross-chain-sdk/src/api/relayer/types";


export class MockRelayerServer {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();
    private port: number;

    constructor(port: number = 8080) {
        this.port = port;
        this.wss = new WebSocketServer({ port: this.port });
        this.setupServer();
    }

    private setupServer() {
        this.wss.on('connection', (ws: WebSocket) => {
            console.log(`[MockRelayer] New client connected`);
            this.clients.add(ws);

            ws.on('close', () => {
                console.log(`[MockRelayer] Client disconnected`);
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error(`[MockRelayer] WebSocket error:`, error);
                this.clients.delete(ws);
            });

            // Send initial test messages after connection
            setTimeout(() => {
                this.sendTestBroadcast(ws);
                setTimeout(() => {
                    this.sendTestSecret(ws);
                }, 2000);
            }, 1000);
        });
    }

    private sendTestBroadcast(ws: WebSocket) {
        const mockParams: RelayerRequestParams = {
            srcChainId: 137,
            order: {
                salt: "9445680539062707577101788567473077321018098965545264085818030520662873087459",
                maker: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
                receiver: "0x0000000000000000000000000000000000000000",
                makerAsset: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
                takerAsset: "0xda0000d4000015a526378bb6fafc650cea5966f8",
                makingAmount: "10000000",
                takingAmount: "9948907786114518",
                makerTraits: "62419173104490761595518734107569287444564197129067859129427930236703456886784"
            },
            signature: "0x7e72788f578ca5464b62f0405dfa4361dc3447c3a8136def58ca0489650cf2462b56e18c3ebf545ad6b1cc0b520cf84e0f200b6fa11ba34c78aa103a8030cb4e1c",
            quoteId: "ddcae159-e73d-4f22-9234-4085e1b7f7dc",
            extension: "0x0000011b0000004a0000004a0000004a0000004a000000250000000000000000a7bcb4eac8964306f9e3764f67db6a7af6ddf99a000000000000006884f49c0000b40ac27fa7bcb4eac8964306f9e3764f67db6a7af6ddf99a000000000000006884f49c0000b40ac27fa7bcb4eac8964306f9e3764f67db6a7af6ddf99a6884f48b2078c33fd9d03fc36b23000072f8a0c8c415454f629c0000101d89b656b7a810a03ebe0ac0b527e94559e691f87d561e71a12c26e34fe07fa0000000000000000000000000000000000000000000000000000000000000003800000000000000000000000000000000000000000000000000000000000000000000000000000000007e15f78c9e427000000000000000000003baf82d03a0000000000000000228000001b00000000c000003780000030000000264000000b4"
        };

        const broadcastMessage = `BROADC ${JSON.stringify(mockParams)}`;
        console.log(`[MockRelayer] Sending broadcast:`, broadcastMessage);
        
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(broadcastMessage);
        }
    }

    private sendTestSecret(ws: WebSocket) {
        // Mock secret reveal - 32 bytes hex string
        const secret = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const orderHash = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef';
        const secretMessage = `SECRET ${orderHash} ${secret}`;
        console.log(`[MockRelayer] Sending secret:`, secretMessage);
        
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(secretMessage);
        }
    }

    public broadcastToAll(message: string) {
        console.log(`[MockRelayer] Broadcasting to ${this.clients.size} clients:`, message);
        
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    public sendBroadcastToAll(params: RelayerRequestParams) {
        const message = `BROADC ${JSON.stringify(params)}`;
        this.broadcastToAll(message);
    }

    public sendSecretToAll(secret: string) {
        const message = `SECRET ${secret}`;
        this.broadcastToAll(message);
    }

    public close() {
        console.log(`[MockRelayer] Shutting down server`);
        this.wss.close();
    }

    public getClientCount(): number {
        return this.clients.size;
    }
}

// For direct execution
if (require.main === module) {
    const mockServer = new MockRelayerServer(8080);
    
    // Keep server running
    process.on('SIGINT', () => {
        console.log('\n[MockRelayer] Received SIGINT, shutting down gracefully');
        mockServer.close();
        process.exit(0);
    });
    
    console.log('[MockRelayer] Press Ctrl+C to stop the server');
}
