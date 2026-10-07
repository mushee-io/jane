// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";
import {IKuruMarginAccount, IKuruOrderBook} from "../src/interfaces/protocols/IKuru.sol";
import {IPerplExchange} from "../src/interfaces/protocols/IPerpl.sol";
import {IEulerEVC, IEulerVault} from "../src/interfaces/protocols/IEuler.sol";

interface VmPermissionScript {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function envAddress(string calldata, string calldata) external returns (address[] memory);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @title ConfigureAdapterPermissions
/// @notice Installs target + selector permissions for the three Metropolis integrations.
/// @dev Run this before any user authorizes an adapter. Every registry permission mutation bumps
///      the adapter version by design, so configuring after user authorization makes that
///      authorization stale until the user explicitly re-authorizes.
contract ConfigureAdapterPermissions {
    VmPermissionScript internal constant vm =
        VmPermissionScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    error EmptyTargetSet(string name);

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        AdapterRegistry registry = AdapterRegistry(vm.envAddress("ADAPTER_REGISTRY"));

        address kuruAdapter = vm.envAddress("KURU_ADAPTER");
        address perplAdapter = vm.envAddress("PERPL_ADAPTER");
        address eulerAdapter = vm.envAddress("EULER_ADAPTER");

        address kuruMargin = vm.envAddress("KURU_MARGIN_ACCOUNT");
        address perplExchange = vm.envAddress("PERPL_EXCHANGE");
        address perplCollateral = vm.envAddress("PERPL_COLLATERAL");
        address eulerEvc = vm.envAddress("EULER_EVC");

        address[] memory kuruTokens = vm.envAddress("KURU_TRACKED_TOKENS", ",");
        address[] memory kuruMarkets = vm.envAddress("KURU_MARKETS", ",");
        address[] memory eulerVaults = vm.envAddress("EULER_TRACKED_VAULTS", ",");

        if (kuruTokens.length == 0) revert EmptyTargetSet("KURU_TRACKED_TOKENS");
        if (kuruMarkets.length == 0) revert EmptyTargetSet("KURU_MARKETS");
        if (eulerVaults.length == 0) revert EmptyTargetSet("EULER_TRACKED_VAULTS");

        vm.startBroadcast(key);

        registry.setAdapterActive(kuruAdapter, true);
        registry.setAdapterActive(perplAdapter, true);
        registry.setAdapterActive(eulerAdapter, true);

        _configureKuru(registry, kuruAdapter, kuruMargin, kuruTokens, kuruMarkets);
        _configurePerpl(registry, perplAdapter, perplExchange, perplCollateral);
        _configureEuler(registry, eulerAdapter, eulerEvc, eulerVaults);

        vm.stopBroadcast();
    }

    function _configureKuru(
        AdapterRegistry registry,
        address adapter,
        address margin,
        address[] memory tokens,
        address[] memory markets
    ) internal {
        _allow(registry, adapter, margin, IKuruMarginAccount.deposit.selector);
        _allow(registry, adapter, margin, IKuruMarginAccount.withdraw.selector);

        for (uint256 i = 0; i < tokens.length; ++i) {
            _allow(registry, adapter, tokens[i], IERC20Minimal.approve.selector);
        }

        for (uint256 i = 0; i < markets.length; ++i) {
            address market = markets[i];
            _allow(registry, adapter, market, IKuruOrderBook.placeAndExecuteMarketBuy.selector);
            _allow(registry, adapter, market, IKuruOrderBook.placeAndExecuteMarketSell.selector);
            _allow(registry, adapter, market, IKuruOrderBook.addBuyOrder.selector);
            _allow(registry, adapter, market, IKuruOrderBook.addSellOrder.selector);
            _allow(registry, adapter, market, IKuruOrderBook.batchCancelOrders.selector);
            _allow(registry, adapter, market, IKuruOrderBook.batchCancelFlipOrders.selector);
        }
    }

    function _configurePerpl(
        AdapterRegistry registry,
        address adapter,
        address exchange,
        address collateral
    ) internal {
        _allow(registry, adapter, collateral, IERC20Minimal.approve.selector);
        _allow(registry, adapter, exchange, IPerplExchange.createAccount.selector);
        _allow(registry, adapter, exchange, IPerplExchange.depositCollateral.selector);
        _allow(registry, adapter, exchange, IPerplExchange.withdrawCollateral.selector);
        _allow(registry, adapter, exchange, IPerplExchange.allowOrderForwarding.selector);
        _allow(registry, adapter, exchange, IPerplExchange.execOrder.selector);
        _allow(registry, adapter, exchange, IPerplExchange.execOrders.selector);
        _allow(registry, adapter, exchange, IPerplExchange.execOrderV2.selector);
        _allow(registry, adapter, exchange, IPerplExchange.execOrdersV2.selector);
    }

    function _configureEuler(
        AdapterRegistry registry,
        address adapter,
        address evc,
        address[] memory vaults
    ) internal {
        _allow(registry, adapter, evc, IEulerEVC.enableCollateral.selector);
        _allow(registry, adapter, evc, IEulerEVC.disableCollateral.selector);
        _allow(registry, adapter, evc, IEulerEVC.enableController.selector);
        _allow(registry, adapter, evc, IEulerEVC.disableController.selector);

        for (uint256 i = 0; i < vaults.length; ++i) {
            address vault = vaults[i];
            address token = IEulerVault(vault).asset();
            _allow(registry, adapter, token, IERC20Minimal.approve.selector);
            _allow(registry, adapter, vault, IEulerVault.deposit.selector);
            _allow(registry, adapter, vault, IEulerVault.repay.selector);
            _allow(registry, adapter, vault, IEulerVault.withdraw.selector);
            _allow(registry, adapter, vault, IEulerVault.borrow.selector);
        }
    }

    function _allow(AdapterRegistry registry, address adapter, address target, bytes4 selector) internal {
        registry.setTargetAllowed(adapter, target, true);
        registry.setSelectorAllowed(adapter, target, selector, true);
        registry.setSelectorEnforced(adapter, target, true);
    }
}
