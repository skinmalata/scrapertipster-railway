globalThis.__alderHost = {
  args: process.argv.slice(2),
  exit(code) {
    process.exit(code);
  },
};
await import("./dist/main.mjs");