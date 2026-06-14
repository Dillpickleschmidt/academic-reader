/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_blocks from "../api/blocks.js";
import type * as api_configurationPreferences from "../api/configurationPreferences.js";
import type * as api_documentProjections from "../api/documentProjections.js";
import type * as api_documents from "../api/documents.js";
import type * as api_pages from "../api/pages.js";
import type * as api_processingEvents from "../api/processingEvents.js";
import type * as auth from "../auth.js";
import type * as blockValidators from "../blockValidators.js";
import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as model_auth from "../model/auth.js";
import type * as model_blocks from "../model/blocks.js";
import type * as model_configurationPreferences from "../model/configurationPreferences.js";
import type * as model_documentProjections from "../model/documentProjections.js";
import type * as model_documents from "../model/documents.js";
import type * as model_pages from "../model/pages.js";
import type * as model_processingEvents from "../model/processingEvents.js";
import type * as pageValidators from "../pageValidators.js";
import type * as processingEventValidators from "../processingEventValidators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/blocks": typeof api_blocks;
  "api/configurationPreferences": typeof api_configurationPreferences;
  "api/documentProjections": typeof api_documentProjections;
  "api/documents": typeof api_documents;
  "api/pages": typeof api_pages;
  "api/processingEvents": typeof api_processingEvents;
  auth: typeof auth;
  blockValidators: typeof blockValidators;
  env: typeof env;
  http: typeof http;
  "model/auth": typeof model_auth;
  "model/blocks": typeof model_blocks;
  "model/configurationPreferences": typeof model_configurationPreferences;
  "model/documentProjections": typeof model_documentProjections;
  "model/documents": typeof model_documents;
  "model/pages": typeof model_pages;
  "model/processingEvents": typeof model_processingEvents;
  pageValidators: typeof pageValidators;
  processingEventValidators: typeof processingEventValidators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
