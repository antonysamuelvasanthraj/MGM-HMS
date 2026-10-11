/** The old single-entry ledger screen now lives in Accounts. */
import { navigate } from './_kit.js';

export async function mount() {
  navigate('/accounts?tab=ledger', { replace: true });
}
