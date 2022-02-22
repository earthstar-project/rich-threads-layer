import { build } from "https://deno.land/x/dnt@0.16.1/mod.ts";

await Deno.remove("npm", { recursive: true }).catch((_) => {});

await build({
  entryPoints: [
    "./mod.ts",
  ],
  outDir: "./npm",
  shims: {
    deno: {
      test: "dev",
    },
    timers: true,
  },
  mappings: {
    "https://deno.land/x/earthstar@v7.1.0/mod.ts": {
      name: "earthstar",
      version: "7.1.0",
    },
  },
  package: {
    // package.json properties
    name: "@earthstar-project/rich-threads-layer",
    private: false,
    version: Deno.args[0],
    description: "Long-form rich formatted threads for Earthstar",
    license: "LGPL-3.0-only",
    homepage: "https://earthstar-project.org",
    "funding": {
      "type": "opencollective",
      "url": "https://opencollective.com/earthstar",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/earthstar-project/rich-threads-layer.git",
    },
    bugs: {
      url: "https://github.com/earthstar-project/rich-threads-layer/issues",
    },
    devDependencies: {
      "@types/express": "4.17.2",
      "@types/node-fetch": "2.5.12",
    },
  },
});

// post build steps
Deno.copyFileSync("LICENSE", "npm/LICENSE");
Deno.copyFileSync("README.md", "npm/README.md");
