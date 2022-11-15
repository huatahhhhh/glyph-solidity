const { expectRevert } = require("@openzeppelin/test-helpers");
const {ZERO_ADDRESS} = require("@openzeppelin/test-helpers/src/constants");
const Contract = artifacts.require("PriceFeedManager");

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

contract('PriceFeedManager', async ([owner, other]) => {
  before(async () => {
    this.owner = owner;
    this.other = other;
  });
  describe("When symbol is NOT registered..", async () => {
    before( async () => {
      this.symbol = "symbol000";
      this.contract = await Contract.new({ from: this.owner });
    });
    it("does not exist", async () => {
      var exists = await this.contract.checkSymbolExists(this.symbol);
      assert.equal(exists, false);
    });
    it("cannot be activated", async () => {
      await expectRevert(
        this.contract.activateSymbol(this.symbol),
        "Symbol does not exist"
      );
    });
  });
  describe("When symbol is registered..", async () => {
    before( async () => {
       this.symbol = "symbol001";
       this.contract = await Contract.new({ from: this.owner });
       await this.contract.registerSymbol(this.symbol);
    });
    it("is inactive", async ()=>{
      var active = await this.contract.checkSymbolActive(this.symbol);
      assert.equal(active, false);
    });
    it("exists", async () => {
      var exists = await this.contract.checkSymbolExists(this.symbol);
      assert.equal(exists, true);
    });
    it("cannot be registered again", async () => {
      await expectRevert(
        this.contract.registerSymbol(this.symbol),
        "Symbol is already registered"
      );
    });
    it("cannot be activated yet", async () => {
      await expectRevert(
        this.contract.activateSymbol(this.symbol),
        "Symbol cannot be activated when oracle address is not set"
      );
    });
    it("cannot be registered by non-owners", async () => {
       await expectRevert(
         this.contract.registerSymbol(this.symbol, { from: this.other } ),
         "Ownable: caller is not the owner"
       );
    });
  });
  describe("When Oracle is being set..", async () => {
    beforeEach( async () => {
      this.symbol = "symbol001";
      this.address = "0xA9F441A487754E6B27BA044A5A8EB2EEC77F6B92"
      this.other_address = "0x5fC98F3Fd21B82FB0F0Fdced1bE20c9Eb08BfE1C"
      this.contract = await Contract.new({ from: this.owner });
      await this.contract.registerSymbol(this.symbol);
    });
    it("oracle address is set", async () => {
      await this.contract.setOracle(this.symbol, this.address)

      var infoMap = await this.contract.symbolInfoMap(this.symbol)
      assert.equal(
        infoMap.oracle.toLowerCase(),
        this.address.toLowerCase()
      );
    });
    it("symbol must be registered", async () => {
      await expectRevert(
        this.contract.setOracle("badsymbol", this.address),
        "Symbol does not exist"
      );
    });
    it("symbol cannot be active", async () => {
      // activate then try to set oracle
      await this.contract.setOracle(this.symbol, this.address);
      await this.contract.activateSymbol(this.symbol);
      await expectRevert(
        this.contract.setOracle(this.symbol, this.other_address),
        "Unable to change oracle address when symbol is active, deactivate first"
      );
    });
    it("cannot be set by non-owners", async () => {
      await expectRevert(
        this.contract.setOracle(this.symbol, this.address, { from: other }),
        "Ownable: caller is not the owner"
      );
    });
    it("address cannot be 0x00", async () => {
      await expectRevert(
        this.contract.setOracle(this.symbol, ZERO_ADDRESS),
        "Oracle address cannot be null value"
      );
    });
  });
  describe("Symbol is being activated", async () => {
    beforeEach( async () => {
      this.symbol = "symbol001";
      this.address = "0xA9F441A487754E6B27BA044A5A8EB2EEC77F6B92"
      this.contract = await Contract.new({ from: this.owner });
    });
 
    it("symbol is active", async () => {
      await this.contract.registerSymbol(this.symbol);
      await this.contract.setOracle(this.symbol, this.address)
      await this.contract.activateSymbol(this.symbol)

      var infoMap = await this.contract.symbolInfoMap(this.symbol)
      assert.equal(
        infoMap.active,
        true
      );
      var symbolActive = await this.contract.checkSymbolActive(this.symbol);
      assert.equal(
        symbolActive,
        true
      );
    });
    it("symbol must exist", async () => {
      await expectRevert(
        this.contract.activateSymbol(this.symbol),
        "Symbol does not exist"
      );
    });
    it("cannot be done by non-owners", async () => {
      await this.contract.registerSymbol(this.symbol);
      await this.contract.setOracle(this.symbol, this.address)
      await expectRevert(
        this.contract.activateSymbol(
          this.symbol,
          { from: this.other }
        ),
        "Ownable: caller is not the owner"
      );
      var symbolActive = await this.contract.checkSymbolActive(this.symbol);
      assert.equal(symbolActive, false);
    });
    it("address cannot be 0x00", async () => {
      await this.contract.registerSymbol(this.symbol);
      await expectRevert(
        this.contract.activateSymbol(
          this.symbol
        ),
        "Symbol cannot be activated when oracle address is not set"
      );
      var symbolActive = await this.contract.checkSymbolActive(this.symbol);
      assert.equal(symbolActive, false);
    });
  });
  describe("Symbol is being deactivated", async () => {
    beforeEach( async () => {
      this.symbol = "symbol001";
      this.address = "0xA9F441A487754E6B27BA044A5A8EB2EEC77F6B92"
      this.contract = await Contract.new({ from: this.owner });
      await this.contract.registerSymbol(this.symbol);
      await this.contract.setOracle(this.symbol, this.address)
      await this.contract.activateSymbol(this.symbol)
    });
    it("symbol is inactive", async () => {
      await this.contract.deactivateSymbol(this.symbol)
      var infoMap = await this.contract.symbolInfoMap(this.symbol)
      assert.equal(
        infoMap.active,
        false
      );
      var symbolActive = await this.contract.checkSymbolActive(this.symbol);
      assert.equal(
        symbolActive,
        false
      );
    });
    it("symbol must exist", async () => {
      await expectRevert(
        this.contract.deactivateSymbol("bad_symbol"),
        "Symbol does not exist"
      );
    });
    it("cannot be done by non-owners", async () => {
      await expectRevert(
        this.contract.deactivateSymbol(
          this.symbol,
          { from: this.other }
        ),
        "Ownable: caller is not the owner"
      );
      var symbolActive = await this.contract.checkSymbolActive(this.symbol);
      assert.equal(symbolActive, true);
    });
 
  });
});
