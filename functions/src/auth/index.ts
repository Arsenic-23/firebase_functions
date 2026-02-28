import { beforeUserCreated } from "firebase-functions/v2/identity";
import { db, FieldValue } from "../utils/admin";

export const onUserCreated = beforeUserCreated(async (event) => {
  const user = event.data;

  if (!user || (!user.uid && !user.email)) {
    return;
  }

  // Generate uid fallback if identity payload is malformed
  const uid = user.uid || `anon-${Date.now()}`;

  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();

  const INITIAL_CREDITS = 200;

  if (!userDoc.exists) {
    await userRef.set({
      uid: uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      tokenBalance: INITIAL_CREDITS,
      plan: "free",
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    await userRef.update({
      tokenBalance: INITIAL_CREDITS,
      plan: "free",
    });
  }

  const ledgerRef = db.collection("tokenLedger").doc();
  await ledgerRef.set({
    ledgerId: ledgerRef.id,
    userId: uid,
    amount: INITIAL_CREDITS,
    reason: "Initial signup welcome bonus",
    createdAt: FieldValue.serverTimestamp(),
  });
});
