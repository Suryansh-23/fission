import { Resolver } from './core/Resolver';

async function main() {
    console.log('Starting 1inch Fusion+ Sui Resolver...');
    
    const resolver = new Resolver();
    
    await resolver.start();
    console.log('Resolver started successfully');
    
    process.on('SIGINT', async () => {
        console.log('Shutting down resolver...');
        await resolver.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('Shutting down resolver...');
        await resolver.stop();
        process.exit(0);
    });
}

main().catch(error => {
    console.error('Failed to start resolver:', error);
    process.exit(1);
});