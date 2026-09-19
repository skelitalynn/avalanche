import { readFile, writeFile } from "node:fs/promises";
const names = ["SituationFactory", "SituationAgreement", "TestUSDC"];
const out = [];
for (const name of names) {
  const a = JSON.parse(
    await readFile(
      `contracts/artifacts/contracts/src/${name}.sol/${name}.json`,
      "utf8",
    ),
  );
  out.push(`export const ${name}Abi = ${JSON.stringify(a.abi)} as const;`);
}
await writeFile(
  "packages/shared/src/abi.ts",
  "// Generated from Hardhat artifacts; do not hand-edit.\n" +
    out.join("\n") +
    "\n",
);
