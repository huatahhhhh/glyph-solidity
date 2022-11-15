const HDWalletProvider = require('@truffle/hdwallet-provider');
const fs = require('fs');
const mnemonic_fork = fs.readFileSync(".fork.secret").toString().trim();
const mnemonic_mumbai = fs.readFileSync(".mumbai.secret").toString().trim();
const mnemonic = fs.readFileSync(".ganache.secret").toString().trim();

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8546,
      network_id: "*", // Match any network id
      gas: 6721975,
      networkCheckTimeout: 50000
    },
    gcli: {
      provider: () => new HDWalletProvider(mnemonic, `http://127.0.0.1:8545`),
      network_id: "*", // Match any network id
      gas: 5000000,
      networkCheckTimeout: 50000
    },
    lfork: {
      provider: () => new HDWalletProvider(mnemonic_fork, `http://127.0.0.1:9393`),
      network_id: "80001", // Match any network id
      gas: 30000000
    },
    mumbai_testnet: {
      provider: () => new HDWalletProvider(mnemonic_mumbai, `https://polygon-mumbai.infura.io/v3/a097978523884dd59b3bdbc9781f8de9`),
      network_id: "*", // Match any network id
      gas: 5000000
    }
  },
  compilers: {
    solc: {
      version: "0.8.17",
      settings: {
        optimizer: {
          enabled: true, // Default: false
          runs: 200      // Default: 200
        },
      }
    }
  }
};
