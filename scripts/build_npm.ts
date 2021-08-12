import * as esbuild from "https://deno.land/x/esbuild@v0.12.13/mod.js";

const reverseImportMap: Record<string, string> = {
  "https://esm.sh/earthstar": "earthstar",
};

const reverseImportMapPlugin: esbuild.Plugin = {
  name: "reverseImportMap",
  setup(build) {
    build.onResolve({ filter: /.*?/ }, (args) => {
      if (reverseImportMap[args.path]) {
        return {
          path: reverseImportMap[args.path],
          namespace: args.path,
          external: true,
        };
      }

      return {};
    });
  },
};

const baseConfig = {
  entryPoints: ["./npm/index.ts"],
  bundle: true,
  external: ["earthstar", "earthstar-graph-db"],
  target: ["es2017"],
  plugins: [reverseImportMapPlugin],
};

const configs: esbuild.BuildOptions[] = [{
  ...baseConfig,
  outfile: "./npm/index.cjs",
  format: "cjs",
  platform: "node",
  conditions: ["node"],
}, {
  ...baseConfig,
  outfile: "./npm/index.mjs",
  format: "esm",
  platform: "node",
  conditions: ["node"],
}, {
  ...baseConfig,
  outfile: "./npm/index.js",
  format: "esm",
  conditions: ["browser"],
}];

await Promise.all(configs.map((config) => esbuild.build(config))).then(() => {
  Deno.exit();
})
  .catch((error) => {
    console.error(error);
    Deno.exit(1);
  });
