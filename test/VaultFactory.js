const { expect } = require("chai");
const { BigNumber } = require("@ethersproject/bignumber");

const getInitCodeHash = (initCode, types, values) => ethers.utils.solidityKeccak256(
  ["bytes", "bytes"],
  [initCode, ethers.utils.defaultAbiCoder.encode(types, values)],
);

describe("VaultFactory", () => {
  let VaultFactory;
  let vaultFactory;

  let Vault;

  let Token;
  let token;

  let owner;

  beforeEach(async () => {
    VaultFactory = await ethers.getContractFactory("VaultFactory");
    vaultFactory = await VaultFactory.deploy();

    Vault = await ethers.getContractFactory("Vault");

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

  describe("createVault", () => {
    it("creates a vault", async () => {
      const salt = ethers.utils.solidityKeccak256(["address"], [token.address]);
      const initCodeHash = getInitCodeHash(
        Vault.bytecode,
        ["address"],
        [token.address],
      );
      const address = ethers.utils.getCreate2Address(
        vaultFactory.address,
        salt,
        initCodeHash,
      );

      await expect(vaultFactory.createVault(token.address)).to.emit(vaultFactory, "CreateVault").withArgs(address);
      const vault = Vault.attach(address);

      expect(await vault.token()).to.equal(token.address);
      expect(await vault.owner()).to.equal(owner.address);
    });
  });
});
