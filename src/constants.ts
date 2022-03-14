// /letterbox/rootthread:123~@cinn.xxxx/root.md

// /letterbox/thread:123--@cinn.xxxx/reply:124~@gwil.xxx.md
// /letterbox/thread:123--@cinn.xxxx/reply:125~@gwil.xxx.md
// /letterbox/thread:123--@cinn.xxxx/reply:126~@gwil.xxx.md

// REad up to

// /letterbox/thread:123--@cinn.xxxx/read:~@gwil.xxx/timestamp.txt

// Reply draft

// /letterbox/drafts/~{pubkey}/thread:{timestamp}--{opPubkey}/draft.md

// Thread drafts

// letterbox/drafts/~{pubkey}/{timestamp}.md

export const APP_NAME = "letterbox";
export const threadRootTemplate =
  `/${APP_NAME}/rootthread:{rootTimestamp}~{opPubKey}/root.md`;
export const threadReplyTemplate =
  `/${APP_NAME}/thread:{rootTimestamp}--{opPubKey}/reply:{replyTimestamp}~{replierPubKey}`;
export const threadDraftTemplate =
  `/${APP_NAME}/drafts/~{pubKey}/{timestamp}.md`;
