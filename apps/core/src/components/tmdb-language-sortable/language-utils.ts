import { countries, languages, type TLanguageCode } from "countries-list";

export interface LanguageInfo {
  code: TLanguageCode;
  native: string;
}

export interface CountryInfo {
  code: string;
  native: string;
}

// 获取所有语言列表
export const getAllLanguages = (): LanguageInfo[] => {
  return Object.entries(languages).map(([code, lang]) => ({
    code: code as TLanguageCode,
    native: lang.native,
  }));
};

// 根据语言代码获取使用该语言的国家列表
export const getCountriesForLanguage = (langCode: string): CountryInfo[] => {
  return Object.entries(countries)
    .filter(([, info]) => info.languages.includes(langCode as TLanguageCode))
    .map(([code, info]) => ({
      code,
      native: info.native,
    }));
};

// 根据代码获取语言显示名称
export const getLanguageDisplayName = (code: string): string => {
  if (code === "null") {
    return "无语言标签";
  }

  // 尝试解析 lang-country 格式
  const parts = code.split("-");
  const langCode = parts[0] as TLanguageCode;
  const countryCode = parts[1] as keyof typeof countries | undefined;

  const langInfo = languages[langCode];

  if (countryCode) {
    const countryInfo = countries[countryCode];
    if (langInfo && countryInfo) {
      return `${langInfo.native}（${countryInfo.native}）`;
    }
  }

  if (langInfo) {
    return langInfo.native;
  }

  return code;
};

// 获取语言信息
export const getLanguageInfo = (langCode: string): LanguageInfo | null => {
  const lang = languages[langCode as TLanguageCode];
  if (!lang) return null;
  return {
    code: langCode as TLanguageCode,
    native: lang.native,
  };
};

// 获取国家信息
export const getCountryInfo = (countryCode: string): CountryInfo | null => {
  const country = countries[countryCode as keyof typeof countries];
  if (!country) return null;
  return {
    code: countryCode,
    native: country.native,
  };
};
