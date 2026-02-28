import {onCall} from "firebase-functions/v2/https";
import {db, FieldValue} from "../utils/admin";
import {StudioError} from "../utils/errors";

export const publishPost = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const {creationId, caption, mediaUrl} = request.data;
  if (!creationId || !mediaUrl) {
    throw new StudioError("INVALID_REQUEST", "creationId and mediaUrl are required.");
  }

  const userId = request.auth.uid;
  const postRef = db.collection("posts").doc();

  const postData = {
    postId: postRef.id,
    userId,
    creationId,
    caption: caption || "",
    mediaUrl,
    likesCount: 0,
    commentsCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  };

  await postRef.set(postData);

  return {postId: postRef.id, postData};
});

export const deletePost = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const {postId} = request.data;
  if (!postId) {
    throw new StudioError("INVALID_REQUEST", "postId is required.");
  }

  const postRef = db.collection("posts").doc(postId);
  const postDoc = await postRef.get();

  if (!postDoc.exists) {
    throw new StudioError("INVALID_REQUEST", "Post not found.");
  }

  const postData = postDoc.data();
  if (postData?.userId !== request.auth.uid) {
    throw new StudioError("UNAUTHORIZED", "Cannot delete another user's post.");
  }

  await postRef.delete();


  return {success: true};
});

export const likePost = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const {postId} = request.data;
  if (!postId) {
    throw new StudioError("INVALID_REQUEST", "postId is required.");
  }

  const userId = request.auth.uid;
  const postRef = db.collection("posts").doc(postId);
  const likeRef = db.collection("likes").doc(`${postId}_${userId}`);

  await db.runTransaction(async (transaction) => {
    const postDoc = await transaction.get(postRef);
    if (!postDoc.exists) {
      throw new StudioError("INVALID_REQUEST", "Post not found.");
    }

    const likeDoc = await transaction.get(likeRef);
    if (likeDoc.exists) {
      // Unlike
      transaction.delete(likeRef);
      transaction.update(postRef, {
        likesCount: FieldValue.increment(-1),
      });
    } else {
      // Like
      transaction.set(likeRef, {
        likeId: likeRef.id,
        postId,
        userId,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(postRef, {
        likesCount: FieldValue.increment(1),
      });
    }
  });

  return {success: true};
});

export const commentPost = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const {postId, text} = request.data;
  if (!postId || !text) {
    throw new StudioError("INVALID_REQUEST", "postId and text are required.");
  }

  const userId = request.auth.uid;
  const postRef = db.collection("posts").doc(postId);
  const commentRef = db.collection("comments").doc();

  await db.runTransaction(async (transaction) => {
    const postDoc = await transaction.get(postRef);
    if (!postDoc.exists) {
      throw new StudioError("INVALID_REQUEST", "Post not found.");
    }

    transaction.set(commentRef, {
      commentId: commentRef.id,
      postId,
      userId,
      text,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.update(postRef, {
      commentsCount: FieldValue.increment(1),
    });
  });

  return {success: true, commentId: commentRef.id};
});

export const remixPost = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const {postId} = request.data;
  if (!postId) {
    throw new StudioError("INVALID_REQUEST", "postId is required.");
  }

  const userId = request.auth.uid;
  const postDoc = await db.collection("posts").doc(postId).get();

  if (!postDoc.exists) {
    throw new StudioError("INVALID_REQUEST", "Post not found.");
  }

  const postData = postDoc.data();
  const creationDoc = await db.collection("creations").doc(postData?.creationId).get();

  if (!creationDoc.exists) {
    throw new StudioError("INVALID_REQUEST", "Original creation not found.");
  }

  const creationData = creationDoc.data();

  const newJobRef = db.collection("jobs").doc();
  const jobData = {
    jobId: newJobRef.id,
    userId,
    provider: creationData?.provider,
    model: creationData?.model,
    parameters: {
      ...creationData?.settings,
      prompt: creationData?.prompt,
      originalPostId: postId,
    },
    costTokens: creationData?.settings?.cost || 10,
    status: "queued",
    createdAt: FieldValue.serverTimestamp(),
  };

  await newJobRef.set(jobData);

  return {
    success: true,
    jobId: newJobRef.id,
    job: jobData,
  };
});
