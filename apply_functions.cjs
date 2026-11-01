const fs = require('fs');
let content = fs.readFileSync('src/pages/Products.tsx', 'utf8');

const injectionToken = "const [isExportingStock, setIsExportingStock] = useState<false | 'pdf' | 'print'>(false);";

const injectedCode = `
  const [error, setError] = useState<string | null>(null);

  const stats = {
    totalProducts: products.length,
    lowStock: products.filter(p => Number(p.stock_quantity) <= 5).length,
    outOfStock: products.filter(p => Number(p.stock_quantity) <= 0).length,
    stockValue: products.reduce((acc, p) => acc + ((Number(p.purchase_price) || 0) * (Number(p.stock_quantity) || 0)), 0)
  };

  const filteredProducts = products.filter(p => {
    const s = searchQuery.toLowerCase();
    return (p.name?.toLowerCase() || '').includes(s) || 
           (p.barcode || '').includes(s) ||
           (p.categories?.name?.toLowerCase() || '').includes(s);
  });

  const openManageModal = (product: any) => {
    setSelectedProduct(product);
    setIsEditing(false);
    setEditForm({
      name: product.name,
      barcode: product.barcode || '',
      sell_price: product.sell_price,
      purchase_price: product.purchase_price || 0,
      stock_quantity: product.stock_quantity,
      unit: product.unit || 'قطعة',
      category: product.categories?.name || '',
      category_id: product.category_id || '',
      images: product.images || (product.image_url ? [product.image_url] : []),
      is_published: product.is_published ?? true,
      supplier_id: product.supplier_id || ''
    });
  };

  const closeManageModal = () => {
    setSelectedProduct(null);
    setIsEditing(false);
  };

  const handleUpdateProduct = async (e: any) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setIsSaving(true);
    try {
      const payload: any = {
        name: editForm.name,
        barcode: editForm.barcode,
        sell_price: Number(editForm.sell_price),
        purchase_price: Number(editForm.purchase_price),
        stock_quantity: Number(editForm.stock_quantity),
        unit: editForm.unit,
        category_id: editForm.category_id || null,
        is_published: editForm.is_published,
        supplier_id: editForm.supplier_id || null
      };
      
      if (editForm.images && editForm.images.length > 0) {
        payload.image_url = editForm.images[0];
      }
      
      const { error } = await supabase.from('products').update(payload).eq('id', selectedProduct.id);
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      setIsEditing(false);
      // toast.success('تم التحديث بنجاح');
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = (e: any, isAdd: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('حجم الصورة يجب أن لا يتجاوز 2 ميجابايت');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      if (isAdd) {
        setAddForm(prev => ({ ...prev, images: [base64String] }));
      } else {
        setEditForm(prev => ({ ...prev, images: [base64String] }));
      }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index: number, isAdd: boolean) => {
    if (isAdd) {
      setAddForm(prev => ({ ...prev, images: [] }));
    } else {
      setEditForm(prev => ({ ...prev, images: [] }));
    }
  };
`;

content = content.replace(injectionToken, injectionToken + "\\n" + injectedCode);
fs.writeFileSync('src/pages/Products.tsx', content);
