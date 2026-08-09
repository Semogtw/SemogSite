import { createBrowserCookieTokenProvider } from "./browser-cookie-token";
import {
  createPrivateDevosClient,
  type PrivateDevosClient,
  type PrivateDevosClientOptions,
} from "./private-devos-client";

export type PrivateDevosBrowserClientOptions = {
  csrfCookieName: string;
  readCookieSource?: () => string;
  fetchImpl?: PrivateDevosClientOptions["fetchImpl"];
};

/**
 * Browser bootstrap for the canonical private DevOS API.
 *
 * The authentication/bootstrap layer supplies the CSRF cookie name; this
 * module never hard-codes it and never imports the server authentication
 * implementation. The token itself is read lazily for every mutation.
 */
export function createPrivateDevosBrowserClient(
  options: PrivateDevosBrowserClientOptions,
): PrivateDevosClient {
  const getCsrfToken = createBrowserCookieTokenProvider(
    options.csrfCookieName,
    options.readCookieSource,
  );
  return createPrivateDevosClient({
    getCsrfToken,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
}
