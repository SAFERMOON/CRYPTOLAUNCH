// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/TokenTimelock.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./IOwnable.sol";
import "./ITimelockFactory.sol";
import "./ITokenTimelockFactory.sol";
import "./IVaultFactory.sol";
import "./ReflectionToken.sol";

contract ReflectionTokenFactory is Ownable {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using SafeERC20 for ReflectionToken;

    ITokenTimelockFactory public immutable tokenTimelockFactory;
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
        address _tokenTimelockFactoryAddress,
        address _timelockFactoryAddress,
        address _vaultFactoryAddress,
        address _routerAddress,
        address _burnAddress,
        address _feeToken,
        uint _feeAmount,
        uint _minValue
    ) {
        tokenTimelockFactory = ITokenTimelockFactory(_tokenTimelockFactoryAddress);
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
        feeToken.safeTransferFrom(msg.sender, burnAddress, feeAmount);

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

        emit CreateToken(address(token), msg.sender);
    }

    function initializeToken(ReflectionToken token, uint liquidityTimelockDelay) private {
        require(liquidityTimelockDelay >= 26 weeks, "ReflectionTokenFactory: liquidityTimelockDelay must be at least 6 months");

        address liquidityTimelockAddress = tokenTimelockFactory.createTokenTimelock(
            IERC20(token.uniswapV2Pair()),
            msg.sender,
            block.timestamp.add(liquidityTimelockDelay)
        );

        address vaultAddress = vaultFactory.createVault(address(token));

        token.initialize(liquidityTimelockAddress, vaultAddress);
    }

    function burnTokens(ReflectionToken token, uint amount) private {
        if (amount != 0) {
            token.safeTransfer(burnAddress, amount);
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
        IOwnable vault = IOwnable(token.vaultAddress());

        token.excludeFromFee(address(vault));
        token.safeTransfer(address(vault), token.balanceOf(address(this)));

        address timelockAddress = timelockFactory.createTimelock(address(vault), msg.sender, timelockDelay);
        vault.transferOwnership(timelockAddress);
    }

    function lockTokenContract(ReflectionToken token, uint timelockDelay) private {
        address timelockAddress = timelockFactory.createTimelock(address(token), msg.sender, timelockDelay);
        token.transferOwnership(timelockAddress);
    }
}
