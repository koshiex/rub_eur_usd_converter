import type { Express } from "express";
import { createServer, type Server } from "http";

type RateItem = {
  pair: string;
  rate: number | null;
  label: string;
  source: string;
  url: string;
  updatedAt?: string;
  status: "live" | "fallback" | "error";
  note?: string;
};

type RatesResponse = {
  fetchedAt: string;
  rates: {
    mirRubToByn: RateItem;
    bnbBynPerEur: RateItem;
    visaEurToUsd: RateItem;
  };
};

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "ru,en;q=0.9",
};

const FALLBACKS = {
  mirRubToByn: 0.03664,
  bnbBynPerEur: 3.379,
  visaEurToUsd: 1.1605,
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#xE001;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getMirRate(): Promise<RateItem> {
  const url = "https://onlymir.ru/byn";
  try {
    const html = await fetchText(url);
    const text = stripTags(html);
    const bynToRub = text.match(/1\s*BYN[^0-9]+([0-9]+[.,][0-9]+)/i);
    const rubToByn = text.match(/1\s*RUB[^0-9]+([0-9]+[.,][0-9]+)/i);
    const date = text.match(/курс(?: валют)?(?: ПС)?\s*МИР[^0-9]*(\d{2}\.\d{2}\.\d{4})/i);

    if (!rubToByn && !bynToRub) throw new Error("MIR BYN rate not found");
    const rate = rubToByn
      ? Number(rubToByn[1].replace(",", "."))
      : 1 / Number(bynToRub?.[1].replace(",", "."));

    return {
      pair: "RUB → BYN",
      rate,
      label: "1 RUB в BYN",
      source: "onlymir.ru, курс ПС «Мир»",
      url,
      updatedAt: date?.[1],
      status: "live",
      note: "Парсится курс платежной системы «Мир» для BYN/RUB.",
    };
  } catch (error) {
    return {
      pair: "RUB → BYN",
      rate: FALLBACKS.mirRubToByn,
      label: "1 RUB в BYN",
      source: "fallback",
      url,
      status: "fallback",
      note: `Не удалось обновить курс Мир: ${String(error)}. Используется последнее известное значение.`,
    };
  }
}

async function getBnbRate(): Promise<RateItem> {
  const url = "https://bnb.by/kursy-valyut/imbank/";
  try {
    const html = await fetchText(url);
    const config = html.match(/class="jsConfig"\s+value='([^']+)'/);
    const date = stripTags(html).match(/Курс на\s*(\d{2}\.\d{2}\.\d{4})/);
    if (config) {
      const json = JSON.parse(config[1].replace(/&quot;/g, '"'));
      const directBynToEur = Number(json?.BYN?.EUR?.SALE);
      const sale = Number(json?.CUR_VAL?.["33"]?.SALE);
      const bynPerEur = Number.isFinite(directBynToEur) && directBynToEur > 0 ? 1 / directBynToEur : sale;
      if (Number.isFinite(bynPerEur) && bynPerEur > 0) {
        return {
          pair: "BYN → EUR",
          rate: bynPerEur,
          label: "BYN за 1 EUR, банк продаёт EUR",
          source: "БНБ-Банк, курсы BNB-Bank",
          url,
          updatedAt: date?.[1],
          status: "live",
          note: "Используется курс для текущих счетов в приложении без участия банковской карты.",
        };
      }
    }

    const text = stripTags(html);
    const match = text.match(/EUR\s+([0-9]+[.,][0-9]+)\s+([0-9]+[.,][0-9]+)/);
    if (!match) throw new Error("BNB EUR sale rate not found");
    return {
      pair: "BYN → EUR",
      rate: Number(match[2].replace(",", ".")),
      label: "BYN за 1 EUR, банк продаёт EUR",
      source: "БНБ-Банк, курсы BNB-Bank",
      url,
      updatedAt: date?.[1],
      status: "live",
      note: "Извлечено из таблицы курса EUR.",
    };
  } catch (error) {
    return {
      pair: "BYN → EUR",
      rate: FALLBACKS.bnbBynPerEur,
      label: "BYN за 1 EUR, банк продаёт EUR",
      source: "fallback",
      url,
      status: "fallback",
      note: `Не удалось обновить курс БНБ: ${String(error)}. Используется последнее известное значение.`,
    };
  }
}

async function tryVisaOfficial(): Promise<RateItem | null> {
  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const yyyy = today.getUTCFullYear();
  const encodedDate = `${mm}%2F${dd}%2F${yyyy}`;
  const visaUrls = [
    `https://usa.visa.com/cmsapi/fx/rates?amount=100&fee=0&utcConvertedDate=${encodedDate}&exchangedate=${encodedDate}&fromCurr=EUR&toCurr=USD`,
    `https://www.visa.com.au/cmsapi/fx/rates?amount=100&fee=0&utcConvertedDate=${encodedDate}&exchangedate=${encodedDate}&fromCurr=EUR&toCurr=USD`,
  ];

  for (const url of visaUrls) {
    try {
      const raw = await fetchText(url);
      const data = JSON.parse(raw);
      const converted = Number(
        data?.convertedAmount ||
          data?.destinationAmount ||
          data?.toAmountWithVisaRate ||
          data?.originalValues?.convertedAmount,
      );
      const rate = converted ? converted / 100 : Number(data?.fxRateVisa || data?.rate);
      if (Number.isFinite(rate) && rate > 0) {
        return {
          pair: "EUR → USD",
          rate,
          label: "1 EUR в USD",
          source: "Visa FX calculator API (usa.visa.com/cmsapi)",
          url,
          updatedAt: `${mm}/${dd}/${yyyy}`,
          status: "live",
          note: "Курс Visa без дополнительной банковской комиссии.",
        };
      }
    } catch {
      // Visa cmsapi blocks many server-side requests; fall through to the public mirror below.
    }
  }
  return null;
}

function parseFeratesVisaRow(text: string): { date?: string; bid?: number; ask?: number } | null {
  const match = text.match(
    /EUR\s*euro\s*(\d{2}\/\d{2}\/\d{4})\s*([0-9]+[.,][0-9]+)(?:\s*[-+]?[0-9]+[.,][0-9]+)?\s*([0-9]+[.,][0-9]+)/i,
  );
  if (!match) return null;
  const bid = Number(match[2].replace(",", "."));
  const ask = Number(match[3].replace(",", "."));
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  return { date: match[1], bid, ask };
}

async function tryFeratesAjax(): Promise<RateItem | null> {
  const url = "https://new.ferates.com/ajax/cards/ratesTable?type=visa&currency=";
  try {
    const ajaxHeaders = {
      ...headers,
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://new.ferates.com/cards",
    };
    const response = await fetch(url, { headers: ajaxHeaders });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = (await response.json()) as { view?: string };
    if (!data?.view) throw new Error("ferates ajax response missing view");
    const text = stripTags(data.view);
    const parsed = parseFeratesVisaRow(text);
    if (!parsed || !parsed.ask) throw new Error("Visa EUR row not found in ferates ajax");
    return {
      pair: "EUR → USD",
      rate: parsed.ask,
      label: "1 EUR в USD",
      source: "new.ferates.com, таблица Visa exchange rates (ask/sale)",
      url: "https://new.ferates.com/cards",
      updatedAt: parsed.date,
      status: "live",
      note: `Официальный endpoint Visa блокирует серверные запросы, поэтому используется публичная таблица Visa rates с new.ferates.com. Взят курс ask (sale) — им Visa рассчитывает EUR → USD при списании с карты; bid для справки: ${parsed.bid?.toFixed(4)}.`,
    };
  } catch {
    return null;
  }
}

async function tryFeratesPage(): Promise<RateItem | null> {
  const url = "https://new.ferates.com/cards";
  try {
    const html = await fetchText(url);
    const text = stripTags(html);
    const parsed = parseFeratesVisaRow(text);
    if (!parsed || !parsed.ask) return null;
    return {
      pair: "EUR → USD",
      rate: parsed.ask,
      label: "1 EUR в USD",
      source: "new.ferates.com/cards, таблица Visa exchange rates (ask/sale)",
      url,
      updatedAt: parsed.date,
      status: "live",
      note: `Официальный endpoint Visa блокирует серверные запросы, поэтому используется публичная таблица Visa rates со страницы new.ferates.com/cards. Взят курс ask (sale); bid для справки: ${parsed.bid?.toFixed(4)}.`,
    };
  } catch {
    return null;
  }
}

async function getVisaRate(): Promise<RateItem> {
  const errors: string[] = [];
  try {
    const official = await tryVisaOfficial();
    if (official) return official;
    errors.push("Visa cmsapi: нет валидного ответа");
  } catch (error) {
    errors.push(`Visa cmsapi: ${String(error)}`);
  }

  try {
    const ajax = await tryFeratesAjax();
    if (ajax) return ajax;
    errors.push("new.ferates.com ajax: EUR не найден");
  } catch (error) {
    errors.push(`new.ferates.com ajax: ${String(error)}`);
  }

  try {
    const page = await tryFeratesPage();
    if (page) return page;
    errors.push("new.ferates.com/cards: EUR не найден");
  } catch (error) {
    errors.push(`new.ferates.com/cards: ${String(error)}`);
  }

  return {
    pair: "EUR → USD",
    rate: FALLBACKS.visaEurToUsd,
    label: "1 EUR в USD",
    source: "fallback",
    url: "https://usa.visa.com/support/consumer/travel-support/exchange-rate-calculator.html",
    status: "fallback",
    note: `Не удалось обновить курс Visa (${errors.join("; ")}). Используется последнее известное значение.`,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/rates", async (_req, res) => {
    const [mirRubToByn, bnbBynPerEur, visaEurToUsd] = await Promise.all([
      getMirRate(),
      getBnbRate(),
      getVisaRate(),
    ]);

    const payload: RatesResponse = {
      fetchedAt: new Date().toISOString(),
      rates: {
        mirRubToByn,
        bnbBynPerEur,
        visaEurToUsd,
      },
    };

    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  });

  return httpServer;
}
