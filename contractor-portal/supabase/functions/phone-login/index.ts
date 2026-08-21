import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone, password } = await request.json();
    const digits = String(phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (digits.length !== 10 || !password) return response({ error: 'Invalid login credentials' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);
    const { data: contractors } = await admin.from('contractors').select('auth_user_id, phone_number').eq('is_active', true);
    const contractor = contractors?.find((item) => {
      const storedDigits = String(item.phone_number ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      return storedDigits === digits;
    });
    if (!contractor?.auth_user_id) return response({ error: 'Invalid login credentials' }, 401);
    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(contractor.auth_user_id);
    const loginEmail = authUser.user?.email;
    if (userError || !loginEmail) return response({ error: 'Invalid login credentials' }, 401);

    const authClient = createClient(url, anonKey);
    const { data, error } = await authClient.auth.signInWithPassword({ email: loginEmail.toLowerCase(), password: String(password) });
    if (error || !data.session) return response({ error: 'Invalid login credentials' }, 401);
    return response({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token });
  } catch {
    return response({ error: 'Invalid login credentials' }, 401);
  }
});

function response(body: object, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
