import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

if (args[0] === "dev") {
	args.splice(1, 0, "--config", "src-tauri/tauri.dev.conf.json");
}

const result = spawnSync("tauri", args, {
	stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
