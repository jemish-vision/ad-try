import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEn from "./locales/en.json";
import translationDe from "./locales/de.json";
import translationFr from "./locales/fr.json";
import translationEs from "./locales/es.json";
import translationIt from "./locales/it.json";
import translationPt from "./locales/pt.json";
import translationJa from "./locales/ja.json";
import translationZh from "./locales/zh.json";
import translationHi from "./locales/hi.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    debug: false,
    fallbackLng: 'en',
    supportedLngs: ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'zh', 'hi'],
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    resources: {
      en: { translation: translationEn },
      de: { translation: translationDe },
      fr: { translation: translationFr },
      es: { translation: translationEs },
      it: { translation: translationIt },
      pt: { translation: translationPt },
      ja: { translation: translationJa },
      zh: { translation: translationZh },
      hi: { translation: translationHi }
    }
  });

export default i18n;