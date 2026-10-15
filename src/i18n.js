// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js).
// Brand names (Met Office, Weather DataHub) are not translated.
// -----------------------------------------------------------------------------

/** Feature names, frozen when the user adds the device (config `language`). */
export const FEATURE_NAMES = {
  en: {
    temperature: 'Temperature',
    feels_like: 'Feels like',
    humidity: 'Humidity',
    pressure: 'Pressure',
    wind_speed: 'Wind speed',
    wind_gust: 'Wind gusts',
    wind_direction: 'Wind direction',
    precipitation_probability: 'Chance of precipitation',
    precipitation_rate: 'Precipitation rate',
    visibility: 'Visibility',
    uv_index: 'UV index',
    weather: 'Weather conditions',
  },
  fr: {
    temperature: 'Température',
    feels_like: 'Température ressentie',
    humidity: 'Humidité',
    pressure: 'Pression atmosphérique',
    wind_speed: 'Vitesse du vent',
    wind_gust: 'Rafales',
    wind_direction: 'Direction du vent',
    precipitation_probability: 'Probabilité de précipitations',
    precipitation_rate: 'Intensité des précipitations',
    visibility: 'Visibilité',
    uv_index: 'Indice UV',
    weather: 'Conditions météo',
  },
  de: {
    temperature: 'Temperatur',
    feels_like: 'Gefühlte Temperatur',
    humidity: 'Luftfeuchtigkeit',
    pressure: 'Luftdruck',
    wind_speed: 'Windgeschwindigkeit',
    wind_gust: 'Windböen',
    wind_direction: 'Windrichtung',
    precipitation_probability: 'Niederschlagswahrscheinlichkeit',
    precipitation_rate: 'Niederschlagsintensität',
    visibility: 'Sichtweite',
    uv_index: 'UV-Index',
    weather: 'Wetterlage',
  },
  es: {
    temperature: 'Temperatura',
    feels_like: 'Sensación térmica',
    humidity: 'Humedad',
    pressure: 'Presión atmosférica',
    wind_speed: 'Velocidad del viento',
    wind_gust: 'Ráfagas de viento',
    wind_direction: 'Dirección del viento',
    precipitation_probability: 'Probabilidad de precipitación',
    precipitation_rate: 'Intensidad de precipitación',
    visibility: 'Visibilidad',
    uv_index: 'Índice UV',
    weather: 'Estado del tiempo',
  },
};

/**
 * The Met Office significant weather codes (DataHub documentation): -1 to 30.
 * Day and night variants of a shower share one text (2/3, 9/10, 13/14…);
 * 4 is documented as "not used".
 */
export const WEATHER_TEXTS = {
  trace_rain: {
    en: 'Trace rain',
    fr: 'Traces de pluie',
    de: 'Spuren von Regen',
    es: 'Trazas de lluvia',
  },
  clear_night: { en: 'Clear night', fr: 'Nuit claire', de: 'Klare Nacht', es: 'Noche despejada' },
  sunny: { en: 'Sunny', fr: 'Ensoleillé', de: 'Sonnig', es: 'Soleado' },
  partly_cloudy: {
    en: 'Partly cloudy',
    fr: 'Partiellement nuageux',
    de: 'Teilweise bewölkt',
    es: 'Parcialmente nuboso',
  },
  not_available: {
    en: 'Not available',
    fr: 'Non disponible',
    de: 'Nicht verfügbar',
    es: 'No disponible',
  },
  mist: { en: 'Mist', fr: 'Brume', de: 'Dunst', es: 'Neblina' },
  fog: { en: 'Fog', fr: 'Brouillard', de: 'Nebel', es: 'Niebla' },
  cloudy: { en: 'Cloudy', fr: 'Nuageux', de: 'Bewölkt', es: 'Nuboso' },
  overcast: { en: 'Overcast', fr: 'Couvert', de: 'Bedeckt', es: 'Cubierto' },
  light_rain_shower: {
    en: 'Light rain shower',
    fr: 'Faible averse',
    de: 'Leichter Regenschauer',
    es: 'Chubasco ligero',
  },
  drizzle: { en: 'Drizzle', fr: 'Bruine', de: 'Nieselregen', es: 'Llovizna' },
  light_rain: { en: 'Light rain', fr: 'Pluie faible', de: 'Leichter Regen', es: 'Lluvia ligera' },
  heavy_rain_shower: {
    en: 'Heavy rain shower',
    fr: 'Forte averse',
    de: 'Starker Regenschauer',
    es: 'Chubasco fuerte',
  },
  heavy_rain: { en: 'Heavy rain', fr: 'Forte pluie', de: 'Starker Regen', es: 'Lluvia fuerte' },
  sleet_shower: {
    en: 'Sleet shower',
    fr: 'Averse de neige fondue',
    de: 'Schneeregenschauer',
    es: 'Chubasco de aguanieve',
  },
  sleet: { en: 'Sleet', fr: 'Neige fondue', de: 'Schneeregen', es: 'Aguanieve' },
  hail_shower: {
    en: 'Hail shower',
    fr: 'Averse de grêle',
    de: 'Hagelschauer',
    es: 'Chubasco de granizo',
  },
  hail: { en: 'Hail', fr: 'Grêle', de: 'Hagel', es: 'Granizo' },
  light_snow_shower: {
    en: 'Light snow shower',
    fr: 'Faible averse de neige',
    de: 'Leichter Schneeschauer',
    es: 'Chubasco de nieve ligero',
  },
  light_snow: {
    en: 'Light snow',
    fr: 'Neige faible',
    de: 'Leichter Schneefall',
    es: 'Nieve ligera',
  },
  heavy_snow_shower: {
    en: 'Heavy snow shower',
    fr: 'Forte averse de neige',
    de: 'Starker Schneeschauer',
    es: 'Chubasco de nieve fuerte',
  },
  heavy_snow: {
    en: 'Heavy snow',
    fr: 'Fortes chutes de neige',
    de: 'Starker Schneefall',
    es: 'Nevada fuerte',
  },
  thunder_shower: {
    en: 'Thundery shower',
    fr: 'Averse orageuse',
    de: 'Gewitterschauer',
    es: 'Chubasco tormentoso',
  },
  thunder: { en: 'Thunderstorm', fr: 'Orage', de: 'Gewitter', es: 'Tormenta' },
};

// Code → [text key, Feather icon].
const WEATHER_CODES = {
  '-1': ['trace_rain', 'cloud-drizzle'],
  0: ['clear_night', 'moon'],
  1: ['sunny', 'sun'],
  2: ['partly_cloudy', 'cloud'],
  3: ['partly_cloudy', 'cloud'],
  4: ['not_available', 'help-circle'],
  5: ['mist', 'align-justify'],
  6: ['fog', 'align-justify'],
  7: ['cloudy', 'cloud'],
  8: ['overcast', 'cloud'],
  9: ['light_rain_shower', 'cloud-drizzle'],
  10: ['light_rain_shower', 'cloud-drizzle'],
  11: ['drizzle', 'cloud-drizzle'],
  12: ['light_rain', 'cloud-rain'],
  13: ['heavy_rain_shower', 'cloud-rain'],
  14: ['heavy_rain_shower', 'cloud-rain'],
  15: ['heavy_rain', 'cloud-rain'],
  16: ['sleet_shower', 'cloud-snow'],
  17: ['sleet_shower', 'cloud-snow'],
  18: ['sleet', 'cloud-snow'],
  19: ['hail_shower', 'cloud-snow'],
  20: ['hail_shower', 'cloud-snow'],
  21: ['hail', 'cloud-snow'],
  22: ['light_snow_shower', 'cloud-snow'],
  23: ['light_snow_shower', 'cloud-snow'],
  24: ['light_snow', 'cloud-snow'],
  25: ['heavy_snow_shower', 'cloud-snow'],
  26: ['heavy_snow_shower', 'cloud-snow'],
  27: ['heavy_snow', 'cloud-snow'],
  28: ['thunder_shower', 'cloud-lightning'],
  29: ['thunder_shower', 'cloud-lightning'],
  30: ['thunder', 'cloud-lightning'],
};

/** The text of a weather code in a language ("Not available" for an unknown code). */
export function weatherText(code, language) {
  const [key] = WEATHER_CODES[code] ?? ['not_available'];
  return pick(WEATHER_TEXTS[key], language);
}

/** The Feather icon of a weather code. */
export function weatherIcon(code) {
  return (WEATHER_CODES[code] ?? [null, 'help-circle'])[1];
}

/** Every code of the documented list, for the tests. */
export const WEATHER_CODE_LIST = Object.keys(WEATHER_CODES).map(Number);

/** The 16 points of the compass, per language (West is O in French and Spanish). */
export const COMPASS = {
  en: 'N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW'.split(' '),
  fr: 'N NNE NE ENE E ESE SE SSE S SSO SO OSO O ONO NO NNO'.split(' '),
  de: 'N NNO NO ONO O OSO SO SSO S SSW SW WSW W WNW NW NNW'.split(' '),
  es: 'N NNE NE ENE E ESE SE SSE S SSO SO OSO O ONO NO NNO'.split(' '),
};

/** Status messages of the Configuration screen (setConnectionStatus). */
export const STATUS = {
  notConfigured: {
    en: 'Enter your Met Office Weather DataHub API key.',
    fr: "Saisissez votre clé d'API Met Office Weather DataHub.",
    de: 'Gib deinen API-Schlüssel des Met Office Weather DataHub ein.',
    es: 'Introduzca su clave de API de Met Office Weather DataHub.',
  },
  noLocation: {
    en: 'No place to forecast: locate a house in the Gladys settings, or enter coordinates.',
    fr: 'Aucun lieu à prévoir : localisez une maison dans les paramètres de Gladys, ou saisissez des coordonnées.',
    de: 'Kein Ort für die Vorhersage: Lege den Standort eines Hauses in den Gladys-Einstellungen fest oder gib Koordinaten ein.',
    es: 'Ningún lugar que prever: ubique una casa en los ajustes de Gladys o introduzca coordenadas.',
  },
  authFailed: {
    en: 'The Met Office refuses the API key: check it on the Weather DataHub, under My subscriptions.',
    fr: "Le Met Office refuse la clé d'API : vérifiez-la sur le Weather DataHub, rubrique My subscriptions.",
    de: 'Das Met Office lehnt den API-Schlüssel ab: Prüfe ihn im Weather DataHub unter My subscriptions.',
    es: 'El Met Office rechaza la clave de API: compruébela en el Weather DataHub, en My subscriptions.',
  },
  rateLimited: {
    en: 'Daily API quota spent (360 calls on the free plan): reads resume in an hour.',
    fr: "Quota quotidien de l'API épuisé (360 appels avec l'offre gratuite) : reprise des relevés dans une heure.",
    de: 'Tägliches API-Kontingent aufgebraucht (360 Aufrufe im kostenlosen Tarif): Abfragen gehen in einer Stunde weiter.',
    es: 'Cuota diaria de la API agotada (360 llamadas en el plan gratuito): las lecturas se reanudan en una hora.',
  },
  unreachable: {
    en: 'The Met Office Weather DataHub does not answer: check the Internet connection of Gladys.',
    fr: 'Le Met Office Weather DataHub ne répond pas : vérifiez la connexion Internet de Gladys.',
    de: 'Der Met Office Weather DataHub antwortet nicht: Prüfe die Internetverbindung von Gladys.',
    es: 'El Met Office Weather DataHub no responde: compruebe la conexión a Internet de Gladys.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  publishFailed: {
    en: 'Gladys refused the forecast devices, check the integration logs.',
    fr: "Gladys a refusé les appareils de prévision, consultez les journaux de l'intégration.",
    de: 'Gladys hat die Vorhersagegeräte abgelehnt, sieh dir die Protokolle der Integration an.',
    es: 'Gladys ha rechazado los dispositivos de previsión, consulte los registros de la integración.',
  },
};

/** Tooltip of the transport badge of a place whose forecast is out of date. */
export const TRANSPORT = {
  stale: {
    en: 'Forecast out of date: the Met Office has not been read for several hours.',
    fr: "Prévision périmée : le Met Office n'a pas été lu depuis plusieurs heures.",
    de: 'Vorhersage veraltet: Das Met Office wurde seit mehreren Stunden nicht abgefragt.',
    es: 'Previsión caducada: el Met Office no se ha consultado desde hace varias horas.',
  },
};

/** The report of the "Test the connection" action, one table per language. */
export const REPORT = {
  en: {
    notConfigured: STATUS.notConfigured.en,
    noLocation: STATUS.noLocation.en,
    authFailed: STATUS.authFailed.en,
    rateLimited: STATUS.rateLimited.en,
    ok: (name, temperature, weather, km) =>
      `${name}: OK, ${temperature}, ${weather} (model point ${km} km away).`,
    failed: (name) => `${name}: the Met Office does not answer.`,
    refused: (name) => `${name}: position refused by the Met Office.`,
    invalid: (list) => `Ignored, not coordinates: ${list}.`,
    ignored: (list, max) => `Ignored, ${max} places at most: ${list}.`,
    unlocated: (list) => `Ignored, house without a location: ${list}.`,
    pace: (minutes, calls) =>
      `Forecast read every ${minutes} min: about ${calls} API calls a day out of 360.`,
  },
  fr: {
    notConfigured: STATUS.notConfigured.fr,
    noLocation: STATUS.noLocation.fr,
    authFailed: STATUS.authFailed.fr,
    rateLimited: STATUS.rateLimited.fr,
    ok: (name, temperature, weather, km) =>
      `${name} : OK, ${temperature}, ${weather} (point du modèle à ${km} km).`,
    failed: (name) => `${name} : le Met Office ne répond pas.`,
    refused: (name) => `${name} : position refusée par le Met Office.`,
    invalid: (list) => `Ignorées, ce ne sont pas des coordonnées : ${list}.`,
    ignored: (list, max) => `Ignorés, ${max} lieux au plus : ${list}.`,
    unlocated: (list) => `Ignorées, maisons sans localisation : ${list}.`,
    pace: (minutes, calls) =>
      `Prévision lue toutes les ${minutes} min : environ ${calls} appels d'API par jour sur 360.`,
  },
  de: {
    notConfigured: STATUS.notConfigured.de,
    noLocation: STATUS.noLocation.de,
    authFailed: STATUS.authFailed.de,
    rateLimited: STATUS.rateLimited.de,
    ok: (name, temperature, weather, km) =>
      `${name}: OK, ${temperature}, ${weather} (Modellpunkt ${km} km entfernt).`,
    failed: (name) => `${name}: Das Met Office antwortet nicht.`,
    refused: (name) => `${name}: Position vom Met Office abgelehnt.`,
    invalid: (list) => `Ignoriert, keine Koordinaten: ${list}.`,
    ignored: (list, max) => `Ignoriert, höchstens ${max} Orte: ${list}.`,
    unlocated: (list) => `Ignoriert, Haus ohne Standort: ${list}.`,
    pace: (minutes, calls) =>
      `Vorhersage alle ${minutes} Min. abgefragt: etwa ${calls} API-Aufrufe pro Tag von 360.`,
  },
  es: {
    notConfigured: STATUS.notConfigured.es,
    noLocation: STATUS.noLocation.es,
    authFailed: STATUS.authFailed.es,
    rateLimited: STATUS.rateLimited.es,
    ok: (name, temperature, weather, km) =>
      `${name}: OK, ${temperature}, ${weather} (punto del modelo a ${km} km).`,
    failed: (name) => `${name}: el Met Office no responde.`,
    refused: (name) => `${name}: posición rechazada por el Met Office.`,
    invalid: (list) => `Ignoradas, no son coordenadas: ${list}.`,
    ignored: (list, max) => `Ignorados, ${max} lugares como máximo: ${list}.`,
    unlocated: (list) => `Ignoradas, casas sin ubicación: ${list}.`,
    pace: (minutes, calls) =>
      `Previsión consultada cada ${minutes} min: unas ${calls} llamadas a la API al día de 360.`,
  },
};

/** Texts of the dashboard widget, one table per language. */
export const WIDGET_TEXT = {
  en: {
    temperature: 'Temperature',
    rain: 'Chance of rain',
    wind: 'Wind',
    issued: (time) => `Met Office · run of ${time}`,
    next: 'Next hours',
    day: (w) => `Day: ${w}`,
    night: (w) => `Night: ${w}`,
    gust: 'gusts',
    uv: 'UV',
    temperatureSeries: 'Temperature',
    max: 'max',
    min: 'min',
    stale: 'Forecast out of date',
    notConfigured: 'Enter the API key in the integration configuration.',
    noLocation: 'No place: locate a house in Gladys or enter coordinates.',
    waiting: 'No forecast yet: the Met Office is being read.',
  },
  fr: {
    temperature: 'Température',
    rain: 'Risque de pluie',
    wind: 'Vent',
    issued: (time) => `Met Office · calcul de ${time}`,
    next: 'Prochaines heures',
    day: (w) => `Journée : ${w}`,
    night: (w) => `Nuit : ${w}`,
    gust: 'rafales',
    uv: 'UV',
    temperatureSeries: 'Température',
    max: 'max',
    min: 'min',
    stale: 'Prévision périmée',
    notConfigured: "Saisissez la clé d'API dans la configuration de l'intégration.",
    noLocation: 'Aucun lieu : localisez une maison dans Gladys ou saisissez des coordonnées.',
    waiting: 'Pas encore de prévision : lecture du Met Office en cours.',
  },
  de: {
    temperature: 'Temperatur',
    rain: 'Regenrisiko',
    wind: 'Wind',
    issued: (time) => `Met Office · Lauf von ${time}`,
    next: 'Nächste Stunden',
    day: (w) => `Tag: ${w}`,
    night: (w) => `Nacht: ${w}`,
    gust: 'Böen',
    uv: 'UV',
    temperatureSeries: 'Temperatur',
    max: 'max',
    min: 'min',
    stale: 'Vorhersage veraltet',
    notConfigured: 'Gib den API-Schlüssel in der Konfiguration der Integration ein.',
    noLocation: 'Kein Ort: Lege den Standort eines Hauses in Gladys fest oder gib Koordinaten ein.',
    waiting: 'Noch keine Vorhersage: Das Met Office wird gerade abgefragt.',
  },
  es: {
    temperature: 'Temperatura',
    rain: 'Prob. de lluvia',
    wind: 'Viento',
    issued: (time) => `Met Office · cálculo de las ${time}`,
    next: 'Próximas horas',
    day: (w) => `Día: ${w}`,
    night: (w) => `Noche: ${w}`,
    gust: 'ráfagas',
    uv: 'UV',
    temperatureSeries: 'Temperatura',
    max: 'máx',
    min: 'mín',
    stale: 'Previsión caducada',
    notConfigured: 'Introduzca la clave de API en la configuración de la integración.',
    noLocation: 'Ningún lugar: ubique una casa en Gladys o introduzca coordenadas.',
    waiting: 'Aún no hay previsión: se está consultando el Met Office.',
  },
};

/** The language of a table, English as a fallback. */
export function pick(table, language) {
  return table[language] ?? table.en;
}

/** One multi-language object from a function of the language table. */
export function translate(tables, render) {
  return Object.fromEntries(Object.entries(tables).map(([lang, table]) => [lang, render(table)]));
}

export const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** Format a number for a language (decimal comma in fr/de/es). */
export function formatNumber(value, language, digits = 1) {
  return new Intl.NumberFormat(LOCALES[language] ?? 'en-GB', {
    maximumFractionDigits: digits,
  }).format(value);
}
