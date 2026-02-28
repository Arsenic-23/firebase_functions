import {HttpsError, FunctionsErrorCode} from "firebase-functions/v2/https";

export type AppErrorCode =
    | "INSUFFICIENT_TOKENS"
    | "INVALID_REQUEST"
    | "JOB_FAILED"
    | "UNAUTHORIZED";

export class StudioError extends HttpsError {
  constructor(appCode: AppErrorCode, message: string, details?: any) {
    let httpCode: FunctionsErrorCode = "internal";

    switch (appCode) {
    case "INSUFFICIENT_TOKENS":
      httpCode = "resource-exhausted";
      break;
    case "INVALID_REQUEST":
      httpCode = "invalid-argument";
      break;
    case "JOB_FAILED":
      httpCode = "internal";
      break;
    case "UNAUTHORIZED":
      httpCode = "unauthenticated";
      break;
    }

    super(httpCode, message, {code: appCode, details});
  }
}
