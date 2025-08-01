import {EvmAddress} from './evm-address'
import {SolanaAddress} from './solana-address'
import {SuiAddress} from './sui-address'
import {AddressComplement} from './address-complement'
import {isEvm, isSui, SupportedChain} from '../../chains'
import {AddressForChain} from '../../type-utils'

export function createAddress<Chain extends SupportedChain>(
    // hex/base56/bigint
    address: string,
    chainId: Chain,
    complement?: AddressComplement
): AddressForChain<Chain> {
    if (isEvm(chainId)) {
        return EvmAddress.fromUnknown(address) as AddressForChain<Chain>
    }

    if (isSui(chainId)) {
        if (complement) {
            const evm = EvmAddress.fromUnknown(address)
            return SuiAddress.fromParts([
                complement,
                evm
            ]) as AddressForChain<Chain>
        }

        return SuiAddress.fromUnknown(address) as AddressForChain<Chain>
    }

    // Solana
    if (complement) {
        const evm = EvmAddress.fromUnknown(address)

        return SolanaAddress.fromParts([
            complement,
            evm
        ]) as AddressForChain<Chain>
    }

    return SolanaAddress.fromUnknown(address) as AddressForChain<Chain>
}
