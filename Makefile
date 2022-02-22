.PHONY: npm test

test:
	deno test src

npm:
	deno run --allow-all scripts/build_npm.ts $(VERSION)