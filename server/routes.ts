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

async function getVisaRate(): Promise<RateItem> {
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
          source: "Visa FX calculator API",
          url,
          updatedAt: `${mm}/${dd}/${yyyy}`,
          status: "live",
          note: "Курс Visa без дополнительной банковской комиссии.",
        };
      }
    } catch {
      // Visa blocks some server-side requests; fall through to the public mirror below.
    }
  }

  const url = "https://ferates.com/visa";
  try {
    const html = await fetchText(url);
    const text = stripTags(html);
    const eurMatch = text.match(/EUR\s+euro\s+([0-9/.\-]+)\s+([0-9]+[.,][0-9]+)/i);
    if (!eurMatch) throw new Error("Visa EUR row not found");
    return {
      pair: "EUR → USD",
      rate: Number(eurMatch[2].replace(",", ".")),
      label: "1 EUR в USD",
      source: "ferates.com, таблица курсов Visa",
      url,
      updatedAt: eurMatch[1],
      status: "live",
      note: "Официальный endpoint Visa недоступен серверу, поэтому используется публичная таблица Visa rates.",
    };
  } catch (error) {
    return {
      pair: "EUR → USD",
      rate: FALLBACKS.visaEurToUsd,
      label: "1 EUR в USD",
      source: "fallback",
      url: "https://usa.visa.com/support/consumer/travel-support/exchange-rate-calculator.html",
      status: "fallback",
      note: `Не удалось обновить курс Visa: ${String(error)}. Используется последнее известное значение.`,
    };
  }
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
