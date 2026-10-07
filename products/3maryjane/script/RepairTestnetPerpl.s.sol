// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccount} from "../src/CLAccount.sol";
import {PerplAdapter} from "../src/adapters/PerplAdapter.sol";
import {WalletBalanceAdapter} from "../src/adapters/WalletBalanceAdapter.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";
import {IPerplExchange} from "../src/interfaces/protocols/IPerpl.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";

interface VmRepairTestnetPerpl {
    function envUint(string calldata) external returns (uint256);
    function envUint(string calldata, string calldata) external returns (uint256[] memory);
    function envAddress(string calldata) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice One-shot repair for the live Perpl Monad testnet collateral migration.
/// @dev TESTNET ONLY. Deploys a fresh Perpl adapter, applies exact permissions,
///      migrates risk collateral config, rewires the existing CL account policy,
///      and disables the stale adapter. It does not move user funds.
contract RepairTestnetPerpl {
    VmRepairTestnetPerpl internal constant vm =
        VmRepairTestnetPerpl(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 internal constant PERPL_PROTOCOL_ID = keccak256("PERPL");

    event TestnetPerplRepaired(
        address indexed account,
        address indexed oldAdapter,
        address indexed newAdapter,
        address collateral
    );

    function run() external returns (PerplAdapter newAdapter) {
        uint256 key = vm.envUint("PRIVATE_KEY");

        AdapterRegistry registry = AdapterRegistry(vm.envAddress("ADAPTER_REGISTRY"));
        CLAccount account = CLAccount(payable(vm.envAddress("CL_ACCOUNT")));
        RiskPolicyManager policyManager = RiskPolicyManager(vm.envAddress("CL_RISK_POLICY_MANAGER"));
        RiskRegistry riskRegistry = RiskRegistry(vm.envAddress("RISK_REGISTRY"));
        WalletBalanceAdapter walletAdapter = WalletBalanceAdapter(vm.envAddress("WALLET_BALANCE_ADAPTER"));

        address oldAdapter = vm.envAddress("OLD_PERPL_ADAPTER");
        address oldCollateral = vm.envAddress("OLD_PERPL_COLLATERAL");
        address exchange = vm.envAddress("PERPL_EXCHANGE");
        address collateral = vm.envAddress("PERPL_COLLATERAL");
        uint256[] memory trackedPerps = vm.envUint("PERPL_TRACKED_PERP_IDS", ",");

        RiskTypes.Policy memory currentPolicy = policyManager.policy(address(account));
        RiskTypes.AssetConfig memory oldCollateralConfig = riskRegistry.getAssetConfig(oldCollateral);

        vm.startBroadcast(key);

        newAdapter = new PerplAdapter(exchange, collateral, trackedPerps);

        registry.setAdapterActive(address(newAdapter), true);
        _allow(registry, address(newAdapter), collateral, IERC20Minimal.approve.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.createAccount.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.depositCollateral.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.withdrawCollateral.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.allowOrderForwarding.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.execOrder.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.execOrders.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.execOrderV2.selector);
        _allow(registry, address(newAdapter), exchange, IPerplExchange.execOrdersV2.selector);

        // Reuse the existing TESTNET manual collateral price source/config for the live AUSD token.
        if (oldCollateralConfig.enabled) {
            riskRegistry.setAssetConfig(collateral, oldCollateralConfig);
        }

        // Carry forward existing per-instrument unit configuration, changing only collateral.
        for (uint256 i = 0; i < trackedPerps.length; ++i) {
            bytes32 instrumentId = keccak256(abi.encode(PERPL_PROTOCOL_ID, "PERP", trackedPerps[i]));
            RiskTypes.InstrumentConfig memory config = riskRegistry.getInstrumentConfig(instrumentId);
            if (config.enabled) {
                config.collateralAsset = collateral;
                riskRegistry.setInstrumentConfig(instrumentId, config);
            }
        }

        account.setAssetAllowed(collateral, true);
        walletAdapter.addAsset(collateral);

        if (oldCollateral != collateral) {
            account.setAssetAllowed(oldCollateral, false);
            walletAdapter.removeAsset(oldCollateral);
        }

        account.authorizeAdapter(address(newAdapter), true);

        address[] memory riskAdapters = new address[](3);
        riskAdapters[0] = vm.envAddress("KURU_ADAPTER");
        riskAdapters[1] = address(newAdapter);
        riskAdapters[2] = address(walletAdapter);
        policyManager.configure(address(account), currentPolicy, riskAdapters);

        if (oldAdapter != address(0) && oldAdapter != address(newAdapter)) {
            registry.setAdapterActive(oldAdapter, false);
        }

        emit TestnetPerplRepaired(address(account), oldAdapter, address(newAdapter), collateral);
        vm.stopBroadcast();
    }

    function _allow(AdapterRegistry registry, address adapter, address target, bytes4 selector) internal {
        registry.setTargetAllowed(adapter, target, true);
        registry.setSelectorAllowed(adapter, target, selector, true);
        registry.setSelectorEnforced(adapter, target, true);
    }
}
