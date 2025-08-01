// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {Resolver} from "../src/Resolver.sol";
import {IOrderMixin} from "limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import {IEscrowFactory} from "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {console} from "forge-std/console.sol";

contract DeployResolver is Script {
    address FACTORY = 0xa7bCb4EAc8964306F9e3764f67Db6A7af6DdF99A;
    address LOP = 0x111111125421cA6dc452d289314280a0f8842A65;
    address OWNER = 0x3B4c54f4D909a7b837F9AC6fc1f20BfDE74f3B69;

    function run() public {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        Resolver resolver = new Resolver(IEscrowFactory(FACTORY), IOrderMixin(LOP), OWNER);
        vm.stopBroadcast();

        console.log("Resolver deployed at:", address(resolver));
    }
}
