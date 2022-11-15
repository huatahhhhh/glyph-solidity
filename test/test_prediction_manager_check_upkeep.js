const { expectRevert, time } = require("@openzeppelin/test-helpers");
const PredictionManagerContract = artifacts.require("PredictionManager");
const PriceFeedManagerContract = artifacts.require("TestPriceFeedManager");

const CHAINLINK_BTC_FEED="0x007A22900a3B98143368Bd5906f8E17e9867581b";
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
const ONE_HOUR = 60*60;
const ONE_DAY = 24* ONE_HOUR;
const ONE_MONTH = 30 * ONE_DAY
const THREE_MONTHS = ONE_MONTH * 3 // 3 months
const TIME_TOL = 7*ONE_DAY; // 1 week

//Result as of Block 29151538
const BTC_PRICE = 1648680000000;
const BTC_TIMESTAMP = 1668445371;

contract('PredictionManager', ([owner, other1, upkeepChecker]) => {
  async function setUpPriceFeedContract(vm){
    /* Set up test price feed contract and activate btc symbol
     * */
    vm.priceFeedContract = await PriceFeedManagerContract.new();
    await vm.priceFeedContract.registerSymbol("BTC");
    await vm.priceFeedContract.setOracle("BTC", CHAINLINK_BTC_FEED);
    await vm.priceFeedContract.activateSymbol("BTC");
    await vm.priceFeedContract.setPrice(BTC_PRICE);
    await vm.priceFeedContract.setTimeStamp(BTC_TIMESTAMP);

    // tests if tester functions are present
    var result = await vm.priceFeedContract.getSymbolLatestPrice("BTC");
    var price = result[0].toNumber();
    var timestamp = result[1].toNumber();
    assert.equal(price, BTC_PRICE);
    assert.equal(timestamp, BTC_TIMESTAMP);
  }
  async function createPrediction(predictionContract, forUser, predTimestamp, duration){
      await predictionContract.createPrediction(
        forUser,
        predTimestamp,
        "BTC",
        false, // short
        duration,
        "ipfsCID", 
      );
  }

  function unpackCheckUpkeepResults(result){
    var upkeepNeeded = result[0];
    var performData = web3.eth.abi.decodeParameter('uint[2]', result[1]);
    return [upkeepNeeded, performData[0], performData[1]];
  }

  before( async () => {
    this.owner = owner;
    this.other1 = other1;
    this.upkeepChecker = upkeepChecker;
    await setUpPriceFeedContract(this);
    await this.priceFeedContract.setPrice(BTC_PRICE);
  });

  beforeEach( async () => {
    // create contract with prediction
    this.contract = await PredictionManagerContract.new(
      this.priceFeedContract.address,
      TIME_TOL,
      { from: this.owner }
    );
    await this.priceFeedContract.setPrice(BTC_PRICE);
    await this.priceFeedContract.updateTimeStamp();
 
    // add user
    this.predictFor = this.other1;
    await this.contract.addUser(this.predictFor);

    // set price feed to block latest time
    this.predictAt = await time.latest();
    await this.priceFeedContract.updateTimeStamp();

    await createPrediction(this.contract, this.predictFor, this.predictAt, THREE_MONTHS*3); // additional prediction
    // make a prediction now with 3 months in advance
    await createPrediction(this.contract, this.predictFor, this.predictAt, THREE_MONTHS); // prediction of interest
  });

  describe("When there are no predictions..", async () => {
    beforeEach( async () => {
      this.contract = await PredictionManagerContract.new(
        this.priceFeedContract.address,
        TIME_TOL,
        { from: this.owner }
      );
    });
    it("nothing happens", async() => {
      const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
      [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
      assert.equal(upkeepNeeded, false);
      assert.equal(state, 0);
      assert.equal(indx, 0);
    });
  });
  describe("When symbol is inactive..", async () => {
    beforeEach( async () => {
      await this.priceFeedContract.deactivateSymbol("BTC");
    });
    afterEach( async () => {
      await this.priceFeedContract.activateSymbol("BTC");
    });
 
    describe("When block timestamp is before prediction expiry + tolerance..", async () => {
      beforeEach( async () => {
        // prediction is ready after third month
        await time.increaseTo(this.predictAt.add(time.duration.days(60)));
      });

      it("nothing happens", async() => {
        const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
        [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
        assert.equal(upkeepNeeded, false);
        assert.equal(state, 0);
        assert.equal(indx, 0);
      });
    });
    describe("When block timestamp is after prediction expiry + tolerance..", async () => {
      beforeEach( async () => {
        await time.increaseTo(this.predictAt.add(time.duration.days(100)));
      });
      describe("When prediction user is inactive", async () => {
        beforeEach( async () => {
          await this.contract.removeUser(this.predictFor);
        });
        afterEach( async () => {
          await this.contract.addUser(this.predictFor);
        });
        it("prediction expires", async() => {
          const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
          [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
          assert.equal(upkeepNeeded, true);
          assert.equal(state, 0);
          assert.equal(indx, 1);
        })
      });
      describe("When prediction user is active", async () => {
        it("prediction expires", async() => {
          const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
          [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
          assert.equal(upkeepNeeded, true);
          assert.equal(state, 0);
          assert.equal(indx, 1);
        })
      });
    });
  });
  describe("When symbol is active..", async () => {
    beforeEach( async () => {
      await this.priceFeedContract.activateSymbol("BTC");
    });
     describe("When latest price feed is before prediction expiry", async () => {
       beforeEach( async () => {
         await time.increaseTo(this.predictAt.add(time.duration.days(10)));
         await this.priceFeedContract.updateTimeStamp()
       });
        it("nothing happens", async() => {
          const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
          [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
          assert.equal(upkeepNeeded, false);
          assert.equal(state, 0);
          assert.equal(indx, 0);
        })
    });
    describe("When latest price feed is between prediction expiry and added tolerance", async () => {
      beforeEach( async () => {
        await time.increaseTo(this.predictAt.add(time.duration.days(92)));
        await this.priceFeedContract.updateTimeStamp()
      });
      describe("When prediction user is inactive", async () => {
        beforeEach( async () => {
          await this.contract.removeUser(this.predictFor);;
        });
        it("nothing happens", async() => {
          const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
          [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
          assert.equal(upkeepNeeded, false);
          assert.equal(state, 0);
          assert.equal(indx, 0);
        })
      });
      describe("When prediction user is active", async () => {
        it("prediction is ready", async() => {
          const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
          [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
          assert.equal(upkeepNeeded, true);
          assert.equal(state, 1);
          assert.equal(indx, 1);
        })
      });
    });
    describe("When latest price feed after prediction expiry + tolerance", async () => {
      beforeEach( async () => {
        await time.increaseTo(this.predictAt.add(time.duration.days(100)));
        await this.priceFeedContract.updateTimeStamp()
      });
      it("prediction expires", async() => {
          const result = await this.contract.checkUpkeep([], { from : upkeepChecker });
          [upkeepNeeded, state, indx]  = unpackCheckUpkeepResults(result);
          assert.equal(upkeepNeeded, true);
          assert.equal(state, 0);
          assert.equal(indx, 1);
      })
    });
  });
});
