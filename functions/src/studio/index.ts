import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db, storage, FieldValue } from "../utils/admin";
import { StudioError } from "../utils/errors";
import { deductTokens } from "../tokens";

const POYO_SECRET_KEY = defineSecret("POYO_API_KEY");
const POYO_BASE_URL = "https://api.poyo.ai";

async function saveMediaToStorage(userId: string, jobId: string, url: string, type: "output" | "thumbnail"): Promise<string> {
    const bucket = storage.bucket();

    const extensionMatch = url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
    const ext = extensionMatch ? extensionMatch[1] : "png";
    const destination = `generated/${userId}/${jobId}/${type}.${ext}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download media from Poyo: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let contentType = response.headers.get("content-type");
    if (!contentType) {
        if (ext === "mp4") contentType = "video/mp4";
        else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
        else contentType = "image/png";
    }

    const file = bucket.file(destination);
    await file.save(buffer, {
        metadata: { contentType },
    });

    return `https://storage.googleapis.com/${bucket.name}/${destination}`;
}

async function uploadUrlToPoyo(fileUrl: string, poyoKey: string): Promise<string> {
    if (!poyoKey) throw new Error("POYO_API_KEY is missing in backend.");

    const response = await fetch(`${POYO_BASE_URL}/api/common/upload/url`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${poyoKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_url: fileUrl }),
    });

    const data = await response.json();
    if (data.code !== 200 || !data.success) {
        throw new Error(data.error?.message || data.msg || "Failed to upload reference image to Poyo");
    }

    return data.data.file_url;
}

async function submitPoyoTask(model: string, parameters: any, poyoKey: string): Promise<string> {
    if (!poyoKey) throw new Error("POYO_API_KEY is missing in backend.");

    const response = await fetch(`${POYO_BASE_URL}/api/generate/submit`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${poyoKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: model,
            input: parameters,
        }),
    });

    const data = await response.json();
    if (data.code !== 200) {
        throw new Error(data.error?.message || "Failed to submit Poyo task");
    }

    return data.data.task_id;
}

async function checkPoyoStatus(taskId: string, poyoKey: string): Promise<any> {
    const response = await fetch(`${POYO_BASE_URL}/api/generate/status/${taskId}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${poyoKey}`,
        },
    });

    const data = await response.json();
    if (data.code !== 200) {
        throw new Error(data.error?.message || "Failed to check Poyo status");
    }

    return data.data;
}


export const createStudioJob = onCall(
    { secrets: [POYO_SECRET_KEY] },
    async (request) => {
        if (!request.auth) {
            throw new StudioError("UNAUTHORIZED", "User must be authenticated to create a job.");
        }

        const { provider, model, parameters } = request.data;
        if (!provider || !model || !parameters) {
            throw new StudioError("INVALID_REQUEST", "provider, model, and parameters are required.");
        }

        const userId = request.auth.uid;
        const poyoKey = POYO_SECRET_KEY.value();

        const POYO_MODEL_PRICING: Record<string, number> = {
            // Video Models
            "seedance-2.0": 0,
            "kling-3.0": 27,
            "kling-2.6-motion": 8,
            "seedance-1.5-pro": 9,
            "wan-2.6": 80,
            "grok-imagine": 6,
            "hailuo-02": 7,
            "seedance-1.0-pro": 21,
            "kling-2.6": 65,
            "wan-animate": 7,
            "sora-2": 30,
            "sora-2-pro": 100,
            "veo-3.1": 24,
            "veo-3.1-fast": 24,

            // Image Models
            "nano-banana-2": 5,
            "seedream-5.0-lite": 5,
            "gpt-image-1.5": 2,
            "z-image": 2,
            "seedream-4.5": 5,
            "flux-2": 6,
            "nano-banana-pro": 10,
            "gpt-4o-image": 4,
            "4o-image": 4,
            "nano-banana": 5,

            "default_cost": 10,
        };

        const costTokens = POYO_MODEL_PRICING[model] || POYO_MODEL_PRICING["default_cost"];

        const jobRef = db.collection("jobs").doc();
        const jobId = jobRef.id;

        try {
            await db.runTransaction(async (transaction) => {
                await deductTokens(transaction, userId, costTokens, `Job generated with ${model}`, jobId);

                transaction.set(jobRef, {
                    jobId,
                    userId,
                    provider,
                    model,
                    parameters,
                    costTokens,
                    status: "queued",
                    createdAt: FieldValue.serverTimestamp(),
                });
            });
        } catch (e: any) {
            if (e instanceof StudioError) throw e;
            throw new StudioError("JOB_FAILED", e.message || "Failed to initiate token lock.");
        }

        const poyoParams = { ...parameters };
        try {
            if (poyoParams.reference_image_url) {
                const poyoInternalUrl = await uploadUrlToPoyo(poyoParams.reference_image_url, poyoKey);
                poyoParams.image_url = poyoInternalUrl;
                delete poyoParams.reference_image_url;
            }

            const poyoTaskId = await submitPoyoTask(model, poyoParams, poyoKey);

            await jobRef.update({
                status: "processing",
                poyoTaskId: poyoTaskId,
            });

            return {
                jobId,
                status: "processing",
                message: "Job submitted successfully",
            };
        } catch (err: any) {
            console.error("Task initiation failed", err);

            await jobRef.update({ status: "failed", error: err.message });

            try {
                await db.runTransaction(async (transaction) => {
                    const userRef = db.collection("users").doc(userId);
                    transaction.update(userRef, { tokenBalance: FieldValue.increment(costTokens) });

                    const ledgerRef = db.collection("tokenLedger").doc();
                    transaction.set(ledgerRef, {
                        ledgerId: ledgerRef.id,
                        userId,
                        amount: costTokens,
                        reason: `Refund for failed submission job ${jobId}`,
                        jobId: jobId,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                });
            } catch (refundErr) {
                console.error("CRITICAL: Failed to refund tokens for aborted submission", refundErr);
            }

            throw new StudioError("JOB_FAILED", err.message || "Provider error. Tokens refunded.");
        }
    });


export const getJobStatus = onCall(
    { secrets: [POYO_SECRET_KEY] },
    async (request) => {
        if (!request.auth) {
            throw new StudioError("UNAUTHORIZED", "User must be authenticated.");
        }

        const { jobId } = request.data;
        if (!jobId) throw new StudioError("INVALID_REQUEST", "jobId is required.");

        const jobRef = db.collection("jobs").doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) throw new StudioError("INVALID_REQUEST", "Job not found.");

        const poyoKey = POYO_SECRET_KEY.value();

        const jobData = jobDoc.data()!;
        if (jobData.userId !== request.auth.uid) {
            throw new StudioError("UNAUTHORIZED", "Cannot access other users' jobs.");
        }

        if (jobData.status === "completed" || jobData.status === "failed") {
            return {
                jobId: jobData.jobId,
                status: jobData.status,
                outputUrl: jobData.outputUrl || null,
                error: jobData.error || null,
            };
        }

        if (jobData.status === "processing" && jobData.poyoTaskId) {
            let poyoData;
            try {
                poyoData = await checkPoyoStatus(jobData.poyoTaskId, poyoKey);
            } catch (err: any) {
                console.error("Warning: Temporary failure polling Poyo Task", err);
                return { jobId, status: "processing", error: "Polling upstream gateway..." };
            }

            if (poyoData.status === "finished") {
                const files = poyoData.files || [];
                const mediaFile = files.find((f: any) => f.file_type === "video" || f.file_type === "image") || files[0];
                const externalUrl = mediaFile?.file_url;

                let finalOutputUrl = externalUrl;
                let finalThumbnailUrl = externalUrl;

                if (externalUrl) {
                    try {
                        finalOutputUrl = await saveMediaToStorage(jobData.userId, jobId, externalUrl, "output");
                        finalThumbnailUrl = finalOutputUrl;
                    } catch (saveErr) {
                        console.error("Failed to copy Poyo asset to local Firebase Storage:", saveErr);
                    }
                }

                await db.runTransaction(async (transaction) => {
                    const freshJob = await transaction.get(jobRef);
                    if (freshJob.data()?.status === "completed") return;

                    transaction.update(jobRef, {
                        status: "completed",
                        outputUrl: finalOutputUrl,
                    });

                    const creationRef = db.collection("creations").doc();
                    transaction.set(creationRef, {
                        creationId: creationRef.id,
                        userId: jobData.userId,
                        jobId: jobId,
                        type: jobData.parameters?.type || mediaFile?.file_type || "image",
                        provider: jobData.provider,
                        model: jobData.model,
                        prompt: jobData.parameters?.prompt || "",
                        settings: jobData.parameters,
                        outputUrl: finalOutputUrl,
                        thumbnailUrl: finalThumbnailUrl,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                });

                return {
                    jobId,
                    status: "completed",
                    outputUrl: finalOutputUrl,
                };
            } else if (poyoData.status === "failed") {
                const errorMsg = poyoData.error_message || "Upstream AI failure";

                await db.runTransaction(async (transaction) => {
                    const freshJob = await transaction.get(jobRef);
                    if (freshJob.data()?.status === "failed") return;

                    transaction.update(jobRef, { status: "failed", error: errorMsg });

                    const userRef = db.collection("users").doc(jobData.userId);
                    transaction.update(userRef, { tokenBalance: FieldValue.increment(jobData.costTokens) });

                    const ledgerRef = db.collection("tokenLedger").doc();
                    transaction.set(ledgerRef, {
                        ledgerId: ledgerRef.id,
                        userId: jobData.userId,
                        amount: jobData.costTokens,
                        reason: `Refund for failed rendering task ${jobId}`,
                        jobId: jobId,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                });

                return { jobId, status: "failed", error: errorMsg };
            } else {
                return {
                    jobId,
                    status: "processing",
                    progress: poyoData.progress || 0,
                };
            }
        }

        return { jobId: jobData.jobId, status: jobData.status };
    });
