const fs = require('fs');

let f = fs.readFileSync('src/pages/Products.tsx', 'utf8');

// Replace imports
f = f.replace(
  "import { useSubscription } from '../components/SubscriptionGuard';",
  "import { useSubscription } from '../components/SubscriptionGuard';\nimport { useTenant } from '../contexts/TenantContext';\nimport { useProductsData } from '../hooks/useProductsData';\nimport { useQueryClient } from '@tanstack/react-query';"
);

// Replace state
f = f.replace(
  /const \[products, setProducts\] = useState<Product\[\]>\(\[\]\);\n  const \[suppliers, setSuppliers\] = useState<any\[\]>\(\[\]\);\n  const \[categories, setCategories\] = useState<Category\[\]>\(\[\]\);\n  const \[isLoading, setIsLoading\] = useState\(true\);\n  const \[searchQuery, setSearchQuery\] = useState\(''\);\n  const \[error, setError\] = useState<string \| null>\(null\);\n  const \[userId, setUserId\] = useState<string \| null>\(null\);/g,
  `const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data, isLoading } = useProductsData(tenantId);
  const products = data?.products || [];
  const suppliers = data?.suppliers || [];
  const categories = data?.categories || [];
  const userId = tenantId;
  const error = null;
  const [searchQuery, setSearchQuery] = useState('');`
);

// Remove useEffect for fetchProducts
const matchUseEffect = f.match(/useEffect\(\(\) => \{\n    fetchProducts\(\);\n  \}, \[\]\);\n/);
if (matchUseEffect) {
  f = f.replace(matchUseEffect[0], '');
}

// Remove fetchProducts block
const fetchStartStr = 'const fetchProducts = async () => {';
const fetchEndStr = '  const handleAddProduct = async (e: React.FormEvent) => {';
const sIx = f.indexOf(fetchStartStr);
const eIx = f.indexOf(fetchEndStr);
if (sIx !== -1 && eIx !== -1) {
  f = f.substring(0, sIx) + f.substring(eIx);
}

// Invalidate Queries instead of fetchProducts()
f = f.replace(/await fetchProducts\(\);/g, "queryClient.invalidateQueries({ queryKey: ['products', tenantId] });");
f = f.replace(/fetchProducts\(\);/g, "queryClient.invalidateQueries({ queryKey: ['products', tenantId] });");

fs.writeFileSync('src/pages/Products.tsx', f);
console.log('Products.tsx refactoring complete');
