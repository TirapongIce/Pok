import { spawn } from "node:child_process";

const processes = [
  {
    name: "server",
    command: "npm",
    args: ["run", "dev", "--prefix", "server"]
  },
  {
    name: "client",
    command: "npm",
    args: ["run", "dev", "--prefix", "client"]
  }
];

const children = new Set();

function startProcess({ name, command, args }) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
  });

  children.add(child);

  child.on("exit", (code, signal) => {
    console.log(`[${name}] exited with code ${code ?? "null"} signal ${signal ?? "null"}`);
    children.delete(child);
    shutdown(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start`, error);
    shutdown(1);
  });
}

function shutdown(exitCode) {
  for (const child of Array.from(children)) {
    child.kill();
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  shutdown(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  shutdown(0);
});

processes.forEach(startProcess);
