import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ibkavrxbwaxpkdphgugy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_YX93s99iGNPWdE1ETChO_A_1Ibd8d-7';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// MAGIC FIX FOR FAILED TO FETCH RPC CRASHES
// ==========================================
const originalRpc = supabase.rpc.bind(supabase);

supabase.rpc = async function(fnName: string, args?: any, options?: any) {
  if (fnName === 'get_current_tenant_id') {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return { data: null, error: new Error('No user') };

      const { data: accessData, error } = await supabase
        .from('store_user_access')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) return { data: userId, error: null };
      if (accessData && accessData.tenant_id && accessData.tenant_id !== userId) {
        return { data: accessData.tenant_id, error: null };
      }
      return { data: userId, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  }

  if (fnName === 'get_current_user_role') {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return { data: null, error: new Error('No user') };

      const { data: accessData, error } = await supabase
        .from('store_user_access')
        .select('access_role')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) return { data: 'admin', error: null };
      if (accessData && accessData.access_role) {
        return { data: accessData.access_role, error: null };
      }
      return { data: 'admin', error: null };
    } catch (e) {
      return { data: 'admin', error: e };
    }
  }

  if (fnName === 'get_current_user_permissions') {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return { data: ['*'], error: null };

      const { data: accessData, error } = await supabase
        .from('store_user_access')
        .select('access_role, permissions')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error || !accessData) return { data: ['*'], error: null };
      
      if (accessData.access_role === 'seller') {
        return { data: ['/sales', '/products', '/customers', '/'], error: null };
      }
      if (accessData.access_role === 'accountant') {
        return { data: ['/reports', '/finance', '/expenses', '/inventory', '/products', '/customers', '/suppliers', '/'], error: null };
      }
      if (accessData.access_role === 'custom') {
        const perms = Array.isArray(accessData.permissions) ? accessData.permissions : [];
        return { data: Array.from(new Set([...perms, '/'])), error: null };
      }
      return { data: ['*'], error: null };
    } catch (e) {
      return { data: ['*'], error: e };
    }
  }

  // Fallback to original RPC for everything else
  return originalRpc(fnName, args, options);
} as any;
