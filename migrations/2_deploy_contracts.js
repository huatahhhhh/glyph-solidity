//const SymbolManager = artifacts.require("SymbolManager");
const TrackerPriceFeed = artifacts.require("TrackerPriceFeed");

module.exports = function(deployer) {
  //deployer.deploy(SymbolManager);
  deployer.deploy(TrackerPriceFeed);
};
