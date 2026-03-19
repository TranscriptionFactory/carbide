import fs from "node:fs";
import { execSync } from "node:child_process";

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
const tag = `v${version}`;

const remoteRefs = execSync(`git ls-remote --tags origin refs/tags/${tag}`, {
  encoding: "utf8",
});
if (remoteRefs.trim()) {
  console.log(`Tag ${tag} already exists on remote, skipping.`);
  process.exit(0);
}

execSync(`git tag -f ${tag}`, { stdio: "inherit" });
execSync(`git push origin ${tag}`, { stdio: "inherit" });
console.log(`Tagged and pushed ${tag}`);
