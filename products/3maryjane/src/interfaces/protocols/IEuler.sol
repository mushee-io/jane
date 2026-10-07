// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IEulerVault {
    function EVC() external view returns (address);
    function asset() external view returns (address);
    function unitOfAccount() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function debtOf(address account) external view returns (uint256);
    function accountLiquidity(address account, bool liquidation)
        external
        view
        returns (uint256 collateralValue, uint256 liabilityValue);
    function deposit(uint256 amount, address receiver) external returns (uint256);
    function withdraw(uint256 amount, address receiver, address owner) external returns (uint256);
    function borrow(uint256 amount, address receiver) external returns (uint256);
    function repay(uint256 amount, address receiver) external returns (uint256);
}

interface IEulerEVC {
    function enableCollateral(address account, address vault) external payable;
    function disableCollateral(address account, address vault) external payable;
    function enableController(address account, address vault) external payable;
    function disableController(address account) external payable;
    function isCollateralEnabled(address account, address vault) external view returns (bool);
    function isControllerEnabled(address account, address vault) external view returns (bool);
}
