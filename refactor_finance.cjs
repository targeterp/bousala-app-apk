const fs = require('fs');

const f = fs.readFileSync('src/pages/Finance.tsx', 'utf8');
let out = f.replace(
  "import { useNavigate } from 'react-router-dom';",
  `import { useNavigate } from 'react-router-dom';\nimport { useTenant } from '../contexts/TenantContext';\nimport { useFinanceData } from '../hooks/useFinanceData';\nimport { useQueryClient } from '@tanstack/react-query';`
);

// State replacement
out = out.replace(
  /const \[transactions, setTransactions\] = useState<any\[\]>\(\[\]\);\n  const \[isLoading, setIsLoading\] = useState\(true\);\n  const \[summary, setSummary\] = useState\(\{ income: 0, expense: 0, balance: 0 \}\);\n  const \[paymentMethodsSummary, setPaymentMethodsSummary\] = useState<Record<string, number>>\(\{\}\);\n/,
  `const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data, isLoading } = useFinanceData(tenantId);
  const transactions = data?.transactions || [];
  
  let income = 0;
  let expense = 0;
  const paymentMethodsSummary: Record<string, number> = {
    cash: 0,
    bankily: 0,
    masrvi: 0,
    sedad: 0
  };
  
  transactions.forEach(t => {
    const amount = Number(t.amount) || 0;
    const method = t.payment_method || 'cash';
    if (method === 'debt_record' || t.reference_type === 'custom_order_debt') return;
    if (t.type === 'income') {
      income += amount;
      paymentMethodsSummary[method] = (paymentMethodsSummary[method] || 0) + amount;
    }
    if (t.type === 'expense') {
      expense += amount;
      paymentMethodsSummary[method] = (paymentMethodsSummary[method] || 0) - amount;
    }
  });

  const summary = { income, expense, balance: income - expense };\n`
);

out = out.replace(
  /const \[entities, setEntities\] = useState<Record<string, any\[\]>>\(\{\n    customer: \[\],\n    supplier: \[\],\n    employee: \[\],\n    partner: \[\]\n  \}\);/g,
  `const entities = {
    customer: data?.customers || [],
    supplier: data?.suppliers || [],
    employee: (data?.employees || []).map((e: any) => ({ id: e.id, name: e.full_name, balance: e.balance })),
    partner: data?.partners || []
  };`
);

let fetchEntitiesRegex = /const fetchEntities = async \(\) => \{[\s\S]*?\};\n\n/g;
out = out.replace(fetchEntitiesRegex, '');

let fetchDataRegex = /const fetchData = async \(\) => \{[\s\S]*?\};\n/g;
out = out.replace(fetchDataRegex, '');

let useEffectsRegex = /useEffect\(\(\) => \{\n    fetchData\(\);\n    fetchEntities\(\);\n  \}, \[\]\);\n/g;
out = out.replace(useEffectsRegex, '');

out = out.replace(/fetchData\(\);/g, "queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });");
out = out.replace(/fetchEntities\(\);/g, "");

fs.writeFileSync('src/pages/Finance.tsx', out);
console.log('Finance.tsx modified successfully!');
