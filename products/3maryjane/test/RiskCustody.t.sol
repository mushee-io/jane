// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestBase} from "./TestBase.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccount} from "../src/CLAccount.sol";
import {CLAccountFactory} from "../src/CLAccountFactory.sol";
import {CLTypes} from "../src/types/CLTypes.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";
import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskEngine} from "../src/risk/RiskEngine.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {WalletBalanceAdapter} from "../src/adapters/WalletBalanceAdapter.sol";
import {MockPriceSource} from "./mocks/MockPriceSource.sol";
import {MockRiskAdapter} from "./mocks/MockRiskAdapter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract RiskCustodyTest is TestBase {
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal recipient = address(0xCAFE);
    address internal constant MON = address(0x1111);

    AdapterRegistry internal adapterRegistry;
    CLAccount internal account;
    RiskRegistry internal riskRegistry;
    RiskEngine internal riskEngine;
    RiskPolicyManager internal policyManager;
    WalletBalanceAdapter internal walletSource;
    MockRiskAdapter internal monSpot;
    MockERC20 internal usdc;

    function setUp() public {
        vm.prank(admin);
        adapterRegistry = new AdapterRegistry(admin);
        CLAccountFactory factory = new CLAccountFactory(address(adapterRegistry));
        vm.prank(user);
        account = CLAccount(payable(factory.createAccount(bytes32("custody-risk"))));

        usdc = new MockERC20();
        usdc.mint(address(account), 2e6);

        riskRegistry = new RiskRegistry(address(this));
        riskRegistry.setAssetConfig(
            MON,
            RiskTypes.AssetConfig({
                priceSource: address(new MockPriceSource(2e18)),
                decimals: 18,
                initialMarginBps: 2000,
                maintenanceMarginBps: 1000,
                hedgeMarginBps: 200,
                stressBps: 2000,
                maxStaleness: 1 days,
                enabled: true
            })
        );
        riskRegistry.setAssetConfig(
            address(usdc),
            RiskTypes.AssetConfig({
                priceSource: address(new MockPriceSource(1e18)),
                decimals: 6,
                initialMarginBps: 0,
                maintenanceMarginBps: 0,
                hedgeMarginBps: 0,
                stressBps: 500,
                maxStaleness: 1 days,
                enabled: true
            })
        );

        riskEngine = new RiskEngine(address(riskRegistry));
        policyManager = new RiskPolicyManager(address(riskEngine));
        walletSource = new WalletBalanceAdapter(address(this));
        walletSource.addAsset(address(usdc));
        monSpot = new MockRiskAdapter(
            keccak256("MON_SPOT"), MON, keccak256("MON-SPOT-CUSTODY-TEST"), CLTypes.PositionType.SPOT
        );
        monSpot.seed(address(account), int256(1e18), 0, 0, 0);

        vm.startPrank(admin);
        adapterRegistry.setAdapterActive(address(monSpot), true);
        adapterRegistry.setTargetAllowed(address(monSpot), address(monSpot), true);
        vm.stopPrank();

        address[] memory covered = new address[](2);
        covered[0] = address(monSpot);
        covered[1] = address(walletSource);

        RiskTypes.Policy memory p = RiskTypes.Policy({
            enabled: true,
            allowRiskReducingWhenBreached: false,
            maxGrossExposureUsd: 0,
            maxDebtUsd: 0,
            maxLeverageE18: 0,
            maxMarginUtilizationE18: 0,
            minHealthE18: 15e18,
            minCriticalMoveBps: 0
        });

        vm.startPrank(user);
        policyManager.configure(address(account), p, covered);
        account.setAssetAllowed(address(usdc), true);
        account.authorizeAdapter(address(monSpot), true);
        account.setRiskGuard(address(policyManager), true);
        vm.stopPrank();
    }

    function testFreeCollateralIsPartOfUnifiedEquity() public view {
        address[] memory covered = policyManager.adapters(address(account));
        (RiskTypes.PortfolioMetrics memory m,) = riskEngine.portfolio(address(account), covered);
        assertTrue(m.equityUsd == int256(4e18), "free USDC plus MON spot should equal $4 equity");
        assertEq(m.maintenanceMarginUsd, 2e17, "MON maintenance margin mismatch");
        assertEq(m.healthE18, 20e18, "free collateral should support CL health");
    }

    function testWithdrawalThatBreaksHealthRevertsAndRestoresBalance() public {
        bytes memory expected = abi.encodeWithSelector(
            CLAccount.RiskPolicyViolation.selector,
            policyManager.REASON_HEALTH()
        );

        vm.expectRevert(expected);
        vm.prank(user);
        account.withdraw(address(usdc), recipient, 2e6);

        assertEq(usdc.balanceOf(address(account)), 2e6, "reverted withdrawal must restore CL cash");
        assertEq(usdc.balanceOf(recipient), 0, "recipient must receive nothing after policy revert");
    }
}
