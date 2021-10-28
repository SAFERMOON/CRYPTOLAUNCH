// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/TokenTimelock.sol";

contract TokenTimelockFactory {
    event CreateTokenTimelock(address tokenTimelockAddress);

    function createTokenTimelock(IERC20 token, address beneficiary, uint releaseTime) external returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(address(token)));
        TokenTimelock tokenTimelock = new TokenTimelock{salt: salt}(token, beneficiary, releaseTime);
        address tokenTimelockAddress = address(tokenTimelock);
        emit CreateTokenTimelock(tokenTimelockAddress);
        return tokenTimelockAddress;
    }
}
