// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IAdapterRegistry {
    function isAdapterActive(address adapter) external view returns (bool);
    function isTargetAllowed(address adapter, address target) external view returns (bool);
    function isSelectorEnforced(address adapter, address target) external view returns (bool);
    function isSelectorAllowed(address adapter, address target, bytes4 selector) external view returns (bool);
    function isCallAllowed(address adapter, address target, bytes4 selector) external view returns (bool);
    function adapterVersion(address adapter) external view returns (uint64);
}
