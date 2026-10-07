// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestBase} from "./TestBase.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccount} from "../src/CLAccount.sol";
import {CLAccountFactory} from "../src/CLAccountFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockProtocol} from "./mocks/MockProtocol.sol";
import {MockAdapter} from "./mocks/MockAdapter.sol";
import {CLTypes} from "../src/types/CLTypes.sol";

contract CLCoreTest is TestBase {
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);

    AdapterRegistry internal registry;
    CLAccountFactory internal factory;
    CLAccount internal account;
    MockERC20 internal token;
    MockProtocol internal protocol;
    MockAdapter internal adapter;

    function setUp() public {
        vm.prank(admin);
        registry = new AdapterRegistry(admin);
        factory = new CLAccountFactory(address(registry));
        token = new MockERC20();
        protocol = new MockProtocol();
        adapter = new MockAdapter();

        vm.startPrank(admin);
        registry.setAdapterActive(address(adapter), true);
        registry.setTargetAllowed(address(adapter), address(token), true);
        registry.setTargetAllowed(address(adapter), address(protocol), true);
        vm.stopPrank();

        vm.prank(user);
        account = CLAccount(payable(factory.createAccount(bytes32("primary"))));

        token.mint(user, 1_000_000_000);
    }

    function testFactoryPrediction() public {
        bytes32 salt = bytes32("second");
        address predicted = factory.predictAccount(user, salt);
        vm.prank(user);
        address created = factory.createAccount(salt);
        assertEq(created, predicted, "CREATE2 prediction mismatch");
    }

    function testDepositAndExecuteThroughAdapter() public {
        uint256 amount = 500_000_000;

        vm.startPrank(user);
        account.setAssetAllowed(address(token), true);
        account.authorizeAdapter(address(adapter), true);
        token.approve(address(account), amount);
        account.depositToken(address(token), amount);
        account.execute(address(adapter), abi.encode(address(token), address(protocol), amount));
        vm.stopPrank();

        assertEq(protocol.supplied(address(account), address(token)), amount, "position not owned by CL account");
        assertEq(token.balanceOf(address(account)), 0, "unexpected account token balance");
        assertEq(token.balanceOf(address(protocol)), amount, "protocol did not receive funds");
    }

    function testUnauthorizedAdapterReverts() public {
        vm.expectRevert(CLAccount.AdapterNotAuthorized.selector);
        vm.prank(user);
        account.execute(address(adapter), abi.encode(address(token), address(protocol), 1));
    }

    function testRegistryChangeInvalidatesPriorAuthorization() public {
        vm.prank(user);
        account.authorizeAdapter(address(adapter), true);

        vm.prank(admin);
        registry.setTargetAllowed(address(adapter), address(0xCAFE), true);

        vm.expectRevert(CLAccount.AdapterAuthorizationStale.selector);
        vm.prank(user);
        account.execute(address(adapter), abi.encode(address(token), address(protocol), 1));
    }

    function testAtomicBatchExecutesMultipleAdapterActions() public {
        uint256 amount = 100_000_000;

        vm.startPrank(user);
        account.setAssetAllowed(address(token), true);
        account.authorizeAdapter(address(adapter), true);
        token.approve(address(account), amount * 2);
        account.depositToken(address(token), amount * 2);

        CLTypes.AdapterAction[] memory actions = new CLTypes.AdapterAction[](2);
        actions[0] = CLTypes.AdapterAction({
            adapter: address(adapter),
            action: abi.encode(address(token), address(protocol), amount)
        });
        actions[1] = CLTypes.AdapterAction({
            adapter: address(adapter),
            action: abi.encode(address(token), address(protocol), amount)
        });

        account.executeBatch(actions);
        vm.stopPrank();

        assertEq(protocol.supplied(address(account), address(token)), amount * 2, "batch supply mismatch");
    }

    function testPauseBlocksExecutionButOwnerCanWithdraw() public {
        uint256 amount = 10_000_000;
        vm.startPrank(user);
        account.setAssetAllowed(address(token), true);
        token.approve(address(account), amount);
        account.depositToken(address(token), amount);
        account.authorizeAdapter(address(adapter), true);
        account.setPaused(true);

        vm.expectRevert(CLAccount.AccountPaused.selector);
        account.execute(address(adapter), abi.encode(address(token), address(protocol), 1));

        account.withdraw(address(token), user, amount);
        vm.stopPrank();
        assertEq(token.balanceOf(user), 1_000_000_000, "withdraw failed while paused");
    }
}
