import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type AppSettings = {
  currency: string;
  taxRate: number;
  taxNumber: string;
  receiptHeader: string;
  receiptFooter: string;
  storeAddress: string;
  storePhone: string;
  storeSlug: string;
  storeLogo: string;
  themeColor: string;
  announcementBar: string;
  socialLinks: string;
};

const defaultSettings: AppSettings = {
  currency: 'MRU',
  taxRate: 0,
  taxNumber: '',
  receiptHeader: '',
  receiptFooter: 'شكراً لتسوقكم معنا!',
  storeAddress: '',
  storePhone: '',
  storeSlug: '',
  storeLogo: '',
  themeColor: '#3b82f6',
  announcementBar: '',
  socialLinks: '',
};

type SettingsContextType = {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        setSettings(prev => ({
          ...prev,
          currency: meta.currency || defaultSettings.currency,
          taxRate: meta.taxRate !== undefined ? Number(meta.taxRate) : defaultSettings.taxRate,
          taxNumber: meta.taxNumber || defaultSettings.taxNumber,
          receiptHeader: meta.receiptHeader || defaultSettings.receiptHeader,
          receiptFooter: meta.receiptFooter || defaultSettings.receiptFooter,
          storeAddress: meta.storeAddress || defaultSettings.storeAddress,
          storePhone: meta.storePhone || defaultSettings.storePhone,
          storeSlug: meta.storeSlug || defaultSettings.storeSlug,
          // NOT updating storeLogo from meta as we've moved it out of JWT token. We keep prev.storeLogo.
          storeLogo: prev.storeLogo,
          themeColor: meta.themeColor || defaultSettings.themeColor,
          announcementBar: meta.announcementBar || defaultSettings.announcementBar,
          socialLinks: meta.socialLinks || defaultSettings.socialLinks,
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        
        // Fetch store_logo from profiles to prevent JWT bloat from Base64
        let storeLogoFromProfile = meta.storeLogo || defaultSettings.storeLogo;
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('store_logo')
            .eq('id', user.id)
            .single();
            
          if (profileData && profileData.store_logo) {
            storeLogoFromProfile = profileData.store_logo;
          }
        } catch (e) {}

        setSettings({
          currency: meta.currency || defaultSettings.currency,
          taxRate: meta.taxRate !== undefined ? Number(meta.taxRate) : defaultSettings.taxRate,
          taxNumber: meta.taxNumber || defaultSettings.taxNumber,
          receiptHeader: meta.receiptHeader || defaultSettings.receiptHeader,
          receiptFooter: meta.receiptFooter || defaultSettings.receiptFooter,
          storeAddress: meta.storeAddress || defaultSettings.storeAddress,
          storePhone: meta.storePhone || defaultSettings.storePhone,
          storeSlug: meta.storeSlug || defaultSettings.storeSlug,
          storeLogo: storeLogoFromProfile,
          themeColor: meta.themeColor || defaultSettings.themeColor,
          announcementBar: meta.announcementBar || defaultSettings.announcementBar,
          socialLinks: meta.socialLinks || defaultSettings.socialLinks,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      // Remove storeLogo from metadata to avoid blooming JWT token limit
      const safeMetadata = { ...newSettings };
      delete safeMetadata.storeLogo;

      const { error } = await supabase.auth.updateUser({
        data: safeMetadata
      });
      if (error) throw error;
      
      setSettings(prev => ({ ...prev, ...newSettings }));
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
