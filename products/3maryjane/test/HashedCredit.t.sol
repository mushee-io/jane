// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestBase} from "./TestBase.sol";
import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";
import {HashedUSD} from "../src/hashed/HashedUSD.sol";
import {HashedCreditVault} from "../src/hashed/HashedCreditVault.sol";
import {HashedAdapter} from "../src/adapters/HashedAdapter.sol";
import {CLTypes} from "../src/types/CLTypes.sol";
import {MockPriceSource} from "./mocks/MockPriceSource.sol";

contract MockEquity18 {
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ALLOWANCE");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract HashedCreditTest is TestBase {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    RiskRegistry internal registry;
    HashedUSD internal hUSD;
    HashedCreditVault internal vault;
    HashedAdapter internal adapter;
    MockEquity18 internal stock;
    MockPriceSource internal stockPrice;
    MockPriceSource internal usdPrice;

    function setUp() public {
        registry = new RiskRegistry(address(this));
        hUSD = new HashedUSD(address(this));
        vault = new HashedCreditVault(address(this), address(registry), address(hUSD));
        adapter = new HashedAdapter(address(vault));
        stock = new MockEquity18();
        stockPrice = new MockPriceSource(200e18);
        usdPrice = new MockPriceSource(1e18);

        registry.setAssetConfig(
            address(stock),
            RiskTypes.AssetConfig({
                priceSource: address(stockPrice),
                decimals: 18,
                initialMarginBps: 4_000,
                maintenanceMarginBps: 3_000,
                hedgeMarginBps: 1_000,
                stressBps: 3_500,
                maxStaleness: 1 days,
                enabled: true
            })
        );

        registry.setAssetConfig(
            address(hUSD),
            RiskTypes.AssetConfig({
                priceSource: address(usdPrice),
                decimals: 6,
                initialMarginBps: 1_000,
                maintenanceMarginBps: 500,
                hedgeMarginBps: 200,
                stressBps: 500,
                maxStaleness: 1 days,
                enabled: true
            })
        );

        hUSD.setMinter(address(vault));
        vault.setCollateralConfig(address(stock), 18, 6_000, 7_500, 500, true);

        stock.mint(ALICE, 20e18);
        stock.mint(BOB, 20e18);
    }

    function testBorrowAgainstTokenizedStock() public {
        vm.startPrank(ALICE);
        stock.approve(address(vault), 10e18);
        vault.deposit(address(stock), 10e18);
        vault.borrow(1_000e6);
        vm.stopPrank();

        assertEq(hUSD.balanceOf(ALICE), 1_000e6, "borrowed hUSD");
        assertEq(vault.debtOf(ALICE), 1_000e6, "debt recorded");
        assertEq(vault.borrowCapacityUsdE18(ALICE), 1_200e18, "60 percent LTV");
        assertTrue(vault.healthFactorE18(ALICE) > 1e18, "healthy account");

        CLTypes.Position[] memory positions = adapter.getPositions(ALICE);
        assertEq(positions.length, 2, "collateral plus debt");
    }

    function testBorrowLimitFailsClosed() public {
        vm.startPrank(ALICE);
        stock.approve(address(vault), 10e18);
        vault.deposit(address(stock), 10e18);
        vm.expectRevert(abi.encodeWithSelector(HashedCreditVault.BorrowLimitExceeded.selector, 1_201e18, 1_200e18));
        vault.borrow(1_201e6);
        vm.stopPrank();
    }

    function testLiquidationAfterEquityPriceDrop() public {
        vm.startPrank(ALICE);
        stock.approve(address(vault), 10e18);
        vault.deposit(address(stock), 10e18);
        vault.borrow(1_000e6);
        vm.stopPrank();

        stockPrice.set(100e18, block.timestamp);
        assertTrue(vault.healthFactorE18(ALICE) < 1e18, "alice liquidatable");

        vm.startPrank(BOB);
        stock.approve(address(vault), 10e18);
        vault.deposit(address(stock), 10e18);
        vault.borrow(500e6);
        hUSD.approve(address(vault), 200e6);
        vault.liquidate(ALICE, address(stock), 200e6);
        vm.stopPrank();

        assertEq(vault.debtOf(ALICE), 800e6, "debt reduced");
        assertTrue(stock.balanceOf(BOB) > 10e18, "liquidator receives collateral");
    }
}
