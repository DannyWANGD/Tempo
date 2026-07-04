import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmBin = isWindows ? "npm.cmd" : "npm";
const electronBin = isWindows ? "electron.cmd" : "electron";
const viteUrl = "http://127.0.0.1:5173";

const children = new Set();

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: isWindows,
    ...options
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  child.on("error", (error) => {
    console.error(`Failed to start ${command}:`, error);
    cleanup();
    process.exit(1);
  });
  return child;
}

function cleanup() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

const vite = run(npmBin, ["exec", "--", "vite"]);

async function waitForVite() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(viteUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Vite dev server did not start.");
}

await waitForVite();

const electron = run(npmBin, ["exec", "--", electronBin, "."], {
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: viteUrl
  }
});

electron.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
