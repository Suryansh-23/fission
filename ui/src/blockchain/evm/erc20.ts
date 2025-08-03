import { formatUnits } from 'viem';
import ERC20_ABI from './erc20ABI.json';

export interface ApprovalParams {
  tokenAddress: string;
  ownerAddress: string;
  spenderAddress: string;
  amount: bigint;
  decimals: number;
}

export interface ApprovalResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export class ERC20Service {
  private static getLopAddress(): string {
    const lopAddress = import.meta.env.VITE_LOP_ADDRESS;
    if (!lopAddress) {
      throw new Error('LOP address not configured in environment variables');
    }
    return lopAddress;
  }

  /**
   * Check current allowance for a token
   */
  static async getAllowance(params: {
    tokenAddress: string;
    ownerAddress: string;
    publicClient: any; // wagmi public client
  }): Promise<bigint> {
    try {
      console.log('[ERC20Service] Checking allowance:', {
        token: params.tokenAddress,
        owner: params.ownerAddress,
        spender: this.getLopAddress()
      });

      const allowance = await params.publicClient.readContract({
        address: params.tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [params.ownerAddress as `0x${string}`, this.getLopAddress() as `0x${string}`]
      });

      console.log('[ERC20Service] Current allowance:', allowance.toString());
      return allowance;
    } catch (error) {
      console.error('[ERC20Service] Error checking allowance:', error);
      return BigInt(0);
    }
  }

  /**
   * Check if approval is needed
   */
  static async isApprovalNeeded(params: {
    tokenAddress: string;
    ownerAddress: string;
    amount: bigint;
    publicClient: any;
  }): Promise<boolean> {
    try {
      const currentAllowance = await this.getAllowance({
        tokenAddress: params.tokenAddress,
        ownerAddress: params.ownerAddress,
        publicClient: params.publicClient
      });

      const needed = currentAllowance < params.amount;
      console.log('[ERC20Service] Approval needed:', needed, {
        currentAllowance: currentAllowance.toString(),
        requiredAmount: params.amount.toString()
      });

      return needed;
    } catch (error) {
      console.error('[ERC20Service] Error checking if approval needed:', error);
      return true; // Safe default - assume approval is needed
    }
  }

  /**
   * Approve tokens for LOP contract
   */
  static async approveToken(params: {
    tokenAddress: string;
    amount: bigint;
    decimals: number;
    walletClient: any; // wagmi wallet client
    account: string;
  }): Promise<ApprovalResult> {
    try {
      const lopAddress = this.getLopAddress();
      
      console.log('[ERC20Service] === EVM TOKEN APPROVAL DEBUG ===');
      console.log('[ERC20Service] Token address:', params.tokenAddress);
      console.log('[ERC20Service] Token address type:', typeof params.tokenAddress);
      console.log('[ERC20Service] Owner (user):', params.account);
      console.log('[ERC20Service] Spender (LOP):', lopAddress);
      console.log('[ERC20Service] Amount (raw):', params.amount.toString());
      console.log('[ERC20Service] Amount (human):', formatUnits(params.amount, params.decimals));
      console.log('[ERC20Service] Decimals:', params.decimals);
      console.log('[ERC20Service] ===============================');

      // Validate that we have a proper ERC20 contract address
      if (!params.tokenAddress || params.tokenAddress.length !== 42 || !params.tokenAddress.startsWith('0x')) {
        throw new Error(`Invalid ERC20 token address: ${params.tokenAddress}`);
      }

      console.log('[ERC20Service] Proceeding with ERC20 approval for contract:', params.tokenAddress);

      // Execute approval transaction
      const hash = await params.walletClient.writeContract({
        address: params.tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [lopAddress as `0x${string}`, params.amount],
        account: params.account as `0x${string}`
      });

      console.log('[ERC20Service] Approval transaction sent:', hash);
      
      return {
        success: true,
        txHash: hash
      };

    } catch (error) {
      console.error('[ERC20Service] Approval failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Approve maximum amount (commonly used for better UX)
   */
  static async approveMax(params: {
    tokenAddress: string;
    decimals: number;
    walletClient: any;
    account: string;
  }): Promise<ApprovalResult> {
    const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    
    return this.approveToken({
      ...params,
      amount: maxAmount
    });
  }
}
