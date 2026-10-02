import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';

export const POST = api('auth.signout', async () => {
  await (await createClient()).auth.signOut();
  return { ok: true };
});
