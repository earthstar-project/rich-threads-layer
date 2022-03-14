import { Earthstar } from "../deps.ts";
import { APP_NAME } from "./constants.ts";

export function isRootPost(doc: Earthstar.Doc) {
  return doc.path.startsWith(`/${APP_NAME}/rootthread`);
}

export function onlyDefined<T>(val: T | undefined): val is T {
  if (val) {
    return true;
  }

  return false;
}
