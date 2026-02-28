import { setGlobalOptions } from "firebase-functions/v2";

// Specifically load dotenv to allow local secret management and local testing.
// In true production, Firebase uses Secret Manager, but this binds them uniformly.
import * as dotenv from "dotenv";
dotenv.config();

// Lower active instances severely to avoid Google Cloud free-tier CPU constraints
setGlobalOptions({
    maxInstances: 2,
    concurrency: 80,
    timeoutSeconds: 300,
    memory: "256MiB",
    cpu: 1
});

export * from "./studio";
export * from "./tokens";
export * from "./creations";
export * from "./community";
export * from "./billing";
export * from "./auth";
