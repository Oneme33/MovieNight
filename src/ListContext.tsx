import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { joinList } from './db';
import { OUR_PROVIDERS } from './tmdb';

type Session = {
  listId: string;
  code: string;
  memberName: string;
};

export type TitleLang = 'en' | 'nl' | 'original';

type Ctx = {
  session: Session | null;
  loading: boolean;
  titleLang: TitleLang;
  services: string[]; // selected streaming service keys (see OUR_PROVIDERS)
  setSession: (s: Session) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  setTitleLang: (lang: TitleLang) => Promise<void>;
  setServices: (keys: string[]) => Promise<void>;
  clearSession: () => Promise<void>;
};

const STORAGE_KEY = 'filmavond.session.v1';
const LANG_KEY = 'filmavond.titleLang';
const SERVICES_KEY = 'filmavond.services';
const ALL_SERVICES = OUR_PROVIDERS.map((p) => p.key);

const ListContext = createContext<Ctx>({
  session: null,
  loading: true,
  titleLang: 'en',
  services: ALL_SERVICES,
  setSession: async () => {},
  updateName: async () => {},
  setTitleLang: async () => {},
  setServices: async () => {},
  clearSession: async () => {},
});

export function ListProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [titleLang, setTitleLangState] = useState<TitleLang>('en');
  const [services, setServicesState] = useState<string[]>(ALL_SERVICES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Ensure an (anonymous) auth session so locked-down access works.
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (!authSession) await supabase.auth.signInAnonymously();

        const lang = await AsyncStorage.getItem(LANG_KEY);
        if (lang === 'en' || lang === 'nl' || lang === 'original') setTitleLangState(lang);

        const svcRaw = await AsyncStorage.getItem(SERVICES_KEY);
        if (svcRaw) {
          const parsed = JSON.parse(svcRaw);
          if (Array.isArray(parsed) && parsed.length) setServicesState(parsed);
        }

        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s: Session = JSON.parse(raw);
          try {
            // (Re)establish membership — migrates v1.0 users and reinstalls.
            await joinList(s.code, s.memberName);
            setSessionState(s);
          } catch (e: any) {
            if (String(e?.message ?? e).includes('code_not_found')) {
              await AsyncStorage.removeItem(STORAGE_KEY);
            } else {
              setSessionState(s); // keep session on transient/offline errors
            }
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const setSession = async (s: Session) => {
    setSessionState(s);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };

  const updateName = async (name: string) => {
    if (!session) return;
    const next = { ...session, memberName: name };
    setSessionState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const setTitleLang = async (lang: TitleLang) => {
    setTitleLangState(lang);
    await AsyncStorage.setItem(LANG_KEY, lang);
  };

  const setServices = async (keys: string[]) => {
    setServicesState(keys);
    await AsyncStorage.setItem(SERVICES_KEY, JSON.stringify(keys));
  };

  const clearSession = async () => {
    setSessionState(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ListContext.Provider
      value={{ session, loading, titleLang, services, setSession, updateName, setTitleLang, setServices, clearSession }}
    >
      {children}
    </ListContext.Provider>
  );
}

export const useSession = () => useContext(ListContext);
