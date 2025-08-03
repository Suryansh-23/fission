// Test environment configuration
console.log('Environment variables:');
console.log('VITE_SUI_RPC_URL:', import.meta.env.VITE_SUI_RPC_URL);
console.log('VITE_SUI_PACKAGE_ID:', import.meta.env.VITE_SUI_PACKAGE_ID);
console.log('VITE_FUSION_API_URL:', import.meta.env.VITE_FUSION_API_URL);
console.log('VITE_FUSION_AUTH_KEY:', import.meta.env.VITE_FUSION_AUTH_KEY ? '[SET]' : '[NOT SET]');

// Test Sui client service
import suiClientService from '../services/sui-client';

async function testSuiClient() {
  try {
    console.log('Testing Sui client...');
    const packageId = suiClientService.getPackageId();
    console.log('Package ID:', packageId);
    
    const health = await suiClientService.isHealthy();
    console.log('Sui client health:', health);
  } catch (error) {
    console.error('Sui client test failed:', error);
  }
}

testSuiClient();

export {}; // Make this a module
