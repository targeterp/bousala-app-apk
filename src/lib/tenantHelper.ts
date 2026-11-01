import { supabase } from './supabase';

export async function getCurrentTenantId() {
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

    if (error) {
      console.warn("Direct query error fetching tenant:", error);
      return { data: userId, error: null };
    }

    if (accessData && accessData.tenant_id && accessData.tenant_id !== userId) {
      return { data: accessData.tenant_id, error: null };
    }
    
    return { data: userId, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getCurrentUserRole() {
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

    if (error) {
      console.warn("Direct query error fetching role:", error);
      return { data: 'admin', error: null };
    }

    if (accessData && accessData.access_role) {
      return { data: accessData.access_role, error: null };
    }
    
    return { data: 'admin', error: null };
  } catch (e) {
    return { data: 'admin', error: e };
  }
}
