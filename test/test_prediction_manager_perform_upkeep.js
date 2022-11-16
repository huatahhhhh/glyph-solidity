const BN = require('bn.js');
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
const BTC_PRICE = new BN(1648680000000);
const BTC_TIMESTAMP = new BN(1668445371);

function getUtcSeconds(){
  const now = new Date(); 
  const utcMilllisecondsSinceEpoch = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const utcSecondsSinceEpoch = Math.round(utcMilllisecondsSinceEpoch / 1000);
  return utcSecondsSinceEpoch;
}

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
  async function createPrediction(predictionContract, forUser, predTimestamp, duration, direction){
      await predictionContract.createPrediction(
        forUser,
        predTimestamp,
        "BTC",
        direction,
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
  });

  async function assertNothingHappens(contract, userAddress, contractCallback){
    // assert that number of predictions and user score did not change
    var numPredictionsBefore = await contract.numLivePredictions();
    var userScoreBefore = await contract.userScore(userAddress);
    await contractCallback();
    var numPredictionsAfter = await contract.numLivePredictions();
    var userScoreAfter = await contract.userScore(userAddress);

    assert.equal(numPredictionsBefore.toString(), numPredictionsAfter.toString());
    for (let i=0; i<5; i++){
      assert.equal(userScoreBefore[i].toString(), userScoreAfter[i].toString());
    }
  }

  describe("When there are no predictions..", async () => {
    it("nothing happens", async () => {
      var performData = web3.eth.abi.encodeParameter('uint[2]', ['0', '1']);
      await assertNothingHappens(this.contract, this.predictFor, async () => {
        await this.contract.performUpkeep(performData);
      });
    });
  });
  describe("When there are predictions..", async () => {
    beforeEach( async () => {
      // ready SHORT prediction
      await createPrediction(this.contract, this.predictFor, this.predictAt, time.duration.days(100), false);
      // expired prediction
      await createPrediction(this.contract, this.predictFor, this.predictAt, time.duration.days(40), true);
      // pending prediction
      await createPrediction(this.contract, this.predictFor, this.predictAt, time.duration.days(1000), true);
      // ready LONG prediction
      await createPrediction(this.contract, this.predictFor, this.predictAt, time.duration.days(100), true);
 

      // fast forward to point into the future for ready prediction
      await time.increaseTo(this.predictAt.add(time.duration.days(101)));
      await this.priceFeedContract.updateTimeStamp();
    });
    describe("When prediction is not expired and expired performData called..", async () => {
      it("nothing happens", async () => {
        var performData0 = web3.eth.abi.encodeParameter('uint[2]', ['0', '0']);
        var performData2 = web3.eth.abi.encodeParameter('uint[2]', ['0', '2']);
        var performData3 = web3.eth.abi.encodeParameter('uint[2]', ['0', '3']);
        await assertNothingHappens(this.contract, this.predictFor, async () => {
          await this.contract.performUpkeep(performData0);
        });
        await assertNothingHappens(this.contract, this.predictFor, async () => {
          await this.contract.performUpkeep(performData2);
        });
        await assertNothingHappens(this.contract, this.predictFor, async () => {
          await this.contract.performUpkeep(performData3);
        });
      });
    });
    describe("When prediction is not ready..", async () => {
      it("nothing happens", async () => {
        var performData1 = web3.eth.abi.encodeParameter('uint[2]', ['1', '1']);
        var performData2 = web3.eth.abi.encodeParameter('uint[2]', ['1', '2']);
        await assertNothingHappens(this.contract, this.predictFor, async () => {
          await this.contract.performUpkeep(performData2);
        });
        await assertNothingHappens(this.contract, this.predictFor, async () => {
          await this.contract.performUpkeep(performData1);
        });
      });
    });
    describe("When prediction is expired..", async () => {
      var numPredictionsBefore;
      var userScoreBefore;
      var numPredictionsAfter;
      var userScoreAfter;
      beforeEach( async() => {
        numPredictionsBefore = await this.contract.numLivePredictions();
        userScoreBefore = await this.contract.userScore(this.predictFor);

        var performData3 = web3.eth.abi.encodeParameter('uint[2]', ['0', '1']);

        await this.contract.performUpkeep(performData3);
        numPredictionsAfter = await this.contract.numLivePredictions();
        userScoreAfter = await this.contract.userScore(this.predictFor);
      });
      it("livePrediction: length decreases by 1", async ()=> {
        assert.equal(
          numPredictionsBefore.sub(new BN(1)).toString(),
          numPredictionsAfter.toString(),
        );
      });
      it("User Score: num_pending decreases by 1", async ()=> {
        assert.equal(
          new BN(userScoreBefore["num_pending"])
          .sub(new BN(1))
          .toString(),
          new BN(userScoreAfter["num_pending"])
          .toString()
        );
      });
      it("User Score: num_completed remains unchanged", async ()=> {
        assert.equal(
          new BN(userScoreBefore["num_completed"])
          .toString(),
          new BN(userScoreAfter["num_completed"])
          .toString()
        );
      });
      it("User Score: num_correct remains unchanged", async () => {
        assert.equal(
          new BN(userScoreBefore["num_correct"])
          .toString(),
          new BN(userScoreAfter["num_correct"])
          .toString()
        );
      });
      it("User Score: avg return is unchanged", async () => {
        assert.equal(
          userScoreBefore["avg_return"],
          userScoreAfter["avg_return"]
        );
      });
      it("User Score: num_error increases by 1", async () => {
        assert.equal(
          new BN(userScoreBefore["num_error"])
          .add(new BN(1))
          .toString(),
          new BN(userScoreAfter["num_error"])
          .toString()
        );
      });
    });
    describe("When prediction is ready..", async () => {
      describe("When price increases by 50 percent", async () => {
        beforeEach( async () => {
          var newPrice = BTC_PRICE
                          .mul(new BN(3))
                          .div(new BN(2));
          await this.priceFeedContract.setPrice(newPrice);
        });
        describe("When prediction is long", async() => {
          var numPredictionsBefore;
          var userScoreBefore;
          var numPredictionsAfter;
          var userScoreAfter;
          beforeEach( async() => {
            numPredictionsBefore = await this.contract.numLivePredictions();
            userScoreBefore = await this.contract.userScore(this.predictFor);

            var performData3 = web3.eth.abi.encodeParameter('uint[2]', ['1', '3']);

            await this.contract.performUpkeep(performData3);
            numPredictionsAfter = await this.contract.numLivePredictions();
            userScoreAfter = await this.contract.userScore(this.predictFor);
          });
          it("livePrediction: length decreases by 1", async ()=> {
            assert.equal(
              numPredictionsBefore.sub(new BN(1)).toString(),
              numPredictionsAfter.toString(),
            );
          });
          it("User Score: num_pending decreases by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_pending"])
              .sub(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_pending"])
              .toString()
            );
          });
          it("User Score: num_completed increase by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_completed"])
              .add(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_completed"])
              .toString()
            );
          });
          it("User Score: num_correct increase by 1", async () => {
            assert.equal(
              new BN(userScoreBefore["num_correct"])
              .add(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_correct"])
              .toString()
            );
          });
          it("User Score: avg return is 0.5 (decimals=8)", async () => {
            assert.equal(userScoreBefore["avg_return"], "0");
            assert.equal(userScoreAfter["avg_return"], "50000000");
          });
          it("User Score: num_error remains unchanged", async () => {
            assert.equal(
              new BN(userScoreBefore["num_error"])
              .toString(),
              new BN(userScoreAfter["num_error"])
              .toString()
            );
          });
        });
        describe("When prediction is short", async() => {
          var numPredictionsBefore;
          var userScoreBefore;
          var numPredictionsAfter;
          var userScoreAfter;
          beforeEach( async() => {
            numPredictionsBefore = await this.contract.numLivePredictions();
            userScoreBefore = await this.contract.userScore(this.predictFor);

            var performData3 = web3.eth.abi.encodeParameter('uint[2]', ['1', '0']);

            await this.contract.performUpkeep(performData3);
            numPredictionsAfter = await this.contract.numLivePredictions();
            userScoreAfter = await this.contract.userScore(this.predictFor);
          });
          it("livePrediction: length decreases by 1", async ()=> {
            assert.equal(
              numPredictionsBefore.sub(new BN(1)).toString(),
              numPredictionsAfter.toString(),
            );
          });
          it("User Score: num_pending decreases by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_pending"])
              .sub(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_pending"])
              .toString()
            );
          });
          it("User Score: num_completed increase by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_completed"])
              .add(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_completed"])
              .toString()
            );
          });
          it("User Score: num_correct remains unchanged", async () => {
            assert.equal(
              new BN(userScoreBefore["num_correct"])
              .toString(),
              new BN(userScoreAfter["num_correct"])
              .toString()
            );
          });
          it("User Score: avg return is -0.5 (decimals=8)", async () => {
            assert.equal(userScoreBefore["avg_return"], "0");
            assert.equal(userScoreAfter["avg_return"], "-33333333");
          });
          it("User Score: num_error remains unchanged", async () => {
            assert.equal(
              new BN(userScoreBefore["num_error"])
              .toString(),
              new BN(userScoreAfter["num_error"])
              .toString()
            );
          });
        });
      });
      describe("When price decreased to 80%", async () => {
        beforeEach( async () => {
          var newPrice = BTC_PRICE
                          .mul(new BN(4))
                          .div(new BN(5));
          await this.priceFeedContract.setPrice(newPrice);
        });
        describe("When prediction is long", async() => {
          var numPredictionsBefore;
          var userScoreBefore;
          var numPredictionsAfter;
          var userScoreAfter;
          beforeEach( async() => {
            numPredictionsBefore = await this.contract.numLivePredictions();
            userScoreBefore = await this.contract.userScore(this.predictFor);

            var performData3 = web3.eth.abi.encodeParameter('uint[2]', ['1', '3']);

            await this.contract.performUpkeep(performData3);
            numPredictionsAfter = await this.contract.numLivePredictions();
            userScoreAfter = await this.contract.userScore(this.predictFor);
          });
          it("livePrediction: length decreases by 1", async ()=> {
            assert.equal(
              numPredictionsBefore.sub(new BN(1)).toString(),
              numPredictionsAfter.toString(),
            );
          });
          it("User Score: num_pending decreases by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_pending"])
              .sub(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_pending"])
              .toString()
            );
          });
          it("User Score: num_completed increase by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_completed"])
              .add(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_completed"])
              .toString()
            );
          });
          it("User Score: num_correct remains unchanged", async () => {
            assert.equal(
              new BN(userScoreBefore["num_correct"])
              .toString(),
              new BN(userScoreAfter["num_correct"])
              .toString()
            );
          });
          it("User Score: avg return is -0.2 decimals=8)", async () => {
            assert.equal(userScoreBefore["avg_return"], "0");
            assert.equal(userScoreAfter["avg_return"], "-20000000");
          });
          it("User Score: num_error remains unchanged", async () => {
            assert.equal(
              new BN(userScoreBefore["num_error"])
              .toString(),
              new BN(userScoreAfter["num_error"])
              .toString()
            );
          });
        });
        describe("When prediction is short", async() => {
          var numPredictionsBefore;
          var userScoreBefore;
          var numPredictionsAfter;
          var userScoreAfter;
          beforeEach( async() => {
            numPredictionsBefore = await this.contract.numLivePredictions();
            userScoreBefore = await this.contract.userScore(this.predictFor);

            var performData3 = web3.eth.abi.encodeParameter('uint[2]', ['1', '0']);

            await this.contract.performUpkeep(performData3);
            numPredictionsAfter = await this.contract.numLivePredictions();
            userScoreAfter = await this.contract.userScore(this.predictFor);
          });
          it("livePrediction: length decreases by 1", async ()=> {
            assert.equal(
              numPredictionsBefore.sub(new BN(1)).toString(),
              numPredictionsAfter.toString(),
            );
          });
          it("User Score: num_pending decreases by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_pending"])
              .sub(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_pending"])
              .toString()
            );
          });
          it("User Score: num_completed increase by 1", async ()=> {
            assert.equal(
              new BN(userScoreBefore["num_completed"])
              .add(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_completed"])
              .toString()
            );
          });
          it("User Score: num_correct increases by 1", async () => {
            assert.equal(
              new BN(userScoreBefore["num_correct"])
              .add(new BN(1))
              .toString(),
              new BN(userScoreAfter["num_correct"])
              .toString()
            );
          });
          it("User Score: avg return is 0.25 decimals=8)", async () => {
            assert.equal(userScoreBefore["avg_return"], "0");
            assert.equal(userScoreAfter["avg_return"], "25000000");
          });
          it("User Score: num_error remains unchanged", async () => {
            assert.equal(
              new BN(userScoreBefore["num_error"])
              .toString(),
              new BN(userScoreAfter["num_error"])
              .toString()
            );
          });
        });
      });
    });
  });
});
