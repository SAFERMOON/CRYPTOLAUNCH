const { expect } = require("chai");
const { BigNumber } = require("@ethersproject/bignumber");

const increaseTime = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

const getSalt = (address) => ethers.utils.solidityKeccak256(["address"], [address]);

const getInitCodeHash = (initCode, types, values) => ethers.utils.solidityKeccak256(
  ["bytes", "bytes"],
  [initCode, ethers.utils.defaultAbiCoder.encode(types, values)],
);

const getAddress = (from, contractFactory, types, args, account) => {
  const salt = getSalt(account.address);
  const initCodeHash = getInitCodeHash(contractFactory.bytecode, types, args);

  return ethers.utils.getCreate2Address(from.address, salt, initCodeHash);
};

const getTokenArgs = async (launchTimeDelay = 86400) => [
  "Token",
  "TOKEN",
  BigNumber.from(5000000).mul(10**6).mul(10**9),
  BigNumber.from(500000).mul(10**6).mul(10**9),
  5,
  5,
  (await ethers.provider.getBlock()).timestamp + launchTimeDelay,
];

describe("ReflectionTokenFactory", () => {
  let TimelockFactory;
  let timelockFactory;

  let VaultFactory;
  let vaultFactory;

  let Factory;
  let factory;

  let Token;
  let TokenTimelock;
  let Vault;
  let Timelock;
  let weth;

  let owner;
  let account;
  let other;

  beforeEach(async () => {
    TokenTimelockFactory = await ethers.getContractFactory("TokenTimelockFactory");
    tokenTimelockFactory = await TokenTimelockFactory.deploy();

    TimelockFactory = await ethers.getContractFactory("TimelockFactory");
    timelockFactory = await TimelockFactory.deploy();

    VaultFactory = await ethers.getContractFactory("VaultFactory");
    vaultFactory = await VaultFactory.deploy();

    Token = await ethers.getContractFactory("ReflectionToken");
    const tokenArgs = await getTokenArgs();
    const token = await Token.deploy(...tokenArgs);

    const feeAmount = BigNumber.from("10000000000").mul(10**9);
    Factory = await ethers.getContractFactory("ReflectionTokenFactory");
    factory = await Factory.deploy(
      tokenTimelockFactory.address,
      timelockFactory.address,
      vaultFactory.address,
      "0x10ED43C718714eb63d5aA57B78B54704E256024E",
      "0x000000000000000000000000000000000000dEaD",
      token.address,
      feeAmount,
      ethers.utils.parseEther("10"),
    );

    TokenTimelock = await ethers.getContractFactory("TokenTimelock");
    Vault = await ethers.getContractFactory("Vault");
    Timelock = await ethers.getContractFactory("Timelock");
    weth = await ethers.getContractAt("IERC20", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");

    [owner, account, other] = await ethers.getSigners();

    const feeAllowance = feeAmount.mul(2);
    token.transfer(account.address, feeAllowance);
    token.connect(account).approve(factory.address, feeAllowance);
  });

  describe("setFeeToken", () => {
    it("can only be called by the owner", async () => {
      const tokenArgs = await getTokenArgs();
      const feeToken = await Token.deploy(...tokenArgs);
      await expect(factory.connect(account).setFeeToken(feeToken.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("sets feeToken", async () => {
      const tokenArgs = await getTokenArgs();
      const feeToken = await Token.deploy(...tokenArgs);
      await factory.setFeeToken(feeToken.address);

      expect(await factory.feeToken()).to.equal(feeToken.address);
    });

    it("emits", async () => {
      const tokenArgs = await getTokenArgs();
      const feeToken = await Token.deploy(...tokenArgs);
      await factory.setFeeToken(feeToken.address);

      await expect(factory.setFeeToken(feeToken.address)).to.emit(factory, "SetFeeToken").withArgs(feeToken.address);
    });
  });

  describe("setFeeAmount", () => {
    it("can only be called by the owner", async () => {
      const feeAmount = BigNumber.from("20000000000").mul(10**9);
      await expect(factory.connect(account).setFeeAmount(feeAmount)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("sets feeAmount", async () => {
      const feeAmount = BigNumber.from("20000000000").mul(10**9);
      await factory.setFeeAmount(feeAmount);

      expect(await factory.feeAmount()).to.equal(feeAmount);
    });

    it("emits", async () => {
      const feeAmount = BigNumber.from("20000000000").mul(10**9);
      await factory.setFeeAmount(feeAmount);

      await expect(factory.setFeeAmount(feeAmount)).to.emit(factory, "SetFeeAmount").withArgs(feeAmount);
    });
  });

  describe("setMinValue", () => {
    it("can only be called by the owner", async () => {
      const minValue = ethers.utils.parseEther("1");
      await expect(factory.connect(account).setMinValue(minValue)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("sets minValue", async () => {
      const minValue = ethers.utils.parseEther("1");
      await factory.setMinValue(minValue);

      expect(await factory.minValue()).to.equal(minValue);
    });

    it("emits", async () => {
      const minValue = ethers.utils.parseEther("1");
      await factory.setMinValue(minValue);

      await expect(factory.setMinValue(minValue)).to.emit(factory, "SetMinValue").withArgs(minValue);
    });
  });

  describe("createToken", () => {
    let getTokenAddress;
    let getTimelockAddress;

    beforeEach(() => {
      getTokenAddress = (args) => getAddress(
        factory,
        Token,
        [
          "string",
          "string",
          "uint",
          "uint",
          "uint",
          "uint",
          "uint",
        ],
        args,
        account,
      );

      getTimelockAddress = (token) => getAddress(
        timelockFactory,
        Timelock,
        ["address", "uint"],
        [account.address, 86400],
        token,
      );
    });

    it("requires a fee", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");

      await expect(factory.connect(other).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      )).to.be.revertedWith("SafeMath: subtraction overflow");

      const feeToken = Token.attach(await factory.feeToken());
      await feeToken.transfer(other.address, await factory.feeAmount());

      await expect(factory.connect(other).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      )).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });

    it("burns the fee", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");

      const feeToken = Token.attach(await factory.feeToken());
      const balance = await feeToken.balanceOf(account.address);

      expect(await feeToken.balanceOf(await factory.burnAddress())).to.equal(0);

      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );

      expect(await feeToken.balanceOf(account.address)).to.be.below(balance);
      expect(await feeToken.balanceOf(await factory.burnAddress())).to.be.above(0);
    });

    it("deploys a token with state variables at the right address", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));

      expect(await token.name()).to.equal("Token");
      expect(await token.symbol()).to.equal("TOKEN");
      expect(await token._taxFee()).to.equal(5);
      expect(await token._liquidityFee()).to.equal(5);
      expect(await token._maxTxAmount()).to.equal(BigNumber.from(5000000).mul(10**6).mul(10**9));
      expect(await token.numTokensSellToAddToLiquidity()).to.equal(BigNumber.from(500000).mul(10**6).mul(10**9));
      expect(await token.launchTime()).to.equal(tokenArgs[tokenArgs.length - 1]);
    });

    it("doesn't deploy tokens with the same state variables", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      const args = [
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      ];
      await factory.connect(account).createToken(...args);

      await expect(factory.connect(account).createToken(...args)).to.be.reverted;
    });

    it("deploys tokens with different state variables", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      const factoryArgs = [
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      ];
      await factory.connect(account).createToken(
        ...tokenArgs,
        ...factoryArgs,
      );

      await expect(factory.connect(account).createToken(
        "Token2",
        "TOKEN2",
        ...tokenArgs.slice(2, tokenArgs.length),
        ...factoryArgs,
      )).to.not.be.reverted;
    });

    it("requires liquidityTimelockDelay to be at least 6 months", async () => {
      const liquidityTimelockDelay = 0;

      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");

      await expect(factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      )).to.be.revertedWith("ReflectionTokenFactory: liquidityTimelockDelay must be at least 6 months");
    });

    it("initializes the token with a liquidity timelock", async () => {
      const liquidityTimelockDelay = 15724800;

      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));
      const liquidityTimelock = TokenTimelock.attach(await token.liquidityTimelockAddress());
      const { timestamp } = await ethers.provider.getBlock();

      expect(await liquidityTimelock.token()).to.equal(await token.uniswapV2Pair());
      expect(await liquidityTimelock.beneficiary()).to.equal(account.address);
      expect(await liquidityTimelock.releaseTime()).to.equal(timestamp + liquidityTimelockDelay);
    });

    it("initializes the token with a vault", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));
      const vault = Vault.attach(await token.vaultAddress());

      expect(await vault.token()).to.equal(token.address);
    });

    it("burns tokens", async () => {
      const burnAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);

      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));

      expect(await token.balanceOf(await factory.burnAddress())).to.equal(burnAmount);
    });

    it("requires liquidityAmount to be positive", async () => {
      const liquidityAmount = 0;

      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");

      await expect(factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      )).to.be.revertedWith("ReflectionTokenFactory: liquidityAmount must be positive");
    });

    it("requires msg.value to be at least minValue", async () => {
      const value = ethers.utils.parseEther("9");

      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;

      await expect(factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      )).to.be.revertedWith("ReflectionTokenFactory: value must be at least minValue");
    });

    it("adds liquidity", async () => {
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const value = ethers.utils.parseEther("10");

      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const burnAmount = 0;
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));
      uniswapV2Pair = await ethers.getContractAt("IERC20", await token.uniswapV2Pair());

      expect(await token.balanceOf(uniswapV2Pair.address)).to.equal(liquidityAmount);
      expect(await weth.balanceOf(uniswapV2Pair.address)).to.equal(value);
      expect(await uniswapV2Pair.balanceOf(await token.liquidityTimelockAddress())).to.be.above(0);
    });

    it("excludes the liquidity pool from rewards", async () => {
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const value = ethers.utils.parseEther("10");

      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const burnAmount = 0;
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));

      expect(await token.isExcludedFromReward(await token.uniswapV2Pair())).to.equal(true);
    });

    it("excludes the vault from fees", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));

      expect(await token.isExcludedFromFee(await token.vaultAddress())).to.equal(true);
    });

    it("sends remaining tokens to the vault", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));

      expect(await token.balanceOf(await token.vaultAddress())).to.equal(BigNumber.from(800000000).mul(10**6).mul(10**9));
    });

    it("transfers ownership of the vault to a timelock", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));
      const vault = Vault.attach(await token.vaultAddress());
      const vaultTimelock = Timelock.attach(getTimelockAddress(vault));

      expect(await vault.owner()).to.equal(vaultTimelock.address);
      expect(await vaultTimelock.admin()).to.equal(account.address);
      expect(await vaultTimelock.delay()).to.equal(timelockDelay);
    });

    it("transfers ownership to a timelock", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));
      const timelock = Timelock.attach(getTimelockAddress(token));

      expect(await token.owner()).to.equal(timelock.address);
      expect(await timelock.admin()).to.equal(account.address);
      expect(await timelock.delay()).to.equal(timelockDelay);
    });

    it("enables bot protection", async () => {
      const tokenArgs = await getTokenArgs(2 * 86400);
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const value = ethers.utils.parseEther("10");
      await factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      );
      const token = Token.attach(getTokenAddress(tokenArgs));
      const vault = Vault.attach(await token.vaultAddress());
      const vaultTimelock = Timelock.attach(getTimelockAddress(vault));

      expect(await token.balanceOf(await factory.burnAddress())).to.be.above(0);
      expect(await token.transfersBlocked(await factory.burnAddress())).to.equal(false);
      expect(await token.balanceOf(await token.uniswapV2Pair())).to.be.above(0);
      expect(await token.transfersBlocked(await token.uniswapV2Pair())).to.equal(false);
      expect(await token.balanceOf(vault.address)).to.be.above(0);
      expect(await token.transfersBlocked(vault.address)).to.equal(false);

      const withdrawDelay = 86400 + 60;
      const withdrawArgs = [
        vault.address,
        0,
        "withdraw(address,uint256)",
        ethers.utils.defaultAbiCoder.encode(
          ["address", "uint256"],
          [account.address, ethers.utils.parseEther("10")],
        ),
        (await ethers.provider.getBlock()).timestamp + withdrawDelay,
      ];
      await vaultTimelock.connect(account).queueTransaction(...withdrawArgs);
      increaseTime(withdrawDelay);
      await vaultTimelock.connect(account).executeTransaction(...withdrawArgs);

      expect(await token.transfersBlocked(account.address)).to.equal(true);
    });

    it("emits", async () => {
      const tokenArgs = await getTokenArgs();
      const timelockDelay = 86400;
      const liquidityTimelockDelay = 15724800;
      const liquidityAmount = BigNumber.from(100000000).mul(10**6).mul(10**9);
      const burnAmount = 0;
      const value = ethers.utils.parseEther("10");

      await expect(factory.connect(account).createToken(
        ...tokenArgs,
        timelockDelay,
        liquidityTimelockDelay,
        liquidityAmount,
        burnAmount,
        { value },
      )).to.emit(factory, "CreateToken").withArgs(getTokenAddress(tokenArgs), account.address);
    });
  });
});
