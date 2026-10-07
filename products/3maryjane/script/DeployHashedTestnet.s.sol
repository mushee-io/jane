// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";
import {TestnetManualPriceSource} from "../src/oracles/TestnetManualPriceSource.sol";
import {HashedUSD} from "../src/hashed/HashedUSD.sol";
import {HashedCreditVault} from "../src/hashed/HashedCreditVault.sol";
import {HashedAdapter} from "../src/adapters/HashedAdapter.sol";
import {TestnetEquityToken} from "../src/hashed/TestnetEquityToken.sol";

interface VmHashed {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys Hashed demo credit infrastructure on Monad testnet.
/// @dev TESTNET ONLY. Synthetic equity prices are manually seeded for the hackathon demo.
contract DeployHashedTestnet {
    VmHashed internal constant vm = VmHashed(address(uint160(uint256(keccak256("hevm cheat code")))));

    error WrongChain(uint256 chainId);

    event HashedTestnetDeployed(
        address indexed vault,
        address indexed adapter,
        address indexed hUSD,
        address hNVDA,
        address hAAPL,
        address nvdaPriceSource,
        address aaplPriceSource,
        address hUsdPriceSource
    );

    function run()
        external
        returns (
            HashedCreditVault vault,
            HashedAdapter adapter,
            HashedUSD hUSD,
            TestnetEquityToken hNVDA,
            TestnetEquityToken hAAPL
        )
    {
        if (block.chainid != 10143) revert WrongChain(block.chainid);

        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        RiskRegistry riskRegistry = RiskRegistry(vm.envAddress("RISK_REGISTRY"));

        vm.startBroadcast(key);

        hUSD = new HashedUSD(deployer);
        hNVDA = new TestnetEquityToken("Hashed Testnet NVIDIA", "hNVDA", deployer);
        hAAPL = new TestnetEquityToken("Hashed Testnet Apple", "hAAPL", deployer);

        TestnetManualPriceSource hUsdPrice = new TestnetManualPriceSource(deployer, 1e18);
        TestnetManualPriceSource nvdaPrice = new TestnetManualPriceSource(deployer, 100e18);
        TestnetManualPriceSource aaplPrice = new TestnetManualPriceSource(deployer, 200e18);

        riskRegistry.setAssetConfig(
            address(hUSD),
            RiskTypes.AssetConfig({
                priceSource: address(hUsdPrice),
                decimals: 6,
                initialMarginBps: 1_000,
                maintenanceMarginBps: 500,
                hedgeMarginBps: 200,
                stressBps: 500,
                maxStaleness: 1 days,
                enabled: true
            })
        );

        riskRegistry.setAssetConfig(
            address(hNVDA),
            RiskTypes.AssetConfig({
                priceSource: address(nvdaPrice),
                decimals: 18,
                initialMarginBps: 4_000,
                maintenanceMarginBps: 3_000,
                hedgeMarginBps: 1_000,
                stressBps: 3_500,
                maxStaleness: 1 days,
                enabled: true
            })
        );

        riskRegistry.setAssetConfig(
            address(hAAPL),
            RiskTypes.AssetConfig({
                priceSource: address(aaplPrice),
                decimals: 18,
                initialMarginBps: 4_000,
                maintenanceMarginBps: 3_000,
                hedgeMarginBps: 1_000,
                stressBps: 3_500,
                maxStaleness: 1 days,
                enabled: true
            })
        );

        vault = new HashedCreditVault(deployer, address(riskRegistry), address(hUSD));
        hUSD.setMinter(address(vault));

        vault.setCollateralConfig(address(hNVDA), 18, 6_000, 7_500, 500, true);
        vault.setCollateralConfig(address(hAAPL), 18, 6_500, 7_800, 500, true);

        adapter = new HashedAdapter(address(vault));

        hNVDA.mint(deployer, 100e18);
        hAAPL.mint(deployer, 100e18);

        emit HashedTestnetDeployed(
            address(vault),
            address(adapter),
            address(hUSD),
            address(hNVDA),
            address(hAAPL),
            address(nvdaPrice),
            address(aaplPrice),
            address(hUsdPrice)
        );

        vm.stopBroadcast();
    }
}
