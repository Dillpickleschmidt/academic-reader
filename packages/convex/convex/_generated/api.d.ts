/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_configurationPreferences from "../api/configurationPreferences.js";
import type * as api_sourceDocuments from "../api/sourceDocuments.js";
import type * as auth from "../auth.js";
import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as model_auth from "../model/auth.js";
import type * as model_configurationPreferences from "../model/configurationPreferences.js";
import type * as model_sourceDocuments from "../model/sourceDocuments.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "api/configurationPreferences": typeof api_configurationPreferences;
  "api/sourceDocuments": typeof api_sourceDocuments;
  auth: typeof auth;
  env: typeof env;
  http: typeof http;
  "model/auth": typeof model_auth;
  "model/configurationPreferences": typeof model_configurationPreferences;
  "model/sourceDocuments": typeof model_sourceDocuments;
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
