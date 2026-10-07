// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {KuruAdapter} from "../src/adapters/KuruAdapter.sol";
import {PerplAdapter} from "../src/adapters/PerplAdapter.sol";
import {WalletBalanceAdapter} from "../src/adapters/WalletBalanceAdapter.sol";

interface VmTestnetAdapters {
    function envUint(string calldata) external returns (uint256);
    function envUint(string calldata, string calldata) external returns (uint256[] memory);
    function envAddress(string calldata) external returns (address);
    function envAddress(string calldata, string calldata) external returns (address[] memory);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Testnet-only adapter deployment for Kuru + Perpl + direct account balances.
/// @dev Euler is intentionally excluded because 3maryjane does not carry a verified Monad
///      testnet Euler deployment.
contract DeployTestnetAdapters {
    VmTestnetAdapters internal constant vm =
        VmTestnetAdapters(address(uint160(uint256(keccak256("hevm cheat code")))));

    error EmptyTrackedSet(string name);

    event TestnetAdaptersDeployed(address indexed kuru, address indexed perpl, address walletBalance);

    function run()
        external
        returns (KuruAdapter kuruAdapter, PerplAdapter perplAdapter, WalletBalanceAdapter walletBalanceAdapter)
    {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);

        address[] memory trackedTokens = vm.envAddress("KURU_TRACKED_TOKENS", ",");
        uint256[] memory trackedPerps = vm.envUint("PERPL_TRACKED_PERP_IDS", ",");
        address[] memory freeCollateralAssets = vm.envAddress("FREE_COLLATERAL_ASSETS", ",");

        if (trackedTokens.length == 0) revert EmptyTrackedSet("KURU_TRACKED_TOKENS");
        if (trackedPerps.length == 0) revert EmptyTrackedSet("PERPL_TRACKED_PERP_IDS");
        if (freeCollateralAssets.length == 0) revert EmptyTrackedSet("FREE_COLLATERAL_ASSETS");

        vm.startBroadcast(key);

        kuruAdapter = new KuruAdapter(vm.envAddress("KURU_MARGIN_ACCOUNT"), trackedTokens);
        perplAdapter =
            new PerplAdapter(vm.envAddress("PERPL_EXCHANGE"), vm.envAddress("PERPL_COLLATERAL"), trackedPerps);
        walletBalanceAdapter = new WalletBalanceAdapter(deployer);

        for (uint256 i = 0; i < freeCollateralAssets.length; ++i) {
            walletBalanceAdapter.addAsset(freeCollateralAssets[i]);
        }

        emit TestnetAdaptersDeployed(address(kuruAdapter), address(perplAdapter), address(walletBalanceAdapter));
        vm.stopBroadcast();
    }
}
