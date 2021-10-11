// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "./Vault.sol";

contract VaultFactory {
  event CreateVault(address vaultAddress);

  function createVault(address tokenAddress) external returns (address) {
      bytes32 salt = keccak256(abi.encodePacked(tokenAddress));
      Vault vault = new Vault{salt: salt}(tokenAddress);
      vault.transferOwnership(msg.sender);
      address vaultAddress = address(vault);
      emit CreateVault(vaultAddress);
      return vaultAddress;
  }
}
