// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract BotProtection is Ownable {
    uint public immutable launchTime;
    bool public botProtectionEnabled;
    mapping(address => bool) public transfersBlocked;
    address[] public blocked;

    constructor(uint _launchTime) {
        launchTime = _launchTime;
    }

    modifier blocksTransfers(address sender, address recipient) {
        if (botProtectionEnabled) {
            require(!transfersBlocked[sender], "BotProtection: transfers blocked");

            if (block.timestamp < launchTime && !transfersBlocked[recipient]) {
                transfersBlocked[recipient] = true;
                blocked.push(recipient);
            }
        }

        _;
    }

    function enableBotProtection() external onlyOwner {
        botProtectionEnabled = true;
    }

    function allowTransfers(address sender) external onlyOwner {
        require(block.timestamp >= launchTime, "BotProtection: before launch");

        for (uint i = 0; i < blocked.length; i++) {
            if (blocked[i] == sender) {
                blocked[i] = blocked[blocked.length - 1];
                blocked.pop();

                delete transfersBlocked[sender];
            }
        }
    }

    function blockedLength() external view returns (uint) {
        return blocked.length;
    }
}
