// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

interface ITimelockFactory {
    function createTimelock(address contractAddress, address admin, uint delay) external returns (address);
}
