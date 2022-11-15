//const SymbolManager = artifacts.require("SymbolManager");
const PriceFeedManager = artifacts.require("PriceFeedManager");
const PredictionManager = artifacts.require("PredictionManager");

module.exports = async function(deployer) {
  await deployer.deploy(PriceFeedManager);
  await deployer.deploy(PredictionManager, PriceFeedManager.address, 60*60*24);
};
