import {
  AuthorKeypair,
  generateAuthorKeypair,
  isErr,
  StorageMemory,
  ValidatorEs4,
  IStorage
} from "https://esm.sh/earthstar";
import {
  assertEquals,
  assertNotEquals,
  } from "https://deno.land/std@0.104.0/testing/asserts.ts";
import LetterboxLayer from "./letterbox_layer.ts";

function newStorage() {
  return new StorageMemory([ValidatorEs4], "+test.a123");
}

function newIdentity() {
  return generateAuthorKeypair("test") as AuthorKeypair;
}

function newLayer(storage: IStorage, keypair: AuthorKeypair) {
  return new LetterboxLayer(storage, keypair);
}

Deno.test({
  name: "Can write and read threads",
  fn: () => {
    const storage = newStorage();
    const userA = newIdentity();
    const userB = newIdentity();
    const userC = newIdentity();
    const layerA = newLayer(storage, userA);
    const layerB = newLayer(storage, userB);
    const layerC = newLayer(storage, userC);

    layerA.createThread("Hello! First thread");
    layerB.createThread("Yo. Second thread");
    layerC.createThread("Greetz. Third thread");

    const threads = layerA.getThreads();

    assertEquals(threads.length, 3);
    assertEquals(threads[0].root.doc.content, "Greetz. Third thread");
    assertEquals(threads[2].root.doc.content, "Hello! First thread");

    storage.close();
  },
  sanitizeOps: false,
});

Deno.test({
  name: "Can write and read replies",
  fn: () => {
    const storage = newStorage()
    const userA = newIdentity()
    const userB = newIdentity()
    const userC = newIdentity()
    const userD = newIdentity()
    const layerA = newLayer(storage, userA);
    const layerB = newLayer(storage, userB);
    const layerC = newLayer(storage, userC);
    const layerD = newLayer(storage, userD);

    const thread = layerA.createThread("Hello! This is my thread.");

    if (isErr(thread)) {
      assertEquals(isErr(thread), false);
      return;
    }

    const timestamp = layerA.getThreadRootTimestamp(thread.root.doc);

    layerB.createReply(timestamp, thread.root.doc.author, "Great thread.");
    layerC.createReply(timestamp, thread.root.doc.author, "I agree!");
    layerD.createReply(timestamp, thread.root.doc.author, "Totally.");

    const threadWithReplies = layerA.getThread(
      timestamp,
      thread.root.doc.author,
    );

    if (!threadWithReplies) {
      assertNotEquals(threadWithReplies, undefined);
      return;
    }

    assertEquals(threadWithReplies.replies.length, 3);
    assertEquals(threadWithReplies.replies[0].doc.content, "Great thread.");
    assertEquals(threadWithReplies.replies[2].doc.content, "Totally.");

    layerA._storage.close();
    layerB._storage.close();
    layerC._storage.close();
    layerD._storage.close();
  },
  sanitizeOps: false,
});

Deno.test({
  name: "Can mark thread as read",
  fn: () => {
    const storage = newStorage();
    const userA = newIdentity()
    const userB = newIdentity()
    const userC = newIdentity()
    const userD = newIdentity()
    const layerA = newLayer(storage, userA);
    const layerB = newLayer(storage, userB);
    const layerC = newLayer(storage, userC);
    const layerD = newLayer(storage, userD);

    const thread = layerA.createThread("Hello! This is my thread.");

    if (isErr(thread)) {
      assertEquals(isErr(thread), false);
      return;
    }

    const timestamp = layerA.getThreadRootTimestamp(thread.root.doc);

    layerB.createReply(timestamp, thread.root.doc.author, "Great thread.");
    layerC.createReply(timestamp, thread.root.doc.author, "I agree!");
    layerD.createReply(timestamp, thread.root.doc.author, "Totally.");

    const threadWithReplies = layerA.getThread(
      timestamp,
      thread.root.doc.author,
    );

    if (!threadWithReplies) {
      assertNotEquals(
        threadWithReplies,
        undefined,
        "Thread with replies is defined",
      );
      return;
    }

    assertEquals(
      layerA.threadHasUnreadPosts(threadWithReplies),
      true,
      "Thread with replies has unread posts",
    );

    const secondReplyTimestamp = layerA.getPostTimestamp(
      threadWithReplies.replies[1].doc,
    );

    layerA.markReadUpTo(timestamp, thread.root.doc.author, secondReplyTimestamp);

    const threadWithUnreadReplies = layerA.getThread(
      timestamp,
      thread.root.doc.author,
    );

    if (!threadWithUnreadReplies) {
      assertNotEquals(
        threadWithUnreadReplies,
        undefined,
        "Thread with unread replies is defined",
      );
      return;
    }

    assertEquals(
      layerA.threadHasUnreadPosts(threadWithUnreadReplies),
      true,
      "Thread with some unread replies has unread posts",
    );

    const shouldBeRead = layerA.isUnread(threadWithUnreadReplies.replies[1]);
    const shouldBeUnread = layerA.isUnread(threadWithUnreadReplies.replies[2]);

    assertEquals(shouldBeRead, false, "Second reply should be read");
    assertEquals(shouldBeUnread, true, "Third reply should be unread");
    
    const lastReplyTimestamp = layerA.getPostTimestamp(
      threadWithReplies.replies[2].doc,
    );
    
    layerA.markReadUpTo(timestamp, thread.root.doc.author, lastReplyTimestamp);
    
    const threadWithReadReplies = layerA.getThread(
      timestamp,
      thread.root.doc.author,
    );

    if (!threadWithReadReplies) {
      assertNotEquals(
        threadWithReadReplies,
        undefined,
        "Thread with unread replies is defined",
      );
      return;
    }

    assertEquals(
      layerA.threadHasUnreadPosts(threadWithUnreadReplies),
      false,
      "Thread with all replies marked as read has no unread posts",
    );

    storage.close();
  },
  sanitizeOps: false,
});

Deno.test({
  name: "Can create, retrieve, and clear reply drafts",
  fn: () => {
    const storage = newStorage();
    const user = newIdentity();
    const layer = newLayer(storage, user);

    const thread = layer.createThread("My very long thread.");

    if (isErr(thread)) {
      return;
    }

    const rootTimestamp = layer.getThreadRootTimestamp(thread.root.doc);

    assertEquals(
      layer.getReplyDraft(rootTimestamp, thread.root.doc.author),
      undefined,
    );

    const writeReplyRes = layer.setReplyDraft(
      rootTimestamp,
      thread.root.doc.author,
      "What should I say?",
    );

    assertEquals(
      isErr(writeReplyRes),
      false,
      "Reply draft write was successful",
    );
    assertEquals(
      layer.getReplyDraft(rootTimestamp, thread.root.doc.author),
      "What should I say?",
      "Draft is what was just set",
    );

    const clearRes = layer.clearReplyDraft(
      rootTimestamp,
      thread.root.doc.author,
    );

    assertEquals(
      isErr(clearRes),
      false,
      "Reply draft clear was successful",
    );
    assertEquals(
      layer.getReplyDraft(rootTimestamp, thread.root.doc.author),
      "",
      "Draft was cleared",
    );

    layer._storage.close();
  },
  sanitizeOps: false,
});

Deno.test({
  name: "Can create, retrieve, and clear thread drafts",
  fn: () => {
    const storage = newStorage();
    const user = newIdentity();
    const layer = newLayer(storage, user);

    layer.setThreadRootDraft("Unorganised thoughts");
    setTimeout(() => {}, 10);
    layer.setThreadRootDraft("Potential ideas");
    setTimeout(() => {}, 10);
    layer.setThreadRootDraft("How do I put this?");

    const draftIds = layer.getThreadRootDraftIds();

    assertEquals(draftIds.length, 3, "Has three drafts");

    const secondDraftContent = layer.getThreadRootDraftContent(draftIds[1]);

    assertNotEquals(secondDraftContent, undefined);

    layer.setThreadRootDraft("Updated draft!", draftIds[1]);

    const secondDraftUpdatedContent = layer.getThreadRootDraftContent(
      draftIds[1],
    );

    assertEquals(
      secondDraftUpdatedContent,
      "Updated draft!",
      "Draft was updated",
    );

    layer.clearThreadRootDraft(draftIds[1]);

    const nextDraftIds = layer.getThreadRootDraftIds();

    assertEquals(nextDraftIds.length, 2);

    layer._storage.close();
  },
  sanitizeOps: false,
});
