import { onCall, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";
import { db, FieldValue } from "../utils/admin";
import { StudioError } from "../utils/errors";
import { addTokensAfterPayment } from "../tokens";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const PLAN_TOKENS: Record<string, number> = {
  starter: 1000,
  pro: 5000,
  unlimited: 50000,
};

const PLAN_PRICES: Record<string, number> = {
  starter: 999,
  pro: 2999,
  unlimited: 9999,
};

export const createCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
    }

    const { plan } = request.data;
    if (!PLAN_TOKENS[plan]) {
      throw new StudioError("INVALID_REQUEST", "Invalid subscription plan.");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: "2023-10-16" as any,
    });

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `StudioX ${plan.charAt(0).toUpperCase() + plan.slice(1)} Token Bundle`,
                description: `${PLAN_TOKENS[plan]} Tokens`,
              },
              unit_amount: PLAN_PRICES[plan],
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: "https://studiox.app/checkout/success",
        cancel_url: "https://studiox.app/checkout/cancel",
        metadata: {
          userId: request.auth.uid,
          plan: plan,
        },
        client_reference_id: request.auth.uid,
      });

      return { sessionId: session.id, url: session.url };
    } catch (e: any) {
      throw new StudioError("JOB_FAILED", e.message || "Failed to create checkout session.");
    }
  }
);

export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
      apiVersion: "2023-10-16" as any,
    });

    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan;

      if (!userId || !plan) {
        console.error("Missing metadata in session.", session);
        res.status(400).send("Missing metadata");
        return;
      }

      const tokensToAdd = PLAN_TOKENS[plan];
      const paymentRef = db.collection("payments").doc(event.id);

      try {
        await db.runTransaction(async (transaction) => {
          const paymentDoc = await transaction.get(paymentRef);
          if (paymentDoc.exists) {
            return;
          }

          transaction.set(paymentRef, {
            userId,
            amountPaid: session.amount_total,
            tokensAdded: tokensToAdd,
            plan,
            status: "completed",
            timestamp: FieldValue.serverTimestamp(),
          });
        });

        await addTokensAfterPayment(userId, tokensToAdd, `Purchased ${plan} plan bundle`);

        res.status(200).send({ received: true });
      } catch (error: any) {
        console.error("Webhook processing failed", error);
        res.status(500).send("Internal Server Error");
        return;
      }
    } else {
      res.status(200).send({ received: true });
    }
  }
);
