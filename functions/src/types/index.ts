import {Timestamp} from "firebase-admin/firestore";

export interface UserDoc {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
    tokenBalance: number;
    plan: string;
    createdAt: Timestamp | FirebaseFirestore.FieldValue;
}

export interface Job {
    jobId: string;
    userId: string;
    provider: string;
    model: string;
    parameters: any;
    costTokens: number;
    status: "queued" | "processing" | "completed" | "failed";
    outputUrl?: string;
    createdAt: Timestamp | FirebaseFirestore.FieldValue;
}

export interface Creation {
    creationId: string;
    userId: string;
    jobId: string;
    type: string;
    provider: string;
    model: string;
    prompt: string;
    settings: any;
    outputUrl: string;
    thumbnailUrl: string;
    createdAt: Timestamp | FirebaseFirestore.FieldValue;
}

export interface TokenLedger {
    ledgerId: string;
    userId: string;
    amount: number;
    reason: string;
    jobId?: string; // Optional, tied to job if spent
    createdAt: Timestamp | FirebaseFirestore.FieldValue;
}

export interface Post {
    postId: string;
    userId: string;
    creationId: string;
    caption: string;
    mediaUrl: string;
    likesCount: number;
    commentsCount: number;
    createdAt: Timestamp | FirebaseFirestore.FieldValue;
}

export interface Comment {
    commentId: string;
    postId: string;
    userId: string;
    text: string;
    createdAt: Timestamp | FirebaseFirestore.FieldValue;
}

export interface Like {
    likeId: string;
    postId: string;
    userId: string;
    createdAt: Timestamp | FirebaseFirestore.FieldValue;
}
