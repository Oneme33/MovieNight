import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  setSession: (s: Session) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  setTitleLang: (lang: TitleLang) => Promise<void>;
  clearSession: () => Promise<void>;
};

const STORAGE_KEY = 'filmavond.session.v1';
const LANG_KEY = 'filmavond.titleLang';

const ListContext = createContext<Ctx>({
  session: null,
  loading: true,
  titleLang: 'en',
  setSession: async () => {},
  updateName: async () => {},
  setTitleLang: async () => {},
  clearSession: async () => {},
});

export function ListProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [titleLang, setTitleLangState] = useState<TitleLang>('en');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setSessionState(JSON.parse(raw));
        const lang = await AsyncStorage.getItem(LANG_KEY);
        if (lang === 'en' || lang === 'nl' || lang === 'original') setTitleLangState(lang);
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

  const clearSession = async () => {
    setSessionState(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ListContext.Provider
      value={{ session, loading, titleLang, setSession, updateName, setTitleLang, clearSession }}
    >
      {children}
    </ListContext.Provider>
  );
}

export const useSession = () => useContext(ListContext);
