// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";
import {IKuruMarginAccount, IKuruOrderBook} from "../src/interfaces/protocols/IKuru.sol";
import {IPerplExchange} from "../src/interfaces/protocols/IPerpl.sol";

interface VmTestnetPermissions {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function envAddress(string calldata, string calldata) external returns (address[] memory);
    function envOr(string calldata, string calldata, address[] calldata) external returns (address[] memory);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Testnet-only exact target/selector permissions for Kuru + Perpl.
contract ConfigureTestnetAdapterPermissions {
    VmTestnetPermissions internal constant vm =
        VmTestnetPermissions(address(uint160(uint256(keccak256("hevm cheat code")))));

    error EmptyTargetSet(string name);

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        AdapterRegistry registry = AdapterRegistry(vm.envAddress("ADAPTER_REGISTRY"));
        address kuruAdapter = vm.envAddress("KURU_ADAPTER");
        address perplAdapter = vm.envAddress("PERPL_ADAPTER");
        address[] memory kuruTokens = vm.envAddress("KURU_TRACKED_TOKENS", ",");
        address[] memory emptyMarkets = new address[](0);
        address[] memory kuruMarkets = vm.envOr("KURU_MARKETS", ",", emptyMarkets);

        if (kuruTokens.length == 0) revert EmptyTargetSet("KURU_TRACKED_TOKENS");
        // KURU_MARKETS may be empty on testnet when no canonical market has been verified.
        // Margin deposit/withdraw and token approvals are still configured; orderbook selectors
        // can be added later once a specific testnet market is independently verified.

        vm.startBroadcast(key);

        registry.setAdapterActive(kuruAdapter, true);
        registry.setAdapterActive(perplAdapter, true);

        address kuruMargin = vm.envAddress("KURU_MARGIN_ACCOUNT");
        _allow(registry, kuruAdapter, kuruMargin, IKuruMarginAccount.deposit.selector);
        _allow(registry, kuruAdapter, kuruMargin, IKuruMarginAccount.withdraw.selector);

        for (uint256 i = 0; i < kuruTokens.length; ++i) {
            _allow(registry, kuruAdapter, kuruTokens[i], IERC20Minimal.approve.selector);
        }

        for (uint256 i = 0; i < kuruMarkets.length; ++i) {
            address market = kuruMarkets[i];
            _allow(registry, kuruAdapter, market, IKuruOrderBook.placeAndExecuteMarketBuy.selector);
            _allow(registry, kuruAdapter, market, IKuruOrderBook.placeAndExecuteMarketSell.selector);
            _allow(registry, kuruAdapter, market, IKuruOrderBook.addBuyOrder.selector);
            _allow(registry, kuruAdapter, market, IKuruOrderBook.addSellOrder.selector);
            _allow(registry, kuruAdapter, market, IKuruOrderBook.batchCancelOrders.selector);
            _allow(registry, kuruAdapter, market, IKuruOrderBook.batchCancelFlipOrders.selector);
        }

        address exchange = vm.envAddress("PERPL_EXCHANGE");
        address collateral = vm.envAddress("PERPL_COLLATERAL");
        _allow(registry, perplAdapter, collateral, IERC20Minimal.approve.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.createAccount.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.depositCollateral.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.withdrawCollateral.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.allowOrderForwarding.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.execOrder.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.execOrders.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.execOrderV2.selector);
        _allow(registry, perplAdapter, exchange, IPerplExchange.execOrdersV2.selector);

        vm.stopBroadcast();
    }

    function _allow(AdapterRegistry registry, address adapter, address target, bytes4 selector) internal {
        registry.setTargetAllowed(adapter, target, true);
        registry.setSelectorAllowed(adapter, target, selector, true);
        registry.setSelectorEnforced(adapter, target, true);
    }
}
