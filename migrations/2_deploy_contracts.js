//const SymbolManager = artifacts.require("SymbolManager");
const PriceFeedManager = artifacts.require("PriceFeedManager");
const UserManager = artifacts.require("UserManager");

module.exports = function(deployer) {
  deployer.deploy(PriceFeedManager);
  deployer.deploy(UserManager);
};
