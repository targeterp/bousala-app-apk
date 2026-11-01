import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import * as idb from 'idb-keyval';

// Configure React Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

// Configure IndexedDB Persister
const idbPersister = {
  getItem: async (key: string) => await idb.get(key),
  setItem: async (key: string, value: any) => await idb.set(key, value),
  removeItem: async (key: string) => await idb.del(key),
};

const persister = createAsyncStoragePersister({
  storage: idbPersister,
});

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('تحديث جديد متاح. هل تريد تحديث التطبيق الآن؟')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('التطبيق جاهز للعمل بدون اتصال بالإنترنت');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);
