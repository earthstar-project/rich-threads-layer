import { Earthstar } from "../deps.ts";

export type Post = {
  doc: Earthstar.Doc;
  firstPosted: Date;
};

export type Thread = {
  root: Post;
  replies: Post[];
};

export type RootPathExtractedVars = { rootTimestamp: string; opPubKey: string };
export type ReplyPathExtractedVars = RootPathExtractedVars & {
  replyTimestamp: string;
  replierPubkey: string;
};
export type ThreadDraftPathExtractedVars = {
  pubKey: string;
  timestamp: string;
};
