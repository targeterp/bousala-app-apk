const fs = require('fs');
const path = require('path');

function processFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('get_current_tenant_id') && !content.includes('get_current_user_role')) return;

  console.log('Processing', file);

  // Inject import
  if (!content.includes('getCurrentTenantIdAndRole')) {
    const depth = file.split(path.sep).length - 2;
    const prefix = depth > 0 ? '../'.repeat(depth) : './';
    const importStr = `import { getCurrentTenantIdAndRole } from '${prefix}lib/tenantHelper';\n`;
    
    // find last import
    const lastImport = content.lastIndexOf('import ');
    if (lastImport !== -1) {
      const eol = content.indexOf('\n', lastImport);
      content = content.slice(0, eol + 1) + importStr + content.slice(eol + 1);
    } else {
      content = importStr + content;
    }
  }

  // Replace get_current_tenant_id calls
  // Most files have: 
  // const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
  // const currentUserId = tenantIdData || sessionData.session?.user.id;
  
  // We can't trivially regex everything cleanly because of variable names (userId vs currentUserId vs tenantId).
  // But we can replace the RPC call itself!
  content = content.replace(
    /await supabase\.rpc\('get_current_tenant_id'\)/g, 
    `(await getCurrentTenantIdAndRole(sessionData?.session?.user?.id || user?.id || (await supabase.auth.getUser()).data.user?.id)).tenantId`
  );
  
  content = content.replace(
    /await supabase\.rpc\('get_current_user_role'\)/g, 
    `(await getCurrentTenantIdAndRole((await supabase.auth.getSession()).data.session?.user?.id)).role`
  );

  // Let's do a more robust regex for the exact blocks:
  // const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
  content = content.replace(
    /const\s+{\s*data:\s*tenantIdData[^}]*}\s*=\s*await\s+supabase\.rpc\('get_current_tenant_id'\);/g,
    `const { tenantId: tenantIdData } = await getCurrentTenantIdAndRole((await supabase.auth.getSession()).data.session?.user?.id);`
  );
  
  content = content.replace(
    /const\s+{\s*data:\s*roleData,\s*error:\s*roleError\s*}\s*=\s*await\s+supabase\.rpc\('get_current_user_role'\);/g,
    `const { role: roleData } = await getCurrentTenantIdAndRole((await supabase.auth.getSession()).data.session?.user?.id); const roleError = null;`
  );

  content = content.replace(
    /supabase\.rpc\('get_current_user_role'\)\.then\(\({ data, error }\) =>/g,
    `getCurrentTenantIdAndRole((await supabase.auth.getSession()).data.session?.user?.id).then(({ role: data }) => { const error = null;`
  );

  fs.writeFileSync(file, content, 'utf8');
}

function walk(dir) {
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) walk(file);
    else if (file.endsWith('.tsx') || file.endsWith('.ts')) processFile(file);
  });
}

walk('./src');
