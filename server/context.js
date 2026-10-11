/**
 * Request context. The posting engine records who caused an accounting entry
 * even when it runs deep inside a helper that was never handed `req`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage();
export const currentUser = () => requestContext.getStore()?.user || null;
export const currentRequest = () => requestContext.getStore()?.req || null;
