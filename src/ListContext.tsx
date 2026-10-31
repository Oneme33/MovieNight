import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { joinList, fetchMembers, touchMember, renameMember } from './db';
import { OUR_PROVIDERS, resetExtrasCache } from './tmdb';
import { APP_VERSION } from './version';
import { setCrashUser } from './sentry';
import { applyUiLangSetting, defaultUiLangSetting, UiLangSetting } from './i18n';

export type Session = {
  listId: string;
  code: string;
  memberName: string;
  memberId?: string; // your list_members.id — ratings and hypes are keyed by it (v1.5)
};

export type TitleLang = 'en' | 'nl' | 'original';

type Ctx = {
  session: Session | null;
  loading: boolean;
  titleLang: TitleLang;
  uiLangSetting: UiLangSetting;
  dataVersion: number;
  services: string[]; // selected streaming service keys (see OUR_PROVIDERS)
  // Display name for a ratings/hype key: a member id, or (older data) already a name.
  nameOf: (key: string | null | undefined) => string;
  refreshMembers: () => void;
  setSession: (s: Session) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  setTitleLang: (lang: TitleLang) => Promise<void>;
  setUiLangSetting: (setting: UiLangSetting) => Promise<void>;
  bumpDataVersion: () => void;
  setServices: (keys: string[]) => Promise<void>;
  clearSession: () => Promise<void>;
};

const STORAGE_KEY = 'filmavond.session.v1';
const LANG_KEY = 'filmavond.titleLang';
const UI_LANG_KEY = 'filmavond.uiLang';
const SERVICES_KEY = 'filmavond.services';
const ALL_SERVICES = OUR_PROVIDERS.map((p) => p.key);

const ListContext = createContext<Ctx>({
  session: null,
  loading: true,
  titleLang: 'en',
  uiLangSetting: defaultUiLangSetting,
  dataVersion: 0,
  services: ALL_SERVICES,
  nameOf: (k) => k ?? '',
  refreshMembers: () => {},
  setSession: async () => {},
  updateName: async () => {},
  setTitleLang: async () => {},
  setUiLangSetting: async () => {},
  bumpDataVersion: () => {},
  setServices: async () => {},
  clearSession: async () => {},
});

export function ListProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [titleLang, setTitleLangState] = useState<TitleLang>('en');
  const [uiLangSetting, setUiLangSettingState] = useState<UiLangSetting>(defaultUiLangSetting);
  const [dataVersion, setDataVersion] = useState(0);
  const [services, setServicesState] = useState<string[]>(ALL_SERVICES);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});

  const nameOf = useCallback((key: string | null | undefined) => (key ? names[key] ?? key : ''), [names]);

  const refreshMembers = useCallback(() => {
    if (!session) return;
    fetchMembers(session.listId)
      .then((ms) => setNames(Object.fromEntries(ms.map((m) => [m.id, m.name]))))
      .catch(() => {});
  }, [session?.listId]);
  useEffect(() => { refreshMembers(); }, [refreshMembers]);

  // Records the app version on your membership and learns your member id.
  const touch = async (s: Session) => {
    const me = await touchMember(s.listId, APP_VERSION).catch(() => null);
    setCrashUser(me?.id ?? s.memberId);
    if (me && me.id !== s.memberId) {
      const next = { ...s, memberId: me.id };
      setSessionState(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }
  };

  useEffect(() => {
    (async () => {
      let saved: Session | null = null;
      try {
        const [uiRaw, lang, svcRaw, raw] = await Promise.all([
          AsyncStorage.getItem(UI_LANG_KEY),
          AsyncStorage.getItem(LANG_KEY),
          AsyncStorage.getItem(SERVICES_KEY),
          AsyncStorage.getItem(STORAGE_KEY),
        ]);
        const uiSetting = uiRaw === 'auto' || uiRaw === 'nl' || uiRaw === 'en' ? uiRaw : defaultUiLangSetting;
        applyUiLangSetting(uiSetting);
        setUiLangSettingState(uiSetting);
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
          rejoin.then((r) => { if (r !== 'gone') touch(s); });
        } else if ((await rejoin) !== 'gone') {
          setSessionState(s);
          touch(s);
        }
      }
      setLoading(false);
    })();
  }, []);

  const setSession = async (s: Session) => {
    setSessionState(s);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    touch(s);
  };

  // Ratings and hypes are keyed by member id, so they follow the new name automatically.
  const updateName = async (name: string) => {
    if (!session) return;
    await renameMember(session.listId, name);
    const next = { ...session, memberName: name };
    setSessionState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    refreshMembers();
  };

  const setTitleLang = async (lang: TitleLang) => {
    setTitleLangState(lang);
    await AsyncStorage.setItem(LANG_KEY, lang);
  };

  const setUiLangSetting = async (setting: UiLangSetting) => {
    applyUiLangSetting(setting);
    resetExtrasCache(); // genre names in cached extras follow the UI language
    setUiLangSettingState(setting);
    await AsyncStorage.setItem(UI_LANG_KEY, setting);
  };

  const bumpDataVersion = () => setDataVersion((v) => v + 1);

  const setServices = async (keys: string[]) => {
    setServicesState(keys);
    await AsyncStorage.setItem(SERVICES_KEY, JSON.stringify(keys));
  };

  const clearSession = async () => {
    setSessionState(null);
    setNames({});
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ListContext.Provider
      value={{ session, loading, titleLang, uiLangSetting, dataVersion, services, nameOf, refreshMembers, setSession, updateName, setTitleLang, setUiLangSetting, bumpDataVersion, setServices, clearSession }}
    >
      {children}
    </ListContext.Provider>
  );
}

export const useSession = () => useContext(ListContext);
