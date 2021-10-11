// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface IVaultFactory {
    function createVault(address tokenAddress) external returns (address);
}
