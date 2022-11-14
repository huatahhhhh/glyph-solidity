const { expectRevert } = require("@openzeppelin/test-helpers");
const {ZERO_ADDRESS} = require("@openzeppelin/test-helpers/src/constants");
const Contract = artifacts.require("UserManager");

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

contract('UserManager', ([owner, other1, other2]) => {
  before( async () => {
    this.owner = owner;
    this.other1 = other1;
    this.other2 = other2;
  });
  beforeEach( async () => {
    this.contract = await Contract.new({ from: this.owner });
  });
  describe("When address is not added", () => {
    it("address is not an acknowledge user", async () => {
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, false);
    });
  });
  describe("When user is added by owner..", () => {
    beforeEach( async () => {
      await this.contract.addUser(this.other1, { from: this.owner });
    });
    it("user is an acknowledged user", async () => {
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, true);
    });
  });
  describe("When added user is removed by owner..", () => {
    beforeEach( async () => {
      await this.contract.addUser(this.other1, { from: this.owner });
      await this.contract.removeUser(this.other1, { from: this.owner });
    });
    it("user is not an acknowledged user", async () => {
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, false);
    });
    it("user can be added back again to be acknowledged", async () => {
      await this.contract.addUser(this.other1, { from: this.owner });
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, true);
    });
  });
  describe("When non-user address is removed by owner", () => {
    beforeEach( async () => {
      await this.contract.removeUser(this.other1, { from: this.owner });
    });
    it("address is not acknowledged", async () => {
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, false);
    });
    it("address can be added to be acknowledged", async () => {
      await this.contract.addUser(this.other1);
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, true);
    });
  });
  describe("When address is added by non-owner", () => {
    beforeEach( async () => {
      await expectRevert(
        this.contract.addUser(this.other1, { from: this.other2 }),
        "Ownable: caller is not the owner"
      );
    });
    it("address is not acknowledged", async () => {
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, false);
    });
  });
  describe("When added user is removed by non-owner", () => {
    beforeEach( async () => {
      this.contract.addUser(this.other1, { from: this.owner }),
      await expectRevert(
        this.contract.removeUser(this.other1, { from: this.other2 }),
        "Ownable: caller is not the owner"
      );
    });
    it("user is still acknowledged", async () => {
      var isUser = await this.contract.isUser(this.other1);
      assert.equal(isUser, true);
    });
  });
});
