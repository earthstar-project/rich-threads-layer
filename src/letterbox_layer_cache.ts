import { Earthstar } from "../deps.ts";
import {
  Post,
  ReplyPathExtractedVars,
  RootPathExtractedVars,
  Thread,
  ThreadDraftPathExtractedVars,
} from "./types.ts";
import {
  APP_NAME,
  threadDraftTemplate,
  threadReplyTemplate,
  threadRootTemplate,
} from "./constants.ts";
import { isRootPost, onlyDefined } from "./util.ts";

export class LetterboxLayerCache {
  _replica: Earthstar.ReplicaCache;
  _identity: Earthstar.AuthorKeypair | null;

  constructor(
    replica: Earthstar.ReplicaCache,
    user: Earthstar.AuthorKeypair | null,
  ) {
    this._identity = user;
    this._replica = replica;
  }

  getThreadRootTimestamp(rootDoc: Earthstar.Doc): number {
    const { rootTimestamp } = Earthstar.extractTemplateVariablesFromPath(
      threadRootTemplate,
      rootDoc.path,
    ) as RootPathExtractedVars;

    return parseInt(rootTimestamp);
  }

  getReplyTimestamp(postDoc: Earthstar.Doc): number {
    const { replyTimestamp } = Earthstar.extractTemplateVariablesFromPath(
      threadReplyTemplate,
      postDoc.path,
    ) as ReplyPathExtractedVars;

    return parseInt(replyTimestamp);
  }

  getPostTimestamp(postDoc: Earthstar.Doc): number {
    if (isRootPost(postDoc)) {
      return this.getThreadRootTimestamp(postDoc);
    }

    return this.getReplyTimestamp(postDoc);
  }

  _docToThreadRoot(rootDoc: Earthstar.Doc): Post {
    const { rootTimestamp } = Earthstar.extractTemplateVariablesFromPath(
      threadRootTemplate,
      rootDoc.path,
    ) as RootPathExtractedVars;

    return {
      doc: rootDoc,
      firstPosted: new Date(parseInt(rootTimestamp) / 1000),
    };
  }

  _docToPost(postDoc: Earthstar.Doc): Post {
    const { replyTimestamp } = Earthstar.extractTemplateVariablesFromPath(
      threadReplyTemplate,
      postDoc.path,
    ) as ReplyPathExtractedVars;

    return {
      doc: postDoc,
      firstPosted: new Date(parseInt(replyTimestamp) / 1000),
    };
  }

  async _createRootDoc(
    content: string,
    deleteAfter?: number,
  ): Promise<Earthstar.Doc | Earthstar.ValidationError> {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't create post document without a known user.",
      );
    }

    const timestamp = Date.now() * 1000;
    const path =
      `/${APP_NAME}/rootthread:${timestamp}~${this._identity.address}/root.md`;

    const result = await this._replica.set(this._identity, {
      content,
      path,
      deleteAfter,
      format: "es.4",
    });

    if (result.kind === "failure") {
      console.error("Creating a root doc unexpectedly failed:", result.err);
    }

    return (result as Earthstar.IngestEventSuccess).doc;
  }

  async _createReplyDoc(
    content: string,
    threadRootTimestamp: number,
    threadRootAuthor: string,
    deleteAfter?: number,
  ): Promise<
    Earthstar.Doc | Earthstar.ValidationError
  > {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't create post document without a known user.",
      );
    }

    const timestamp = Date.now() * 1000;
    const path =
      `/${APP_NAME}/thread:${threadRootTimestamp}--${threadRootAuthor}/reply:${timestamp}~${this._identity.address}.md`;

    const result = await this._replica.set(this._identity, {
      content,
      path,
      deleteAfter,
      format: "es.4",
    });

    if (result.kind === "failure") {
      console.error("Creating a root doc unexpectedly failed:", result.err);
    }

    return (result as Earthstar.IngestEventSuccess).doc;
  }

  getThreadTitle(thread: Thread): string | undefined {
    const { content } = thread.root.doc;

    const [firstLine] = content.split("\n");

    if (!firstLine || !firstLine.startsWith("# ")) {
      return undefined;
    }

    return firstLine.substring(2);
  }

  getThreadRoots(): Post[] {
    const threadRootDocs = this._replica.queryDocs({
      filter: { pathStartsWith: `/${APP_NAME}/rootthread:` },
      orderBy: "path DESC",
    });

    return threadRootDocs.map(this._docToThreadRoot);
  }

  getThreads(): Thread[] {
    const threadRootDocs = this._replica.queryDocs({
      filter: { pathStartsWith: `/${APP_NAME}/rootthread:` },
    });

    const threads = [];

    for (const rootDoc of threadRootDocs) {
      const { rootTimestamp, opPubKey } = Earthstar
        .extractTemplateVariablesFromPath(
          threadRootTemplate,
          rootDoc.path,
        ) as RootPathExtractedVars;

      const thread = this.getThread(parseInt(rootTimestamp), opPubKey);

      threads.push(thread);
    }

    return threads.filter(
      onlyDefined,
    ).sort((aThread, bThread) => {
      const aLast = this.lastThreadItem(aThread);
      const bLast = this.lastThreadItem(bThread);

      return aLast.firstPosted < bLast.firstPosted ? 1 : -1;
    });
  }

  async createThread(
    content: string,
    deleteAfter?: number,
  ): Promise<Thread | Earthstar.ValidationError> {
    const maybeDoc = await this._createRootDoc(content, deleteAfter);

    if (Earthstar.isErr(maybeDoc)) {
      console.error(maybeDoc);

      return maybeDoc;
    }

    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't create post document without a known user.",
      );
    }

    const threadRoot = this._docToThreadRoot(maybeDoc);

    await this.markReadUpTo(
      this.getThreadRootTimestamp(threadRoot.doc),
      threadRoot.doc.author,
      threadRoot.doc.timestamp,
    );

    return {
      root: threadRoot,
      replies: [],
    };
  }

  getThread(
    timestamp: number,
    authorPubKey: string,
  ): Thread | undefined {
    const threadRootDoc = this._replica.getLatestDocAtPath(
      `/${APP_NAME}/rootthread:${timestamp}~${authorPubKey}/root.md`,
    );

    if (!threadRootDoc) {
      return undefined;
    }

    const replyDocs = this._replica.queryDocs({
      filter: {
        pathStartsWith:
          `/${APP_NAME}/thread:${timestamp}--${authorPubKey}/reply`,
      },
    });

    const replies = replyDocs.map(this._docToPost, this).filter(onlyDefined)
      .sort((aReply, bReply) => {
        if (aReply.firstPosted < bReply.firstPosted) {
          return -1;
        }

        return 1;
      });

    return {
      root: this._docToThreadRoot(threadRootDoc),
      replies,
    };
  }

  async createReply(
    threadRootTimestamp: number,
    threadRootAuthorPubKey: string,
    content: string,
    deleteAfter?: number,
  ): Promise<Post | Earthstar.ValidationError> {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Can't create reply without a known user.",
      );
    }

    const maybeDoc = await this._createReplyDoc(
      content,
      threadRootTimestamp,
      threadRootAuthorPubKey,
      deleteAfter,
    );

    if (Earthstar.isErr(maybeDoc)) {
      console.error(maybeDoc);

      return maybeDoc;
    }

    await this.markReadUpTo(
      threadRootTimestamp,
      threadRootAuthorPubKey,
      maybeDoc.timestamp,
    );

    return this._docToPost(maybeDoc);
  }

  isUnread(post: Post): boolean {
    if (!this._identity) {
      return false;
    }

    if (isRootPost(post.doc)) {
      const timestamp = this.getThreadRootTimestamp(post.doc);

      const readUpToDoc = this._replica.getLatestDocAtPath(
        `/${APP_NAME}/readthread:${timestamp}--${post.doc.author}/~${this._identity.address}/timestamp.txt`,
      );

      if (!readUpToDoc) {
        return false;
      }

      return timestamp > parseInt(readUpToDoc.content);
    }

    const { rootTimestamp, opPubKey, replyTimestamp } = Earthstar
      .extractTemplateVariablesFromPath(
        threadReplyTemplate,
        post.doc.path,
      ) as ReplyPathExtractedVars;

    const readUpToDoc = this._replica.getLatestDocAtPath(
      `/${APP_NAME}/readthread:${rootTimestamp}--${opPubKey}/~${this._identity.address}/timestamp.txt`,
    );

    if (!readUpToDoc) {
      return false;
    }

    return parseInt(replyTimestamp) > parseInt(readUpToDoc.content);
  }

  threadHasUnreadPosts(thread: Thread): boolean {
    if (!this._identity) {
      return false;
    }

    const readUpToDoc = this._replica.getLatestDocAtPath(
      `/${APP_NAME}/readthread:${
        this.getThreadRootTimestamp(thread.root.doc)
      }--${thread.root.doc.author}/~${this._identity.address}/timestamp.txt`,
    );

    if (!readUpToDoc) {
      return false;
    }

    let threadHasUnreadPosts = false;

    for (const post of [thread.root, ...thread.replies]) {
      const isUnread = this.isUnread(post);

      if (isUnread) {
        threadHasUnreadPosts = true;
      }
    }

    return threadHasUnreadPosts;
  }

  async markReadUpTo(
    threadRootTimestamp: number,
    threadRootAuthorPubKey: string,
    readUpToTimestamp: number,
  ) {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Can't mark where a thread has been read up to without an identity.",
      );
    }

    const result = await this._replica.set(this._identity, {
      content: `${readUpToTimestamp}`,
      path:
        `/${APP_NAME}/readthread:${threadRootTimestamp}--${threadRootAuthorPubKey}/~${this._identity.address}/timestamp.txt`,
      format: "es.4",
    });

    if (result.kind === "failure") {
      console.error(
        "Creating a mark read up to doc unexpectedly failed:",
        result.err,
      );
    }

    return (result as Earthstar.IngestEventSuccess).doc;
  }

  lastThreadItem(thread: Thread): Post {
    if (thread.replies.length === 0) {
      return thread.root;
    }

    return thread.replies[thread.replies.length - 1];
  }

  async editPost(
    post: Post,
    content: string,
  ): Promise<Earthstar.Doc | Earthstar.ValidationError> {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't edit post document without a known user.",
      );
    }

    const result = await this._replica.set(this._identity, {
      path: post.doc.path,
      format: "es.4",
      content,
    });

    if (result.kind === "failure") {
      console.error("Editing a post unexpectedly failed:", result.err);
    }

    return (result as Earthstar.IngestEventSuccess).doc;
  }

  getReplyDraft(
    threadRootTimestamp: number,
    threadRootAuthor: string,
  ): string | undefined {
    if (!this._identity) {
      return undefined;
    }

    const maybeDoc = this._replica.getLatestDocAtPath(
      `/letterbox/drafts/thread:${threadRootTimestamp}--${threadRootAuthor}/~${this._identity.address}.md`,
    );

    return maybeDoc?.content;
  }

  async setReplyDraft(
    threadRootTimestamp: number,
    threadRootAuthor: string,
    content: string,
  ): Promise<Earthstar.Doc | Earthstar.ValidationError> {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't set draft reply without a known user.",
      );
    }

    const draftPath =
      `/${APP_NAME}/drafts/thread:${threadRootTimestamp}--${threadRootAuthor}/~${this._identity.address}.md`;

    const result = await this._replica.set(
      this._identity,
      {
        content,
        format: "es.4",
        path: draftPath,
      },
    );

    if (result.kind === "failure") {
      console.error("Setting a draft reply unexpectedly failed:", result.err);
    }

    return (result as Earthstar.IngestEventSuccess).doc;
  }

  async clearReplyDraft(threadRootTimestamp: number, threadRootAuthor: string) {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't clear draft reply without a known user.",
      );
    }

    return await this.setReplyDraft(threadRootTimestamp, threadRootAuthor, "");
  }

  getThreadRootDraftIds(): string[] {
    if (!this._identity) {
      return [];
    }

    const drafts = this._replica.queryDocs({
      filter: {
        pathStartsWith: `/${APP_NAME}/drafts/~${this._identity.address}/`,
        contentLengthGt: 0,
      },
    });

    const draftIds: string[] = [];

    for (const doc of drafts) {
      const result = Earthstar.extractTemplateVariablesFromPath(
        threadDraftTemplate,
        doc.path,
      );

      if (!result) {
        break;
      }

      draftIds.push(result.timestamp);
    }

    return draftIds;
  }

  getThreadRootDraftContent(id: string): string | undefined {
    if (!this._identity) {
      return undefined;
    }

    const maybeDraftDoc = this._replica.getLatestDocAtPath(
      `/${APP_NAME}/drafts/~${this._identity.address}/${id}.md`,
    );

    return maybeDraftDoc?.content;
  }

  async setThreadRootDraft(
    content: string,
    id?: string,
  ): Promise<string | Earthstar.ValidationError> {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't clear draft reply without a known user.",
      );
    }

    const timestamp = id || `${Date.now() * 1000}`;

    const draftPath =
      `/${APP_NAME}/drafts/~${this._identity.address}/${timestamp}.md`;

    const existingDraftDoc = this._replica.getLatestDocAtPath(draftPath);

    if (id === undefined && existingDraftDoc) {
      return this.setThreadRootDraft(content, `${parseInt(timestamp) + 1}`);
    }

    const res = await this._replica.set(this._identity, {
      content,
      format: "es.4",
      path: draftPath,
    });

    if (res.kind === "failure") {
      console.error("Setting a draft reply unexpectedly failed:", res.err);
    }

    return timestamp;
  }

  async clearThreadRootDraft(id: string) {
    if (!this._identity) {
      return new Earthstar.ValidationError(
        "Couldn't clear draft reply without a known user.",
      );
    }

    const timestamp = id;

    const draftPath =
      `/${APP_NAME}/drafts/~${this._identity.address}/${timestamp}.md`;

    return await this._replica.set(this._identity, {
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
