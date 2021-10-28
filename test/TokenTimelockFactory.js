const { expect } = require("chai");
const { BigNumber } = require("@ethersproject/bignumber");

const getInitCodeHash = (initCode, types, values) => ethers.utils.solidityKeccak256(
  ["bytes", "bytes"],
  [initCode, ethers.utils.defaultAbiCoder.encode(types, values)],
);

describe("TokenTimelockFactory", () => {
  let TokenTimelockFactory;
  let tokenTimelockFactory;

  let TokenTimelock;

  let Token;
  let token;

  let owner;

  beforeEach(async () => {
    TokenTimelockFactory = await ethers.getContractFactory("TokenTimelockFactory");
    tokenTimelockFactory = await TokenTimelockFactory.deploy();

    TokenTimelock = await ethers.getContractFactory("TokenTimelock");

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

    [owner] = await ethers.getSigners();
  });

  describe("createTokenTimelock", () => {
    it("creates a token timelock", async () => {
      const salt = ethers.utils.solidityKeccak256(["address"], [token.address]);
      const releaseTime = (await ethers.provider.getBlock()).timestamp + 86400;
      const initCodeHash = getInitCodeHash(
        TokenTimelock.bytecode,
        ["address", "address", "uint"],
        [token.address, owner.address, releaseTime],
      );
      const address = ethers.utils.getCreate2Address(
        tokenTimelockFactory.address,
        salt,
        initCodeHash,
      );

      await expect(tokenTimelockFactory.createTokenTimelock(token.address, owner.address, releaseTime)).to.emit(tokenTimelockFactory, "CreateTokenTimelock").withArgs(address);
      const tokenTimelock = TokenTimelock.attach(address);

      expect(await tokenTimelock.token()).to.equal(token.address);
      expect(await tokenTimelock.beneficiary()).to.equal(owner.address);
      expect(await tokenTimelock.releaseTime()).to.equal(releaseTime);
    });
  });
});
