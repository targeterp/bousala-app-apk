import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, ShoppingBag, MessageCircle, ChevronRight, ChevronLeft, X, Image as ImageIcon, Instagram, Facebook, Twitter, Youtube, Globe } from 'lucide-react';
import { cn } from '../utils';

type Product = {
  id: string;
  name: string;
  sell_price: number;
  category: string;
  image_url: string;
  images?: string[];
  stock_quantity: number;
  unit?: string;
};

type StoreProfile = {
  business_name: string;
  full_name: string;
  store_phone?: string;
  store_logo?: string;
  theme_color?: string;
  announcement_bar?: string;
  social_links?: string;
};

export function Storefront() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const productIdFromUrl = searchParams.get('product');

  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storeUserId, setStoreUserId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (storeSlug) {
      fetchStoreData();
    }
  }, [storeSlug]);

  useEffect(() => {
    if (productIdFromUrl && products.length > 0) {
      const product = products.find(p => p.id === productIdFromUrl);
      if (product) {
        setSelectedProduct(product);
      }
    }
  }, [productIdFromUrl, products]);

  const fetchStoreData = async () => {
    setIsLoading(true);
    try {
      // First, try to find the store by store_slug or id
      // We will try to select store_slug, store_phone, business_name, full_name, id
      // If the columns don't exist, it will throw an error, so we catch and fallback to just id, full_name
      let profileData = null;
      let actualUserId = storeSlug;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeSlug);

      try {
        let query = supabase
          .from('profiles')
          .select('id, full_name, business_name, store_phone, store_slug, store_logo, theme_color, announcement_bar, social_links');
          
        if (isUUID) {
          query = query.or(`store_slug.eq.${storeSlug},id.eq.${storeSlug}`);
        } else {
          query = query.eq('store_slug', storeSlug);
        }

        const { data, error } = await query.single();
          
        if (!error && data) {
          profileData = data;
          actualUserId = data.id;
        } else {
          throw error || new Error('Not found');
        }
      } catch (err: any) {
        // If the error is PGRST116 (Not found), we shouldn't fallback, the store just doesn't exist
        if (err?.code === 'PGRST116') {
          throw new Error('Store not found');
        }
        
        // Fallback if columns don't exist or query fails
        console.warn('Could not fetch full profile, falling back to basic profile', err);
        
        try {
          let fallbackQuery = supabase
            .from('profiles')
            .select('id, full_name, business_name, store_phone, store_slug');
            
          if (isUUID) {
            fallbackQuery = fallbackQuery.or(`store_slug.eq.${storeSlug},id.eq.${storeSlug}`);
          } else {
            fallbackQuery = fallbackQuery.eq('store_slug', storeSlug);
          }
          
          const { data: fallbackData, error: fallbackError } = await fallbackQuery.single();
          if (fallbackError) throw fallbackError;
          
          profileData = fallbackData;
          actualUserId = fallbackData.id;
        } catch (fallbackErr: any) {
          if (fallbackErr?.code === 'PGRST116') {
            throw new Error('Store not found');
          }
          
          if (!isUUID) {
            throw new Error('Store not found');
          }
          
          const { data: basicData, error: basicError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('id', storeSlug)
            .single();
            
          if (basicError) throw basicError;
          
          profileData = {
            ...basicData,
            business_name: basicData.full_name,
            store_phone: ''
          };
          actualUserId = basicData.id;
        }
      }

      setProfile(profileData);
      setStoreUserId(actualUserId);

      // Fetch published products using the actual user ID
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, barcode, sell_price, stock_quantity, unit, category_id, category, image_url, images')
        .eq('tenant_id', actualUserId)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;
      setProducts(productsData || []);

    } catch (err: any) {
      console.error('Error fetching store:', err);
      setError('تعذر تحميل بيانات المتجر. قد يكون الرابط غير صحيح.');
    } finally {
      setIsLoading(false);
    }
  };

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setCurrentImageIndex(0);
    setSearchParams({ product: product.id });
  };

  const closeProduct = () => {
    setSelectedProduct(null);
    setSearchParams({});
  };

  const filteredProducts = products.filter(p => 
    (selectedCategory === 'الكل' || p.category === selectedCategory) &&
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = ['الكل', ...Array.from(new Set(products.map(p => p.category)))];

  const handleOrderWhatsApp = (product: Product) => {
    const phone = profile?.store_phone || ''; // Needs to be configured in settings and saved to profile
    const message = `مرحباً، أود طلب هذا المنتج:%0A*${product.name}*%0Aالسعر: ${product.sell_price} / ${product.unit || 'قطعة'}%0Aالرابط: ${window.location.href}`;
    const whatsappUrl = `https://wa.me/${phone.replace(/\+/g, '')}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  let parsedSocialLinks: Record<string, string> = {};
  if (profile?.social_links) {
    try {
      parsedSocialLinks = JSON.parse(profile.social_links);
    } catch (e) {
      console.error('Failed to parse social links', e);
    }
  }

  const getSocialIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'instagram': return <Instagram className="w-5 h-5" />;
      case 'facebook': return <Facebook className="w-5 h-5" />;
      case 'twitter':
      case 'x': return <Twitter className="w-5 h-5" />;
      case 'youtube': return <Youtube className="w-5 h-5" />;
      default: return <Globe className="w-5 h-5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-brand-primary">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="font-bold text-lg text-gray-600">جاري تحميل المتجر...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
          <X className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">عذراً!</h1>
        <p className="text-gray-600">{error || 'المتجر غير موجود'}</p>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gray-50 font-sans" 
      dir="rtl"
      style={profile.theme_color ? { '--color-brand-primary': profile.theme_color } as React.CSSProperties : undefined}
    >
      {/* Announcement Bar */}
      {profile.announcement_bar && (
        <div className="bg-brand-primary text-white text-center py-2 text-sm font-bold">
          {profile.announcement_bar}
        </div>
      )}
      {/* Store Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          {profile.store_logo ? (
            <img src={profile.store_logo} alt={profile.business_name} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-full flex items-center justify-center font-bold text-xl shrink-0">
              {profile.business_name?.charAt(0) || profile.full_name?.charAt(0) || 'م'}
            </div>
          )}
          <div>
            <h1 className="text-xl font-black text-gray-900">{profile.business_name || profile.full_name}</h1>
            <p className="text-sm text-gray-500">متجر إلكتروني</p>
          </div>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <input 
          type="text" 
          placeholder="ابحث عن منتج..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-brand-primary outline-none"
        />
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap",
                selectedCategory === cat ? "bg-brand-primary text-white" : "bg-white text-gray-600 border border-gray-200"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-100">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">لا توجد منتجات</h2>
            <p className="text-gray-500">لم يتم العثور على منتجات تطابق بحثك.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                onClick={() => openProduct(product)}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col relative"
              >
                {product.stock_quantity <= 0 && (
                  <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                    نفذت الكمية
                  </div>
                )}
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {product.images && product.images.length > 0 ? (
                    <img 
                      src={product.images[0]} 
                      alt={product.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <ImageIcon className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1 justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm md:text-base line-clamp-2 mb-1">{product.name}</h3>
                    <p className="text-xs text-gray-500 mb-2">{product.category}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-black text-brand-primary text-lg">{product.sell_price} <span className="text-xs font-normal text-gray-500">/ {product.unit || 'قطعة'}</span></span>
                    <button className="w-8 h-8 bg-brand-50 text-brand-primary rounded-full flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-colors">
                      <ShoppingBag className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Product Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="absolute top-4 right-4 z-10">
              <button 
                onClick={closeProduct}
                className="w-10 h-10 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pb-24">
              {/* Image Carousel */}
              <div className="relative aspect-square bg-gray-100">
                {selectedProduct.images && selectedProduct.images.length > 0 ? (
                  <>
                    <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar" style={{ scrollBehavior: 'smooth' }}>
                      {selectedProduct.images.map((img, idx) => (
                        <img 
                          key={idx}
                          src={img} 
                          alt={`${selectedProduct.name} - ${idx + 1}`} 
                          className="w-full h-full object-cover shrink-0 snap-center"
                          id={`product-image-${idx}`}
                        />
                      ))}
                    </div>
                    {/* Dots */}
                    {selectedProduct.images.length > 1 && (
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                        {selectedProduct.images.map((_, idx) => (
                          <div 
                            key={idx} 
                            className={cn(
                              "w-2 h-2 rounded-full transition-all",
                              idx === currentImageIndex ? "bg-white w-4" : "bg-white/50"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageIcon className="w-20 h-20" />
                  </div>
                )}
              </div>

              {/* Product Details */}
              <div className="p-6">
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full mb-3">
                    {selectedProduct.category}
                  </span>
                  <h2 className="text-2xl font-black text-gray-900 leading-tight mb-2">{selectedProduct.name}</h2>
                  <p className="text-3xl font-black text-brand-primary">{selectedProduct.sell_price} <span className="text-base font-normal text-gray-500">/ {selectedProduct.unit || 'قطعة'}</span></p>
                </div>
                
                <div className="space-y-4 py-4 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">حالة التوفر</span>
                    <span className={cn("font-bold", selectedProduct.stock_quantity > 0 ? "text-emerald-600" : "text-red-600")}>
                      {selectedProduct.stock_quantity > 0 ? 'متوفر' : 'نفذت الكمية'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
              <button 
                onClick={() => handleOrderWhatsApp(selectedProduct)}
                disabled={selectedProduct.stock_quantity <= 0 || !profile?.store_phone}
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#25D366]/20"
              >
                <MessageCircle className="w-6 h-6" />
                <span>
                  {selectedProduct.stock_quantity <= 0 
                    ? 'غير متوفر حالياً' 
                    : !profile?.store_phone 
                      ? 'رقم المتجر غير متوفر' 
                      : 'الطلب عبر واتساب'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12 py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-right">
            <h3 className="font-bold text-gray-900">{profile.business_name || profile.full_name}</h3>
            <p className="text-sm text-gray-500 mt-1">جميع الحقوق محفوظة &copy; {new Date().getFullYear()}</p>
          </div>
          
          {Object.keys(parsedSocialLinks).length > 0 && (
            <div className="flex items-center gap-4">
              {Object.entries(parsedSocialLinks).map(([platform, url]) => (
                <a 
                  key={platform} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-brand-primary hover:text-white transition-colors"
                  title={platform}
                >
                  {getSocialIcon(platform)}
                </a>
              ))}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
