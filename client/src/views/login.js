/** /login while already signed in simply returns the user to their dashboard. */
import { navigate } from '../router.js';
export async function mount() { navigate('/dashboard', { replace: true }); }
