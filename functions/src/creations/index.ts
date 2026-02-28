import {onCall} from "firebase-functions/v2/https";
import {db, storage} from "../utils/admin";
import {StudioError} from "../utils/errors";

export async function saveCreation(creationData: any): Promise<void> {
  const creationRef = db.collection("creations").doc();
  const data = {
    ...creationData,
    creationId: creationRef.id,
    createdAt: new Date(),
  };
  await creationRef.set(data);
}

export const getUserCreations = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const {limit = 20, startAfter} = request.data || {};
  const userId = request.auth.uid;

  let query = db.collection("creations")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, 50));

  if (startAfter) {
    const startDoc = await db.collection("creations").doc(startAfter).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc);
    }
  }

  const snapshot = await query.get();
  const creations = snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));

  return {creations};
});

export const deleteCreation = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const {creationId} = request.data;
  if (!creationId) {
    throw new StudioError("INVALID_REQUEST", "creationId is required.");
  }

  const creationRef = db.collection("creations").doc(creationId);
  const creationDoc = await creationRef.get();

  if (!creationDoc.exists) {
    throw new StudioError("INVALID_REQUEST", "Creation not found.");
  }

  const creationData = creationDoc.data();
  if (creationData?.userId !== request.auth.uid) {
    throw new StudioError("UNAUTHORIZED", "You can only delete your own creations.");
  }

  if (creationData?.jobId) {
    const userId = request.auth.uid;
    const bucket = storage.bucket();

    const outputPath = `generated/${userId}/${creationData.jobId}/output`;
    const thumbnailPath = `generated/${userId}/${creationData.jobId}/thumbnail`;

    try {
      await bucket.file(outputPath).delete({ignoreNotFound: true});
    } catch (e) {
      console.error(`Failed to delete output ${outputPath}`, e);
    }

    try {
      await bucket.file(thumbnailPath).delete({ignoreNotFound: true});
    } catch (e) {
      console.error(`Failed to delete thumbnail ${thumbnailPath}`, e);
    }
  }

  // Delete document
  await creationRef.delete();

  const postsSnapshot = await db.collection("posts")
    .where("creationId", "==", creationId)
    .get();

  for (const doc of postsSnapshot.docs) {
    await doc.ref.delete();
  }

  return {success: true};
});
