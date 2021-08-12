import {
  AuthorKeypair,
  Document,
  extractTemplateVariablesFromPath,
  isErr,
  IStorage,
  ValidationError,
  WriteResult,
} from "https://esm.sh/earthstar";

export type Post = {
  doc: Document;
  firstPosted: Date;
};

export type Thread = {
  root: Post;
  replies: Post[];
};

function isRootPost(doc: Document) {
  return doc.path.startsWith(`/${APP_NAME}/rootthread`);
}

const APP_NAME = "letterbox";

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

const threadRootTemplate =
  `/${APP_NAME}/rootthread:{rootTimestamp}~{opPubKey}/root.md`;
const threadReplyTemplate =
  `/${APP_NAME}/thread:{rootTimestamp}--{opPubKey}/reply:{replyTimestamp}~{replierPubKey}`;
const threadDraftTemplate = `/${APP_NAME}/drafts/~{pubKey}/{timestamp}.md`;

type RootPathExtractedVars = { rootTimestamp: string; opPubKey: string };
type ReplyPathExtractedVars = RootPathExtractedVars & {
  replyTimestamp: string;
  replierPubkey: string;
};
type ThreadDraftPathExtractedVars = {
  pubKey: string;
  timestamp: string;
};

function onlyDefined<T>(val: T | undefined): val is T {
  if (val) {
    return true;
  }

  return false;
}

export default class LetterboxLayer {
  _storage: IStorage;
  _user: AuthorKeypair | null;

  constructor(storage: IStorage, user: AuthorKeypair | null) {
    this._user = user;
    this._storage = storage;
  }

  getThreadRootTimestamp(rootDoc: Document): number {
    const { rootTimestamp } = extractTemplateVariablesFromPath(
      threadRootTemplate,
      rootDoc.path,
    ) as RootPathExtractedVars;

    return parseInt(rootTimestamp);
  }

  getPostTimestamp(postDoc: Document): number {
    const { replyTimestamp } = extractTemplateVariablesFromPath(
      threadReplyTemplate,
      postDoc.path,
    ) as ReplyPathExtractedVars;

    return parseInt(replyTimestamp);
  }

  _docToThreadRoot(rootDoc: Document): Post {
    const { rootTimestamp } = extractTemplateVariablesFromPath(
      threadRootTemplate,
      rootDoc.path,
    ) as RootPathExtractedVars;

    return {
      doc: rootDoc,
      firstPosted: new Date(parseInt(rootTimestamp) / 1000),
    };
  }

  _docToPost(postDoc: Document): Post {
    const { replyTimestamp } = extractTemplateVariablesFromPath(
      threadReplyTemplate,
      postDoc.path,
    ) as ReplyPathExtractedVars;

    return {
      doc: postDoc,
      firstPosted: new Date(parseInt(replyTimestamp) / 1000),
    };
  }

  _createRootDoc(
    content: string,
    deleteAfter?: number,
  ): string | ValidationError {
    if (!this._user) {
      return new ValidationError(
        "Couldn't create post document without a known user.",
      );
    }

    const timestamp = Date.now() * 1000;
    const path =
      `/${APP_NAME}/rootthread:${timestamp}~${this._user.address}/root.md`;

    const result = this._storage.set(this._user, {
      content,
      path,
      deleteAfter,
      format: "es.4",
    });

    return isErr(result) ? result : path;
  }

  _createReplyDoc(
    content: string,
    threadRootTimestamp: number,
    threadRootAuthor: string,
    deleteAfter?: number,
  ): string | ValidationError {
    if (!this._user) {
      return new ValidationError(
        "Couldn't create post document without a known user.",
      );
    }

    const timestamp = Date.now() * 1000;
    const path =
      `/${APP_NAME}/thread:${threadRootTimestamp}--${threadRootAuthor}/reply:${timestamp}~${this._user.address}.md`;

    const result = this._storage.set(this._user, {
      content,
      path,
      deleteAfter,
      format: "es.4",
    });

    return isErr(result) ? result : path;
  }

  getThreadTitle(thread: Thread): string | undefined {
    const { content } = thread.root.doc;

    const [firstLine] = content.split("\n");

    if (!firstLine || !firstLine.startsWith("# ")) {
      return undefined;
    }

    return firstLine.substring(2);
  }

  getThreads(): Thread[] {
    const threadRootDocs = this._storage.documents({
      pathStartsWith: `/${APP_NAME}/rootthread:`,
    });

    return threadRootDocs
      .map((rootDoc) => {
        const { rootTimestamp, opPubKey } = extractTemplateVariablesFromPath(
          threadRootTemplate,
          rootDoc.path,
        ) as RootPathExtractedVars;

        return this.getThread(parseInt(rootTimestamp), opPubKey);
      }).filter(
        onlyDefined,
      ).sort((aThread, bThread) => {
        const aLast = this.lastThreadItem(aThread);
        const bLast = this.lastThreadItem(bThread);

        return aLast.firstPosted < bLast.firstPosted ? 1 : -1;
      });
  }

  createThread(
    content: string,
    deleteAfter?: number,
  ): Thread | ValidationError {
    const maybePath = this._createRootDoc(content, deleteAfter);

    if (isErr(maybePath)) {
      console.error(maybePath);

      return maybePath;
    }

    if (!this._user) {
      return new ValidationError(
        "Couldn't create post document without a known user.",
      );
    }

    const doc = this._storage.getDocument(maybePath) as Document;

    const threadRoot = this._docToThreadRoot(doc);

    this.markReadUpTo(
      this.getThreadRootTimestamp(threadRoot.doc),
      threadRoot.doc.author,
      threadRoot.doc.timestamp,
    );

    return {
      root: threadRoot,
      replies: [],
    };
  }

  getThread(timestamp: number, authorPubKey: string): Thread | undefined {
    const threadRootDoc = this._storage.getDocument(
      `/${APP_NAME}/rootthread:${timestamp}~${authorPubKey}/root.md`,
    );

    if (!threadRootDoc) {
      return undefined;
    }

    const replyDocs = this._storage.documents({
      pathStartsWith: `/${APP_NAME}/thread:${timestamp}--${authorPubKey}`,
    });

    const replies = replyDocs.map(this._docToPost, this).filter(onlyDefined);

    return {
      root: this._docToThreadRoot(threadRootDoc),
      replies,
    };
  }

  createReply(
    threadRootTimestamp: number,
    threadRootAuthorPubKey: string,
    content: string,
    deleteAfter?: number,
  ): Post | ValidationError {
    const maybePath = this._createReplyDoc(
      content,
      threadRootTimestamp,
      threadRootAuthorPubKey,
      deleteAfter,
    );

    if (isErr(maybePath)) {
      console.error(maybePath);

      return maybePath;
    }

    if (!this._user) {
      return new ValidationError(
        "Couldn't create reply without a known user.",
      );
    }

    const replyDoc = this._storage.getDocument(maybePath) as Document;

    this.markReadUpTo(
      threadRootTimestamp,
      threadRootAuthorPubKey,
      replyDoc.timestamp,
    );

    return this._docToPost(replyDoc);
  }

  isUnread(post: Post): boolean {
    if (!this._user) {
      return false;
    }

    if (isRootPost(post.doc)) {
      const timestamp = this.getThreadRootTimestamp(post.doc);

      const readUpToTimestamp = this._storage.getContent(
        `/${APP_NAME}/readthread:${timestamp}--${post.doc.author}/~${this._user.address}/timestamp.txt`,
      );

      if (!readUpToTimestamp) {
        return false;
      }

      return parseInt(readUpToTimestamp) < timestamp;
    }

    const { rootTimestamp, opPubKey, replyTimestamp } =
      extractTemplateVariablesFromPath(
        threadReplyTemplate,
        post.doc.path,
      ) as ReplyPathExtractedVars;

    const readUpToTimestamp = this._storage.getContent(
      `/${APP_NAME}/readthread:${rootTimestamp}--${opPubKey}/~${this._user.address}/timestamp.txt`,
    );

    if (!readUpToTimestamp) {
      return false;
    }

    return parseInt(readUpToTimestamp) < parseInt(replyTimestamp);
  }

  threadHasUnreadPosts(thread: Thread): boolean {
    if (!this._user) {
      return false;
    }

    const readUpToTimestamp = this._storage.getContent(
      `/${APP_NAME}/readthread:${
        this.getThreadRootTimestamp(thread.root.doc)
      }--${thread.root.doc.author}/~${this._user.address}/timestamp.txt`,
    );

    if (!readUpToTimestamp) {
      return false;
    }

    return [thread.root, ...thread.replies].some(
      (post) => {
        return this.isUnread(post);
      },
    );
  }

  markReadUpTo(
    threadRootTimestamp: number,
    threadRootAuthorPubKey: string,
    readUpToTimestamp: number,
  ) {
    if (!this._user) {
      return;
    }

    const result = this._storage.set(this._user, {
      content: `${readUpToTimestamp}`,
      path:
        `/${APP_NAME}/readthread:${threadRootTimestamp}--${threadRootAuthorPubKey}/~${this._user.address}/timestamp.txt`,
      format: "es.4",
    });

    if (isErr(result)) {
      console.warn(
        `Something went wrong marking a thread as read`,
      );
    }
  }

  lastThreadItem(thread: Thread): Post {
    if (thread.replies.length === 0) {
      return thread.root;
    }

    return thread.replies[thread.replies.length - 1];
  }

  editPost(post: Post, content: string): WriteResult | ValidationError {
    if (!this._user) {
      return new ValidationError(
        "Couldn't edit post document without a known user.",
      );
    }

    const result = this._storage.set(this._user, {
      path: post.doc.path,
      format: "es.4",
      content,
    });

    return result;
  }

  getReplyDraft(
    threadRootTimestamp: number,
    threadRootAuthor: string,
  ): string | undefined {
    if (!this._user) {
      return undefined;
    }

    return this._storage.getContent(
      `/letterbox/drafts/thread:${threadRootTimestamp}--${threadRootAuthor}/~${this._user.address}.md`,
    );
  }

  setReplyDraft(
    threadRootTimestamp: number,
    threadRootAuthor: string,
    content: string,
  ): WriteResult | ValidationError {
    if (!this._user) {
      return new ValidationError(
        "Couldn't set draft reply without a known user.",
      );
    }

    const draftPath =
      `/${APP_NAME}/drafts/thread:${threadRootTimestamp}--${threadRootAuthor}/~${this._user.address}.md`;

    const result = this._storage.set(
      this._user,
      {
        content,
        format: "es.4",
        path: draftPath,
      },
    );

    return result;
  }

  clearReplyDraft(threadRootTimestamp: number, threadRootAuthor: string) {
    if (!this._user) {
      return new ValidationError(
        "Couldn't clear draft reply without a known user.",
      );
    }

    return this.setReplyDraft(threadRootTimestamp, threadRootAuthor, "");
  }

  getThreadRootDraftIds(): string[] {
    if (!this._user) {
      return [];
    }

    const drafts = this._storage.documents({
      pathStartsWith: `/${APP_NAME}/drafts/~${this._user.address}/`,
      contentLengthGt: 0,
    });

    return drafts.map((doc) => {
      const { timestamp } = extractTemplateVariablesFromPath(
        threadDraftTemplate,
        doc.path,
      ) as ThreadDraftPathExtractedVars;

      return timestamp;
    });
  }

  getThreadRootDraftContent(id: string): string | undefined {
    if (!this._user) {
      return undefined;
    }

    return this._storage.getContent(
      `/${APP_NAME}/drafts/~${this._user.address}/${id}.md`,
    );
  }

  setThreadRootDraft(
    content: string,
    id?: string,
  ): ValidationError | WriteResult {
    if (!this._user) {
      return new ValidationError(
        "Couldn't clear draft reply without a known user.",
      );
    }

    const timestamp = id || `${Date.now() * 1000}`;

    const draftPath =
      `/${APP_NAME}/drafts/~${this._user.address}/${timestamp}.md`;

    const existing = this._storage.getContent(draftPath);

    if (id === undefined && existing) {
      return this.setThreadRootDraft(content, `${parseInt(timestamp) + 1}`);
    }

    return this._storage.set(this._user, {
      content,
      format: "es.4",
      path: draftPath,
    });
  }

  clearThreadRootDraft(id: string) {
    if (!this._user) {
      return new ValidationError(
        "Couldn't clear draft reply without a known user.",
      );
    }

    const timestamp = id;

    const draftPath =
      `/${APP_NAME}/drafts/~${this._user.address}/${timestamp}.md`;

    return this._storage.set(this._user, {
      content: "",
      format: "es.4",
      path: draftPath,
    });
  }

  getDraftThreadParts(
    id: string,
  ): { title: string; content: string } | undefined {
    const draftContent = this.getThreadRootDraftContent(id);

    if (!draftContent) {
      return undefined;
    }

    const lines = draftContent.split("\n");

    const [firstLine, _emptyLine, ...rest] = lines;

    if (!firstLine || !firstLine.startsWith("# ")) {
      return undefined;
    }

    return { title: firstLine.substring(2), content: rest.join("\n") };
  }
}
