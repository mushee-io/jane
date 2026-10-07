// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAdapterRegistry} from "./interfaces/IAdapterRegistry.sol";

contract AdapterRegistry is IAdapterRegistry {
    address public owner;
    mapping(address adapter => bool active) private _active;
    mapping(address adapter => mapping(address target => bool allowed)) private _targets;
    mapping(address adapter => mapping(address target => bool enforced)) private _selectorEnforced;
    mapping(address adapter => mapping(address target => mapping(bytes4 selector => bool allowed))) private _selectors;
    mapping(address adapter => uint64 version) private _version;

    error Unauthorized();
    error ZeroAddress();
    error LengthMismatch();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AdapterStatusChanged(address indexed adapter, bool active, uint64 version);
    event AdapterTargetChanged(address indexed adapter, address indexed target, bool allowed, uint64 version);
    event AdapterSelectorEnforcementChanged(
        address indexed adapter, address indexed target, bool enforced, uint64 version
    );
    event AdapterSelectorChanged(
        address indexed adapter, address indexed target, bytes4 indexed selector, bool allowed, uint64 version
    );

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setAdapterActive(address adapter, bool active) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        if (_active[adapter] != active) {
            _active[adapter] = active;
            _version[adapter] += 1;
        }
        emit AdapterStatusChanged(adapter, active, _version[adapter]);
    }

    function setTargetAllowed(address adapter, address target, bool allowed) external onlyOwner {
        _setTarget(adapter, target, allowed);
    }

    function setTargetsAllowed(address adapter, address[] calldata targets, bool allowed) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        for (uint256 i; i < targets.length; ++i) {
            _setTarget(adapter, targets[i], allowed);
        }
    }

    function setTargetsAllowed(address adapter, address[] calldata targets, bool[] calldata allowed) external onlyOwner {
        if (targets.length != allowed.length) revert LengthMismatch();
        if (adapter == address(0)) revert ZeroAddress();
        for (uint256 i; i < targets.length; ++i) {
            _setTarget(adapter, targets[i], allowed[i]);
        }
    }

    /// @notice Enable exact function-selector enforcement for one adapter/target pair.
    /// @dev A permission change bumps the adapter version so existing CLAccount authorization
    ///      becomes stale until the account owner explicitly re-authorizes the adapter.
    function setSelectorEnforced(address adapter, address target, bool enforced) external onlyOwner {
        if (adapter == address(0) || target == address(0)) revert ZeroAddress();
        if (_selectorEnforced[adapter][target] != enforced) {
            _selectorEnforced[adapter][target] = enforced;
            _version[adapter] += 1;
        }
        emit AdapterSelectorEnforcementChanged(adapter, target, enforced, _version[adapter]);
    }

    function setSelectorAllowed(address adapter, address target, bytes4 selector, bool allowed) external onlyOwner {
        if (adapter == address(0) || target == address(0)) revert ZeroAddress();
        if (_selectors[adapter][target][selector] != allowed) {
            _selectors[adapter][target][selector] = allowed;
            _version[adapter] += 1;
        }
        emit AdapterSelectorChanged(adapter, target, selector, allowed, _version[adapter]);
    }

    function setSelectorsAllowed(
        address adapter,
        address target,
        bytes4[] calldata selectors,
        bool allowed
    ) external onlyOwner {
        if (adapter == address(0) || target == address(0)) revert ZeroAddress();
        for (uint256 i; i < selectors.length; ++i) {
            if (_selectors[adapter][target][selectors[i]] != allowed) {
                _selectors[adapter][target][selectors[i]] = allowed;
                _version[adapter] += 1;
            }
            emit AdapterSelectorChanged(adapter, target, selectors[i], allowed, _version[adapter]);
        }
    }

    function _setTarget(address adapter, address target, bool allowed) internal {
        if (adapter == address(0) || target == address(0)) revert ZeroAddress();
        if (_targets[adapter][target] != allowed) {
            _targets[adapter][target] = allowed;
            _version[adapter] += 1;
        }
        emit AdapterTargetChanged(adapter, target, allowed, _version[adapter]);
    }

    function isAdapterActive(address adapter) external view returns (bool) {
        return _active[adapter];
    }

    function isTargetAllowed(address adapter, address target) external view returns (bool) {
        return _targets[adapter][target];
    }

    function isSelectorEnforced(address adapter, address target) external view returns (bool) {
        return _selectorEnforced[adapter][target];
    }

    function isSelectorAllowed(address adapter, address target, bytes4 selector) external view returns (bool) {
        return _selectors[adapter][target][selector];
    }

    function isCallAllowed(address adapter, address target, bytes4 selector) external view returns (bool) {
        if (!_targets[adapter][target]) return false;
        if (!_selectorEnforced[adapter][target]) return true;
        return _selectors[adapter][target][selector];
    }

    function adapterVersion(address adapter) external view returns (uint64) {
        return _version[adapter];
    }
}
