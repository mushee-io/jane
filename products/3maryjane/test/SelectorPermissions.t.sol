// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestBase} from "./TestBase.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccount} from "../src/CLAccount.sol";
import {CLAccountFactory} from "../src/CLAccountFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCallAdapter} from "./mocks/MockCallAdapter.sol";

contract SelectorPermissionsTest is TestBase {
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal attacker = address(0xBAD);

    AdapterRegistry internal registry;
    CLAccount internal account;
    MockERC20 internal token;
    MockCallAdapter internal adapter;

    function setUp() public {
        vm.prank(admin);
        registry = new AdapterRegistry(admin);
        CLAccountFactory factory = new CLAccountFactory(address(registry));
        token = new MockERC20();
        adapter = new MockCallAdapter();

        vm.startPrank(admin);
        registry.setAdapterActive(address(adapter), true);
        registry.setTargetAllowed(address(adapter), address(token), true);
        registry.setSelectorAllowed(address(adapter), address(token), token.approve.selector, true);
        registry.setSelectorEnforced(address(adapter), address(token), true);
        vm.stopPrank();

        vm.prank(user);
        account = CLAccount(payable(factory.createAccount(bytes32("selector-security"))));

        token.mint(address(account), 100_000_000);
        vm.prank(user);
        account.authorizeAdapter(address(adapter), true);
    }

    function testAllowlistedTargetCannotUseUnapprovedTransferSelector() public {
        bytes memory maliciousCall = abi.encodeCall(token.transfer, (attacker, 10_000_000));
        bytes memory action = abi.encode(address(token), uint256(0), maliciousCall);

        vm.expectRevert(
            abi.encodeWithSelector(CLAccount.CallNotAllowed.selector, address(token), token.transfer.selector)
        );
        vm.prank(user);
        account.execute(address(adapter), action);

        assertEq(token.balanceOf(address(account)), 100_000_000, "selector bypass drained account");
        assertEq(token.balanceOf(attacker), 0, "attacker received funds");
    }

    function testApprovedSelectorCanExecute() public {
        bytes memory approvedCall = abi.encodeCall(token.approve, (attacker, 123));
        bytes memory action = abi.encode(address(token), uint256(0), approvedCall);

        vm.prank(user);
        account.execute(address(adapter), action);

        assertEq(token.allowance(address(account), attacker), 123, "approved selector failed");
    }

    function testSelectorPermissionChangeInvalidatesAccountAuthorization() public {
        vm.prank(admin);
        registry.setSelectorAllowed(address(adapter), address(token), token.transfer.selector, true);

        bytes memory approvedCall = abi.encodeCall(token.approve, (attacker, 123));
        bytes memory action = abi.encode(address(token), uint256(0), approvedCall);

        vm.expectRevert(CLAccount.AdapterAuthorizationStale.selector);
        vm.prank(user);
        account.execute(address(adapter), action);
    }
}
