# earthstar/rich-threads-layer

An Earthstar layer for richly-formatted threaded discussion, with extras to help
drafting and tracking of threads.

## Threads

- Thread roots, represented by documents containing markdown
- Thread roots may have many replies, represented by documents containing
  markdown

## Drafts

- Drafts for many thread roots, represented by documents containing markdown
- A single draft reply per thread root, represented by a document containing
  markdown

## Unread tracking

- Tracking of where you have read up to per thread, represented by a document
  containing a timestamp.

---

## Project structure

This project uses a structure intended to make it easy to author and use from
different JS runtimes. It does not use bare specifiers for imports (e.g.
`import $ from "jquery";`).

- `src` - project code, vanilla typescript files.
- `scripts` - contains a script for building the NPM package
- `npm` - an NPM package folder for distributing via NPM
- `deno` - contains a single `mod.ts` which reexports the project's `default`
  export

## Publishing

To build the NPM version of the project, run:

`deno run --allow-all scripts/build_npm.ts`

This will use esbuild to produce the different distributions for the NPM
package.

After that, change directory to `npm` and run `npm publish`. Before publishing,
the project's type declarations will be created.
