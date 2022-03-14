import { Earthstar } from "../deps.ts";
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.125.0/testing/asserts.ts";
import { LetterboxLayer } from "./letterbox_layer.ts";

function newReplica() {
  return new Earthstar.Replica(
    "+test.a123",
    Earthstar.FormatValidatorEs4,
    new Earthstar.ReplicaDriverMemory("+test.a123"),
  );
}

async function newIdentity() {
  const keypair = await Earthstar.Crypto.generateAuthorKeypair(
    "test",
  ) as Earthstar.AuthorKeypair;

  return keypair;
}

function newLayer(
  storage: Earthstar.Replica,
  keypair: Earthstar.AuthorKeypair,
) {
  return new LetterboxLayer(storage, keypair);
}

Deno.test({
  name: "Can write and read threads",
  fn: async () => {
    const replica = newReplica();
    const userA = await newIdentity();
    const userB = await newIdentity();
    const userC = await newIdentity();
    const layerA = newLayer(replica, userA);
    const layerB = newLayer(replica, userB);
    const layerC = newLayer(replica, userC);

    await layerA.createThread("Hello! First thread");
    await layerB.createThread("Yo. Second thread");
    await layerC.createThread("Greetz. Third thread");

    const threads = await layerA.getThreads();

    assertEquals(threads.length, 3);
    assertEquals(threads[0].root.doc.content, "Greetz. Third thread");
    assertEquals(threads[2].root.doc.content, "Hello! First thread");

    await replica.close(true);
  },
});

Deno.test({
  name: "Can write and read replies",
  fn: async () => {
    const storage = newReplica();
    const userA = await newIdentity();
    const userB = await newIdentity();
    const userC = await newIdentity();
    const userD = await newIdentity();
    const layerA = newLayer(storage, userA);
    const layerB = newLayer(storage, userB);
    const layerC = newLayer(storage, userC);
    const layerD = newLayer(storage, userD);

    const thread = await layerA.createThread("Hello! This is my thread.");

    if (Earthstar.isErr(thread)) {
      assertEquals(Earthstar.isErr(thread), false);
      return;
    }

    const timestamp = layerA.getThreadRootTimestamp(thread.root.doc);

    await layerB.createReply(
      timestamp,
      thread.root.doc.author,
      "Great thread.",
    );
    await layerC.createReply(timestamp, thread.root.doc.author, "I agree!");
    await layerD.createReply(timestamp, thread.root.doc.author, "Totally.");

    const threadWithReplies = await layerA.getThread(
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

    await storage.close(true);
  },
});

Deno.test({
  name: "Can mark thread as read",
  fn: async () => {
    const storage = newReplica();
    const userA = await newIdentity();
    const userB = await newIdentity();
    const userC = await newIdentity();
    const userD = await newIdentity();
    const layerA = newLayer(storage, userA);
    const layerB = newLayer(storage, userB);
    const layerC = newLayer(storage, userC);
    const layerD = newLayer(storage, userD);

    const thread = await layerA.createThread("Hello! This is my thread.");

    if (Earthstar.isErr(thread)) {
      assertEquals(Earthstar.isErr(thread), false);
      return;
    }

    const timestamp = layerA.getThreadRootTimestamp(thread.root.doc);

    await layerB.createReply(
      timestamp,
      thread.root.doc.author,
      "Great thread.",
    );
    await layerC.createReply(timestamp, thread.root.doc.author, "I agree!");
    await layerD.createReply(timestamp, thread.root.doc.author, "Totally.");

    const threadWithReplies = await layerA.getThread(
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
      await layerA.threadHasUnreadPosts(threadWithReplies),
      true,
      "Thread with replies has unread posts",
    );

    const secondReplyTimestamp = layerA.getPostTimestamp(
      threadWithReplies.replies[1].doc,
    );

    await layerA.markReadUpTo(
      timestamp,
      thread.root.doc.author,
      secondReplyTimestamp,
    );

    const threadWithUnreadReplies = await layerA.getThread(
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
      await layerA.threadHasUnreadPosts(threadWithUnreadReplies),
      true,
      "Thread with some unread replies has unread posts",
    );

    const shouldBeFalse = await layerA.isUnread(
      threadWithUnreadReplies.replies[1],
    );

    const shouldBeTrue = await layerA.isUnread(
      threadWithUnreadReplies.replies[2],
    );

    assertEquals(shouldBeFalse, false, "Second reply should be read");
    assertEquals(shouldBeTrue, true, "Third reply should be unread");

    const lastReplyTimestamp = layerA.getPostTimestamp(
      threadWithReplies.replies[2].doc,
    );

    await layerA.markReadUpTo(
      timestamp,
      thread.root.doc.author,
      lastReplyTimestamp,
    );

    const threadWithReadReplies = await layerA.getThread(
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
      await layerA.threadHasUnreadPosts(threadWithUnreadReplies),
      false,
      "Thread with all replies marked as read has no unread posts",
    );

    await storage.close(true);
  },
});

Deno.test({
  name: "Can create, retrieve, and clear reply drafts",
  fn: async () => {
    const storage = newReplica();
    const user = await newIdentity();
    const layer = newLayer(storage, user);

    const thread = await layer.createThread("My very long thread.");

    if (Earthstar.isErr(thread)) {
      return;
    }

    const rootTimestamp = layer.getThreadRootTimestamp(thread.root.doc);

    assertEquals(
      await layer.getReplyDraft(rootTimestamp, thread.root.doc.author),
      undefined,
    );

    const writeReplyRes = await layer.setReplyDraft(
      rootTimestamp,
      thread.root.doc.author,
      "What should I say?",
    );

    assertEquals(
      Earthstar.isErr(writeReplyRes),
      false,
      "Reply draft write was successful",
    );
    assertEquals(
      await layer.getReplyDraft(rootTimestamp, thread.root.doc.author),
      "What should I say?",
      "Draft is what was just set",
    );

    const clearRes = await layer.clearReplyDraft(
      rootTimestamp,
      thread.root.doc.author,
    );

    assertEquals(
      Earthstar.isErr(clearRes),
      false,
      "Reply draft clear was successful",
    );
    assertEquals(
      await layer.getReplyDraft(rootTimestamp, thread.root.doc.author),
      "",
      "Draft was cleared",
    );

    storage.close(true);
  },
});

Deno.test({
  name: "Can create, retrieve, and clear thread drafts",
  fn: async () => {
    const storage = newReplica();
    const user = await newIdentity();
    const layer = newLayer(storage, user);

    await layer.setThreadRootDraft("Unorganised thoughts");
    await layer.setThreadRootDraft("Potential ideas");
    await layer.setThreadRootDraft("How do I put this?");

    const draftIds = await layer.getThreadRootDraftIds();

    assertEquals(draftIds.length, 3, "Has three drafts");

    const secondDraftContent = await layer.getThreadRootDraftContent(
      draftIds[1],
    );

    assertNotEquals(secondDraftContent, undefined);

    await layer.setThreadRootDraft("Updated draft!", draftIds[1]);

    const secondDraftUpdatedContent = await layer.getThreadRootDraftContent(
      draftIds[1],
    );

    assertEquals(
      secondDraftUpdatedContent,
      "Updated draft!",
      "Draft was updated",
    );

    await layer.clearThreadRootDraft(draftIds[1]);

    const nextDraftIds = await layer.getThreadRootDraftIds();

    assertEquals(nextDraftIds.length, 2);

    storage.close(true);
  },
});
