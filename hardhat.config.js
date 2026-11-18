require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");

// Hardhat ships solc-js 0.8.15 as a dependency; use it offline.
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _hre, runSuper) => {
  if (solcVersion === "0.8.15") {
    return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs: true, version: solcVersion, longVersion: require("solc").version() };
  }
  return runSuper();
});

module.exports = {
  solidity: "0.8.15",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
};

