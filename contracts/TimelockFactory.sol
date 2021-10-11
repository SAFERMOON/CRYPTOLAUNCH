// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "./Timelock.sol";

contract TimelockFactory {
  event CreateTimelock(address timelockAddress);

  function createTimelock(address contractAddress, address admin, uint delay) external returns (address) {
      bytes32 salt = keccak256(abi.encodePacked(contractAddress));
      Timelock timelock = new Timelock{salt: salt}(admin, delay);
      address timelockAddress = address(timelock);
      emit CreateTimelock(timelockAddress);
      return timelockAddress;
  }
}
