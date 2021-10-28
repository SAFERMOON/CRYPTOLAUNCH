const { expect } = require("chai");
const { BigNumber } = require("@ethersproject/bignumber");

const increaseTime = async (seconds) => {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
};

describe("ReflectionToken", () => {
  let Token;
  let token;

  let owner;
  let account;
  let other;

  beforeEach(async () => {
    Token = await ethers.getContractFactory("ReflectionToken");
    token = await Token.deploy(
      "Token",
      "TOKEN",
      BigNumber.from(5000000).mul(10**6).mul(10**9),
      BigNumber.from(500000).mul(10**6).mul(10**9),
      5,
      5,
      (await ethers.provider.getBlock()).timestamp + 86400,
    );

    [owner, account, other] = await ethers.getSigners();
  });

  describe("constructor", () => {
    it("requires maxTxAmount to be greater than 0", async () => {
      await expect(Token.deploy(
        "Token",
        "TOKEN",
        0,
        BigNumber.from(500000).mul(10**6).mul(10**9),
        5,
        5,
        (await ethers.provider.getBlock()).timestamp + 86400,
      )).to.be.revertedWith("Amount must be greater than 0");
    });

    it("requires taxFee to be less than or equal to 15", async () => {
      await expect(Token.deploy(
        "Token",
        "TOKEN",
        BigNumber.from(5000000).mul(10**6).mul(10**9),
        BigNumber.from(500000).mul(10**6).mul(10**9),
        16,
        5,
        (await ethers.provider.getBlock()).timestamp + 86400,
      )).to.be.revertedWith("Amount must be less than or equal to 15");
    });

    it("requires liquidityFee to be less than or equal to 15", async () => {
      await expect(Token.deploy(
        "Token",
        "TOKEN",
        BigNumber.from(5000000).mul(10**6).mul(10**9),
        BigNumber.from(500000).mul(10**6).mul(10**9),
        5,
        16,
        (await ethers.provider.getBlock()).timestamp + 86400,
      )).to.be.revertedWith("Amount must be less than or equal to 15");
    });

    it("sets state variables", async () => {
      expect(await token.name()).to.equal("Token");
      expect(await token.symbol()).to.equal("TOKEN");
      expect(await token._taxFee()).to.equal(5);
      expect(await token._liquidityFee()).to.equal(5);
      expect(await token._maxTxAmount()).to.equal(BigNumber.from(5000000).mul(10**6).mul(10**9));
      expect(await token.numTokensSellToAddToLiquidity()).to.equal(BigNumber.from(500000).mul(10**6).mul(10**9));
    });

    it("adds the owner and the contract to _excludedFromFee", async () => {
      expect(await token._excludedFromFee(0)).to.equal(owner.address);
      expect(await token._excludedFromFee(1)).to.equal(token.address);
    });

    it("limits the prelaunch period to 1 week", async () => {
      await expect(Token.deploy(
        "Token",
        "TOKEN",
        BigNumber.from(5000000).mul(10**6).mul(10**9),
        BigNumber.from(500000).mul(10**6).mul(10**9),
        5,
        5,
        (await ethers.provider.getBlock()).timestamp + 604860,
      )).to.be.revertedWith("BotProtection: launch time must be within 1 week");
    });
  });

  describe("initialize", () => {
    it("can only be called by the owner", async () => {
      await expect(token.connect(account).initialize(owner.address, account.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("sets state variables", async () => {
      await token.initialize(owner.address, account.address);

      expect(await token.liquidityTimelockAddress()).to.equal(owner.address);
      expect(await token.vaultAddress()).to.equal(account.address);
    });

    it("can only called once", async () => {
      await token.initialize(owner.address, account.address);
      await expect(token.initialize(owner.address, account.address)).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("transfer", () => {
    beforeEach(async () => {
      await token.enableBotProtection();
    });

    it("blocks transfers from recipients before launch time", async () => {
      await token.transfer(account.address, BigNumber.from(100000000).mul(10**6).mul(10**9));

      expect(await token.blockedLength()).to.equal(1);
      expect(await token.blocked(await token.blockedIndex(account.address))).to.equal(account.address);
      await expect(token.connect(account).transfer(owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).to.be.revertedWith("BotProtection: transfers blocked");

      await token.connect(account).approve(other.address, BigNumber.from(50000000).mul(10**6).mul(10**9));
      await expect(token.connect(other).transferFrom(account.address, owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).to.be.revertedWith("BotProtection: transfers blocked");
    });

    it("allows transfers from recipients after launch time", async () => {
      await increaseTime(86400);
      await token.transfer(account.address, BigNumber.from(100000000).mul(10**6).mul(10**9));

      expect(await token.blockedLength()).to.equal(0);
      await expect(token.connect(account).transfer(owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).not.to.be.reverted;

      await token.connect(account).approve(other.address, BigNumber.from(50000000).mul(10**6).mul(10**9));
      await expect(token.connect(other).transferFrom(account.address, owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).not.to.be.reverted;
    });
  });

  describe("transferFrom", () => {
    beforeEach(async () => {
      await token.enableBotProtection();
    });

    it("blocks transfers from recipients before launch time", async () => {
      await token.approve(other.address, BigNumber.from(100000000).mul(10**6).mul(10**9));
      await token.connect(other).transferFrom(owner.address, account.address, BigNumber.from(100000000).mul(10**6).mul(10**9));

      expect(await token.blockedLength()).to.equal(1);
      expect(await token.blocked(await token.blockedIndex(account.address))).to.equal(account.address);
      await expect(token.connect(account).transfer(owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).to.be.revertedWith("BotProtection: transfers blocked");

      await token.connect(account).approve(other.address, BigNumber.from(50000000).mul(10**6).mul(10**9));
      await expect(token.connect(other).transferFrom(account.address, owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).to.be.revertedWith("BotProtection: transfers blocked");
    });

    it("allows transfers from recipients after launch time", async () => {
      await increaseTime(86400);
      await token.approve(other.address, BigNumber.from(100000000).mul(10**6).mul(10**9));
      await token.connect(other).transferFrom(owner.address, account.address, BigNumber.from(100000000).mul(10**6).mul(10**9));

      expect(await token.blockedLength()).to.equal(0);
      await expect(token.connect(account).transfer(owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).not.to.be.reverted;

      await token.connect(account).approve(other.address, BigNumber.from(50000000).mul(10**6).mul(10**9));
      await expect(token.connect(other).transferFrom(account.address, owner.address, BigNumber.from(50000000).mul(10**6).mul(10**9))).not.to.be.reverted;
    });
  });

  describe("excludedLength", () => {
    it("returns the length of _excluded", async () => {
      expect(await token.excludedLength()).to.equal(0);
    });
  });

  describe("includeInReward", () => {
    it("doesn't include accounts that are already included", async () => {
      await expect(token.includeInReward(owner.address)).to.be.revertedWith("Account is already included");
    });
  });

  describe("excludeFromFee", () => {
    it("doesn't exclude accounts that are already excluded", async () => {
      await expect(token.excludeFromFee(owner.address)).to.be.revertedWith("Account is already excluded");
    });

    it("adds the account to _excludedFromFee", async () => {
      await token.excludeFromFee(account.address);
      expect(await token._excludedFromFee(2)).to.equal(account.address);
    });
  });

  describe("includeInFee", () => {
    it("doesn't include accounts that are already included", async () => {
      await expect(token.includeInFee(account.address)).to.be.revertedWith("Account is already included");
    });

    it("removes the account from _excludedFromFee", async () => {
      await token.includeInFee(owner.address);

      expect(await token._excludedFromFee(0)).to.equal(token.address);
      await expect(token._excludedFromFee(1)).to.be.reverted;
    });
  });

  describe("setMaxTxAmount", () => {
    it("doesn't set _maxTxAmount to 0", async () => {
      await expect(token.setMaxTxAmount(0)).to.be.revertedWith("Amount must be greater than 0");
    });

    it("sets _maxTxAmount", async () => {
      const amount = BigNumber.from(5000).mul(10**6).mul(10**9);
      await token.setMaxTxAmount(amount);
      expect(await token._maxTxAmount()).to.equal(amount);
    });
  });

  describe("excludedFromFeeLength", () => {
    it("returns the length of _excludedFromFee", async () => {
      expect(await token.excludedFromFeeLength()).to.equal(2);
    });
  });

  describe("enableBotProtection", () => {
    it("can only be called by the owner", async () => {
      await expect(token.connect(account).enableBotProtection()).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("enables bot protection", async () => {
      expect(await token.botProtectionEnabled()).to.equal(false);
      await token.enableBotProtection();
      expect(await token.botProtectionEnabled()).to.equal(true);
    });
  });

  describe("allowTransfers", () => {
    it("can only be called by the owner", async () => {
      await expect(token.connect(account).allowTransfers(account.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("allows transfers from blocked recipients after launch time", async () => {
      await token.enableBotProtection();
      await token.transfer(account.address, BigNumber.from(100000000).mul(10**6).mul(10**9));
      await token.transfer(other.address, BigNumber.from(100000000).mul(10**6).mul(10**9));
      expect(await token.transfersBlocked(account.address)).to.equal(true);
      expect(await token.transfersBlocked(other.address)).to.equal(true);
      expect(await token.blockedLength()).to.equal(2);
      expect(await token.blocked(await token.blockedIndex(account.address))).to.equal(account.address);
      expect(await token.blocked(await token.blockedIndex(other.address))).to.equal(other.address);

      await expect(token.allowTransfers(account.address)).to.be.revertedWith("BotProtection: before launch");

      increaseTime(86400);
      await token.allowTransfers(account.address);

      expect(await token.transfersBlocked(account.address)).to.equal(false);
      expect(await token.transfersBlocked(other.address)).to.equal(true);
      expect(await token.blockedLength()).to.equal(1);
      expect(await token.blocked(await token.blockedIndex(other.address))).to.equal(other.address);
    });
  });
});
