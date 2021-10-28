// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITokenTimelockFactory {
    function createTokenTimelock(IERC20 token, address beneficiary, uint releaseTime) external returns (address);
}
