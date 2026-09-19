import { defineConfig } from "hardhat/config";
export default defineConfig({
  paths: {
    sources: "./contracts/src",
    artifacts: "./contracts/artifacts",
    cache: "./contracts/cache",
  },
  solidity: {
    version: "0.8.30",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    local: { type: "edr-simulated", chainType: "l1", chainId: 31337 },
  },
});
