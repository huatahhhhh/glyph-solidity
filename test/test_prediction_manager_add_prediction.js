const BN = require('bn.js');
const { time, expectRevert } = require("@openzeppelin/test-helpers");
const {ZERO_ADDRESS} = require("@openzeppelin/test-helpers/src/constants");
const PredictionManagerContract = artifacts.require("PredictionManager");
const PriceFeedManagerContract = artifacts.require("TestPriceFeedManager");

const CHAINLINK_BTC_FEED="0x007A22900a3B98143368Bd5906f8E17e9867581b";
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
const TOL = 60*60*24;
const TOL_BN = time.duration.days(1);

//Result as of Block 29151538
const BTC_PRICE = 1648680000000;
const TIMESTAMP = 1668445371;

contract('PredictionManager', ([owner, other1, other2]) => {
  before( async () => {
    this.owner = owner;
    this.other1 = other1;
    this.other2 = other2;

    this.priceFeedContract = await PriceFeedManagerContract.new();
    await this.priceFeedContract.registerSymbol("BTC");
    await this.priceFeedContract.setOracle("BTC", CHAINLINK_BTC_FEED);
    await this.priceFeedContract.activateSymbol("BTC");
    await this.priceFeedContract.setTimeStamp(TIMESTAMP);
    await this.priceFeedContract.setPrice(BTC_PRICE);
    var result = await this.priceFeedContract.getSymbolLatestPrice("BTC");
    var price = result[0].toNumber();
    var timestamp = result[1].toNumber();
    assert.equal(price, BTC_PRICE);
  });

  beforeEach( async () => {
    this.contract = await PredictionManagerContract.new(
      this.priceFeedContract.address,
      TOL, 
      { from: this.owner }
    );
    await this.priceFeedContract.updateTimeStamp();
    this.now = await time.latest();
  });
  describe("When non-owner creates a prediction", async () => {
    it("prediction is not saved", async () => {
      await this.contract.addUser(this.other1);
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          this.now,
          "BTC",
          true, // LONG
          60*60*24*90, // 3 months
          "ipfsCID", 
          { from: this.other2 }
        ),
        "Ownable: caller is not the owner"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
  describe("When owner creates a prediction for invalid user", async () => {
    it("prediction is not saved", async () => {
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          this.now,
          "BTC",
          true, // LONG
          60*60*24*90, // 3 months
          "ipfsCID", 
          { from: this.owner }
        ),
        "Not allowed to make predictions for non-authorized users"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
  describe("When owner creates a prediction for inactive symbol", async () => {
    it("prediction is not saved", async () => {
      await this.contract.addUser(this.other1);
      await this.priceFeedContract.registerSymbol("XYY");
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          this.now,
          "XYY",
          true, // LONG
          60*60*24*90, // 3 months
          "ipfsCID", 
          { from: this.owner }
        ),
        "Symbol is not recognized or inactive"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
  describe("When owner creates a prediction for non-registered symbol", async () => {
    it("prediction is not saved", async () => {
      await this.contract.addUser(this.other1);
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          this.now,
          "XYV",
          true, // LONG
          60*60*24*90, // 3 months
          "ipfsCID", 
          { from: this.owner }
        ),
        "Symbol does not exist"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
 
  describe("When owner creates a prediction and prediction timestamp is too early", async () => {
    it("prediction is not saved", async () => {
      //here/
      //
      var earlier = this.now.sub(TOL_BN.mul(new BN(2)));
      await this.contract.addUser(this.other1);
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          earlier,
          "BTC",
          true, // LONG
          60*60*24*90, // 3 months
          "ipfsCID", 
          { from: this.owner }
        ),
        "Block timestamp and prediction timestamp is beyond tolerance"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
  describe("When owner creates a prediction and prediction timestamp is too late", async () => {
    it("prediction is not saved", async () => {

      var later = this.now.add(TOL_BN.mul(new BN(2)));
      await this.contract.addUser(this.other1);
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          later,
          "BTC",
          true, // LONG
          60*60*24*90, // 3 months
          "ipfsCID", 
          { from: this.owner }
        ),
        "Block timestamp and prediction timestamp is beyond tolerance"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
  describe("When owner creates a prediction and prediction time horizon is too short", async () => {
    it("prediction is not saved", async () => {
      await this.contract.addUser(this.other1);
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          this.now,
          "BTC",
          true, // LONG
          TOL, // too short
          "ipfsCID", 
          { from: this.owner }
        ),
        "Prediction duration needs to be more than 1 * tolerance"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
   describe("When owner creates a prediction and latest price feed was not updated beyond tolerance", async () => {
    it("prediction is not saved", async () => {
      var diff = new BN(2).mul(TOL_BN);
      var earlier = this.now.sub(diff);
      await this.priceFeedContract.setTimeStamp(earlier);
      await this.contract.addUser(this.other1);
      await expectRevert(
        this.contract.createPrediction(
          this.other1,
          this.now,
          "BTC",
          true, // LONG
          60*60*24*90, // 3 months
          "ipfsCID", 
          { from: this.owner }
        ),
				"Price feed timestamp and prediction time is beyond tolerance"
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 0);
    });
  });
 
  describe("When owner creates a prediction", async () => {
    it("prediction is saved with latest price feed", async () => {
      var predTimeStamp = this.now.toString();
      await this.contract.addUser(this.other1);
      await this.priceFeedContract.setTimeStamp(this.now);
      await this.contract.createPrediction(
        this.other1,
        predTimeStamp,
        "BTC",
        false, // short
        60*60*24*90, // 3 months
        "ipfsCID", 
        { from: this.owner }
      );
      var num_pred = await this.contract.getNumLivePredictions();
      assert.equal(num_pred, 1);

      var pred = await this.contract.livePredictions(0);
      assert.equal(pred['user'], this.other1);
      assert.equal(pred['predTimestamp'], predTimeStamp);
      assert.equal(pred['symbol'], "BTC");
      assert.equal(pred['predDirection'], false);
      assert.equal(pred['initialPrice']['price'], BTC_PRICE);
      assert.equal(pred['initialPrice']['timestamp'], this.now.toString());
      assert.equal(pred['finalPrice']['price'], 0);
      assert.equal(pred['finalPrice']['timestamp'], 0);
    });
  });
});
