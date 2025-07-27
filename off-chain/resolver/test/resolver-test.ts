import { Resolver } from '../src/core/Resolver';
import { MockRelayerServer } from './relayer-mock/mock-relayer';
import { ConfigManager } from '../src/config/ConfigManager';

export class ResolverTestRunner {
    private resolver: Resolver;
    private mockRelayer: MockRelayerServer;

    constructor() {

        this.mockRelayer = new MockRelayerServer(8080);
        console.log('[test] mock relayer initialized');
        process.env.WEBSOCKET_URL = 'ws://localhost:8080';
        this.resolver = new Resolver();
        console.log('[test] resolver initialized');
    }

    public async start() {
        console.log('\n testing...');
        
        try {
            // Start the resolver (connects to WebSocket)
            await this.resolver.start();
            console.log('[TestRunner] Resolver started successfully');
            
            // Wait for WebSocket connection to establish
            await this.sleep(2000);
            
            // The mock relayer automatically sends test messages
            console.log('[TestRunner] Waiting for test messages...');
            
            // Keep test running for 10 seconds to see message handling
            await this.sleep(10000);
            
            console.log('[TestRunner] Test completed');
            
        } catch (error) {
            console.error('[TestRunner] Error during test:', error);
        } finally {
            await this.cleanup();
        }
    }

    private async cleanup() {
        console.log('[TestRunner] Cleaning up...');
        
        try {
            await this.resolver.stop();
            this.mockRelayer.close();
        } catch (error) {
            console.error('[TestRunner] Error during cleanup:', error);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the test if executed directly
if (require.main === module) {
    const testRunner = new ResolverTestRunner();
    
    testRunner.start()
        .then(() => {
            console.log('[TestRunner] Test run completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('[TestRunner] Test run failed:', error);
            process.exit(1);
        });
}
