import {onCall} from "firebase-functions/v2/https";
import {db, FieldValue} from "../utils/admin";
import {StudioError} from "../utils/errors";

export async function deductTokens(
  transaction: FirebaseFirestore.Transaction,
  userId: string,
  amount: number,
  reason: string,
  jobId?: string
): Promise<void> {
  const userRef = db.collection("users").doc(userId);
  const userDoc = await transaction.get(userRef);

  if (!userDoc.exists) {
    throw new StudioError("INVALID_REQUEST", "User not found.");
  }

  const currentBalance = userDoc.data()?.tokenBalance || 0;
  if (currentBalance < amount) {
    throw new StudioError("INSUFFICIENT_TOKENS", "Not enough tokens.");
  }

  // Deduct from user
  transaction.update(userRef, {
    tokenBalance: FieldValue.increment(-amount),
  });

  const ledgerRef = db.collection("tokenLedger").doc();
  transaction.set(ledgerRef, {
    ledgerId: ledgerRef.id,
    userId,
    amount: -amount,
    reason,
    jobId: jobId || null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function addTokensAfterPayment(
  userId: string,
  amount: number,
  reason: string
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists) {
      throw new Error("User not found.");
    }

    transaction.update(userRef, {
      tokenBalance: FieldValue.increment(amount),
    });

    const ledgerRef = db.collection("tokenLedger").doc();
    transaction.set(ledgerRef, {
      ledgerId: ledgerRef.id,
      userId,
      amount: amount,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

export const getUserBalance = onCall(async (request) => {
  if (!request.auth) {
    throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
  }

  const userId = request.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists) {
    throw new StudioError("INVALID_REQUEST", "User not found.");
  }

  return {tokenBalance: userDoc.data()?.tokenBalance || 0};
});
