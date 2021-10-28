// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract BotProtection is Ownable {
    uint public immutable launchTime;
    bool public botProtectionEnabled;
    mapping(address => bool) public transfersBlocked;
    mapping(address => uint) public blockedIndex;
    address[] public blocked;

    uint public constant MAX_PRELAUNCH_PERIOD = 1 weeks;

    constructor(uint _launchTime) {
        require(_launchTime <= block.timestamp + MAX_PRELAUNCH_PERIOD, "BotProtection: launch time must be within 1 week");
        launchTime = _launchTime;
    }

    modifier blocksTransfers(address sender, address recipient) {
        if (botProtectionEnabled) {
            require(!transfersBlocked[sender], "BotProtection: transfers blocked");

            if (block.timestamp < launchTime && !transfersBlocked[recipient]) {
                transfersBlocked[recipient] = true;
                blockedIndex[recipient] = blocked.length;
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
        uint index = blockedIndex[sender];
        delete blockedIndex[sender];
        address last = blocked[blocked.length - 1];
        blockedIndex[last] = index;
        blocked[index] = last;
        blocked.pop();
        delete transfersBlocked[sender];
    }

    function blockedLength() external view returns (uint) {
        return blocked.length;
    }
}
