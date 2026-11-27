import englishDictionary from './locales/en.js';

export const SUPPORTED_LANGUAGES = [
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩', dir: 'ltr' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', dir: 'ltr' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', flag: '🇹🇼', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', dir: 'ltr' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭', dir: 'ltr' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾', dir: 'ltr' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', dir: 'ltr' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱', dir: 'ltr' }
];
const LANG_STORAGE_KEY = 'xstarzg_lang';
export const FALLBACK_LANGUAGE = 'en';
let currentLang = FALLBACK_LANGUAGE;
let activeDictionary = {};
const dictionaryCache = new Map();

/* Normalisasi tag bahasa apa pun (navigator.language, localStorage) ke kode yang
   benar-benar tersedia. Contoh: en-GB -> en, pt-BR -> pt, zh-Hans -> zh-CN,
   zh-HK -> zh-TW. Tag yang tidak kita miliki menghasilkan '' (tidak didukung). */
export function resolveLanguage(tag) {
  const raw = String(tag || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace('_', '-');
  const exact = SUPPORTED_LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  const base = lower.split('-')[0];
  const byBase = SUPPORTED_LANGUAGES.find((l) => {
    const code = l.code.toLowerCase();
    return code === base || code.split('-')[0] === base;
  });
  return byBase ? byBase.code : '';
}

function browserLanguageTags() {
  const tags = [];
  try {
    if (Array.isArray(navigator.languages)) tags.push(...navigator.languages);
  } catch (_) {}
  try {
    if (navigator.language) tags.push(navigator.language);
  } catch (_) {}
  try {
    if (navigator.userLanguage) tags.push(navigator.userLanguage);
  } catch (_) {}
  return tags;
}

/* Urutan prioritas: pilihan tersimpan -> bahasa sistem perangkat -> English.
   Yang tidak kita miliki diterjemahkan ke bahasa Inggris (bukan dipaksa Indonesia). */
export function detectInitialLanguage() {
  try {
    const saved = resolveLanguage(localStorage.getItem(LANG_STORAGE_KEY));
    if (saved) return saved;
  } catch (_) {}
  for (const tag of browserLanguageTags()) {
    const code = resolveLanguage(tag);
    if (code) return code;
  }
  return FALLBACK_LANGUAGE;
}
export async function setLanguage(langCode) {
  const resolved = resolveLanguage(langCode) || FALLBACK_LANGUAGE;
  const meta = SUPPORTED_LANGUAGES.find((l) => l.code === resolved) ||
    SUPPORTED_LANGUAGES.find((l) => l.code === FALLBACK_LANGUAGE) || SUPPORTED_LANGUAGES[0];
  currentLang = meta.code;
  localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  document.documentElement.setAttribute('lang', currentLang);
  document.documentElement.setAttribute('dir', meta.dir || 'ltr');
  if (dictionaryCache.has(currentLang)) {
    activeDictionary = dictionaryCache.get(currentLang);
    return activeDictionary;
  }
  try {
    const mod = await import(`./locales/${currentLang}.js?v=2027.17`);
    activeDictionary = mod.default || {};
    dictionaryCache.set(currentLang, activeDictionary);
  } catch (_) {
    const fallback = await import('./locales/en.js');
    activeDictionary = fallback.default || {};
  }
  return activeDictionary;
}
export function getLanguage() {
  return currentLang;
}
function readKey(dict, parts) {
  let cur = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return null;
  }
  return typeof cur === 'string' ? cur : null;
}
/* Rantai fallback: kamus bahasa aktif -> kamus English -> teks cadangan kode.
   Artinya kunci yang baru ditambahkan (atau belum diterjemahkan penuh) TIDAK
   pernah bocor sebagai bahasa Indonesia di UI berbahasa lain. */
export function t(keyPath, fallback = '') {
  const parts = String(keyPath).split('.');
  const direct = readKey(activeDictionary, parts);
  if (direct != null) return direct;
  if (currentLang !== FALLBACK_LANGUAGE) {
    const english = readKey(englishDictionary, parts);
    if (english != null) return english;
  }
  return fallback || keyPath;
}
export function applyTranslationsToDOM() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(key, '');
    if (val && val !== key) {
      if (el.tagName === 'TITLE') {
        document.title = val;
      } else {
        el.innerHTML = val;
      }
    }
  });
  // Round 6: dukungan placeholder & tooltip title (input search, email, kode owner dst.)
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const val = t(el.getAttribute('data-i18n-ph'), '');
    if (val) el.setAttribute('placeholder', val);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const val = t(el.getAttribute('data-i18n-title'), '');
    if (val) el.setAttribute('title', val);
  });
}
export function formatNumber(value, decimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  try {
    return new Intl.NumberFormat(currentLang, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  } catch (_) {
    return num.toFixed(decimals);
  }
}
export function formatDateTime(isoOrEpoch) {
  try {
    const d = new Date(isoOrEpoch);
    return new Intl.DateTimeFormat(currentLang, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch (_) {
    return String(isoOrEpoch);
  }
}