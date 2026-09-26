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
      let saved: Session | null = null;
      try {
        const [lang, svcRaw, raw] = await Promise.all([
          AsyncStorage.getItem(LANG_KEY),
          AsyncStorage.getItem(SERVICES_KEY),
          AsyncStorage.getItem(STORAGE_KEY),
        ]);
        if (lang === 'en' || lang === 'nl' || lang === 'original') setTitleLangState(lang);
        if (svcRaw) {
          const parsed = JSON.parse(svcRaw);
          if (Array.isArray(parsed) && parsed.length) setServicesState(parsed);
        }
        if (raw) saved = JSON.parse(raw);
      } catch {}

      // Ensure an (anonymous) auth session so locked-down access works.
      let hadAuth = false;
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        hadAuth = !!authSession;
        if (!authSession) await supabase.auth.signInAnonymously();
      } catch {}

      if (saved) {
        const s = saved;
        // (Re)establish membership — migrates v1.0 users and reinstalls. A known user is
        // already a member, so the app opens right away and this runs in the background.
        const rejoin = joinList(s.code, s.memberName).catch(async (e: any) => {
          if (String(e?.message ?? e).includes('code_not_found')) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            setSessionState(null);
            return 'gone';
          }
          return 'offline'; // keep the session on transient/offline errors
        });
        if (hadAuth) {
          setSessionState(s);
        } else if ((await rejoin) !== 'gone') {
          setSessionState(s);
        }
      }
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
