async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const Factory = await ethers.getContractFactory("CustodyRegistry");
  const registry = await Factory.deploy();
  await registry.deployed();
  const backendKey = process.env.BACKEND_PRIVATE_KEY;
  if (!backendKey) throw new Error("BACKEND_PRIVATE_KEY is required to authorize the API anchorer");
  const backend = new ethers.Wallet(backendKey);
  const grant = await registry.setAnchorer(backend.address, true);
  await grant.wait();
  console.log("\nCustodyRegistry deployed:", registry.address);
  console.log("Authorized API anchorer:", backend.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
