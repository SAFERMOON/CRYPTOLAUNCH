const { expect } = require("chai");
const { BigNumber } = require("@ethersproject/bignumber");

const getInitCodeHash = (initCode, types, values) => ethers.utils.solidityKeccak256(
  ["bytes", "bytes"],
  [initCode, ethers.utils.defaultAbiCoder.encode(types, values)],
);

describe("TimelockFactory", () => {
  let TimelockFactory;
  let timelockFactory;

  let Timelock;

  let Token;
  let token;

  let owner;

  beforeEach(async () => {
    TimelockFactory = await ethers.getContractFactory("TimelockFactory");
    timelockFactory = await TimelockFactory.deploy();

    Timelock = await ethers.getContractFactory("Timelock");

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

  describe("createTimelock", () => {
    it("creates a timelock", async () => {
      const salt = ethers.utils.solidityKeccak256(["address"], [token.address]);
      const initCodeHash = getInitCodeHash(
        Timelock.bytecode,
        ["address", "uint"],
        [owner.address, 86400],
      );
      const address = ethers.utils.getCreate2Address(
        timelockFactory.address,
        salt,
        initCodeHash,
      );

      await expect(timelockFactory.createTimelock(token.address, owner.address, 86400)).to.emit(timelockFactory, "CreateTimelock").withArgs(address);
      const timelock = Timelock.attach(address);

      expect(await timelock.admin()).to.equal(owner.address);
      expect(await timelock.delay()).to.equal(86400);
    });
  });
});
