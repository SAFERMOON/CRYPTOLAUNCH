// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/TokenTimelock.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./IOwnable.sol";
import "./ITimelockFactory.sol";
import "./IVaultFactory.sol";
import "./ReflectionToken.sol";
import "hardhat/console.sol";

contract ReflectionTokenFactory is Ownable {
    ITimelockFactory public immutable timelockFactory;
    IVaultFactory public immutable vaultFactory;
    IUniswapV2Router02 public immutable router;
    address public immutable burnAddress;

    IERC20 public feeToken;
    uint public feeAmount;
    uint public minValue;

    event SetFeeToken(address feeToken);
    event SetFeeAmount(uint feeAmount);
    event SetMinValue(uint minValue);
    event CreateToken(address token, address deployer);

    constructor(
        address _timelockFactoryAddress,
        address _vaultFactoryAddress,
        address _routerAddress,
        address _burnAddress,
        address _feeToken,
        uint _feeAmount,
        uint _minValue
    ) {
        timelockFactory = ITimelockFactory(_timelockFactoryAddress);
        vaultFactory = IVaultFactory(_vaultFactoryAddress);
        router = IUniswapV2Router02(_routerAddress);
        burnAddress = _burnAddress;
        feeToken = IERC20(_feeToken);
        feeAmount = _feeAmount;
        minValue = _minValue;
    }

    function setFeeToken(address _feeToken) external onlyOwner {
        feeToken = IERC20(_feeToken);
        emit SetFeeToken(_feeToken);
    }

    function setFeeAmount(uint _feeAmount) external onlyOwner {
        feeAmount = _feeAmount;
        emit SetFeeAmount(_feeAmount);
    }

    function setMinValue(uint _minValue) external onlyOwner {
        minValue = _minValue;
        emit SetMinValue(_minValue);
    }

    function createToken(
        string memory name,
        string memory symbol,
        uint maxTxAmount,
        uint numTokensSellToAddToLiquidity,
        uint taxFee,
        uint liquidityFee,
        uint launchTime,
        uint timelockDelay,
        uint liquidityTimelockDelay,
        uint liquidityAmount,
        uint burnAmount
    ) external payable {
        require(feeToken.transferFrom(msg.sender, burnAddress, feeAmount));

        bytes32 salt = keccak256(abi.encodePacked(msg.sender));
        ReflectionToken token = new ReflectionToken{salt: salt}(
            name,
            symbol,
            maxTxAmount,
            numTokensSellToAddToLiquidity,
            taxFee,
            liquidityFee,
            launchTime
        );

        initializeToken(token, liquidityTimelockDelay);
        burnTokens(token, burnAmount);
        addLiquidity(token, liquidityAmount);
        lockRemainingTokens(token, timelockDelay);
        token.enableBotProtection();
        lockTokenContract(token, timelockDelay);

        console.log(address(token));

        emit CreateToken(address(token), msg.sender);
    }

    function initializeToken(ReflectionToken token, uint liquidityTimelockDelay) private {
        require(liquidityTimelockDelay >= 26 weeks, "ReflectionTokenFactory: liquidityTimelockDelay must be at least 6 months");

        bytes32 salt = keccak256(abi.encodePacked(address(token)));
        TokenTimelock liquidityTimelock = new TokenTimelock{salt: salt}(
          token,
          msg.sender,
          block.timestamp + liquidityTimelockDelay
        );

        token.initialize(address(liquidityTimelock));
    }

    function burnTokens(ReflectionToken token, uint amount) private {
        if (amount != 0) {
            token.transfer(burnAddress, amount);
        }
    }

    function addLiquidity(ReflectionToken token, uint liquidityAmount) private {
        require(liquidityAmount != 0, "ReflectionTokenFactory: liquidityAmount must be positive");
        require(msg.value >= minValue, "ReflectionTokenFactory: value must be at least minValue");

        token.approve(address(router), liquidityAmount);

        router.addLiquidityETH{value: msg.value}(
            address(token),
            liquidityAmount,
            0,
            0,
            token.liquidityTimelockAddress(),
            block.timestamp
        );

        token.excludeFromReward(token.uniswapV2Pair());
    }

    function lockRemainingTokens(ReflectionToken token, uint timelockDelay) private {
        address vaultAddress = vaultFactory.createVault(address(token));
        IOwnable vault = IOwnable(vaultAddress);

        token.excludeFromFee(address(vault));
        token.transfer(address(vault), token.balanceOf(address(this)));

        address timelockAddress = timelockFactory.createTimelock(address(vault), msg.sender, timelockDelay);
        vault.transferOwnership(timelockAddress);
    }

    function lockTokenContract(ReflectionToken token, uint timelockDelay) private {
        address timelockAddress = timelockFactory.createTimelock(address(token), msg.sender, timelockDelay);
        token.transferOwnership(timelockAddress);
    }
}
