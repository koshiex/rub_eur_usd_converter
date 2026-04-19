import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Calculator, CreditCard, Moon, RefreshCw, Settings2, ShoppingCart, Sun, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";

type RateStatus = "live" | "fallback" | "error";

type RateItem = {
  pair: string;
  rate: number | null;
  label: string;
  source: string;
  url: string;
  updatedAt?: string;
  status: RateStatus;
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

const fmt = (value: number, currency: "RUB" | "BYN" | "EUR" | "USD", digits = 2) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const num = (value: number, digits = 6) =>
  new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
  }).format(value);

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return { theme, setTheme };
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg
        aria-label="Route FX"
        viewBox="0 0 48 48"
        className="h-10 w-10 text-primary"
        fill="none"
        data-testid="logo-route-fx"
      >
        <path d="M10 13.5h17.5c5.8 0 10.5 4.7 10.5 10.5S33.3 34.5 27.5 34.5H10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M17 21l-7-7 7-7M31 27l7 7-7 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="24" r="3.5" fill="currentColor" />
      </svg>
      <div>
        <div className="text-sm font-semibold tracking-tight">RUB Route</div>
        <div className="text-xs text-muted-foreground">MIR · BNB · Visa · Pyypl</div>
      </div>
    </div>
  );
}

function RatePill({ item }: { item: RateItem }) {
  const variant = item.status === "live" ? "default" : "secondary";
  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid={`card-rate-${item.pair}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.pair}</div>
          <div className="mt-1 font-mono text-lg font-semibold">{item.rate ? num(item.rate, 6) : "нет данных"}</div>
        </div>
        <Badge variant={variant} data-testid={`badge-status-${item.pair}`}>
          {item.status === "live" ? "live" : "fallback"}
        </Badge>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{item.label}</div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-xs text-primary underline-offset-4 hover:underline"
        data-testid={`link-source-${item.pair}`}
      >
        {item.source}
      </a>
      {item.updatedAt && <div className="mt-1 text-xs text-muted-foreground">Дата курса: {item.updatedAt}</div>}
    </div>
  );
}

function StepRow({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="grid gap-1 rounded-lg bg-muted/60 p-4 sm:grid-cols-[1fr_auto] sm:items-center" data-testid={`row-step-${title}`}>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Home() {
  const { theme, setTheme } = useTheme();
  const [rub, setRub] = useState(100000);
  const [pyyplFixed, setPyyplFixed] = useState(0.5);
  const [pyyplPercent, setPyyplPercent] = useState(3.5);
  const [pyyplCardFixed, setPyyplCardFixed] = useState(0);
  const [pyyplCardPercent, setPyyplCardPercent] = useState(5);
  const [targetEurBnb, setTargetEurBnb] = useState(100);
  const [targetUsdPyypl, setTargetUsdPyypl] = useState(100);
  const [targetEurPyypl, setTargetEurPyypl] = useState(100);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<RatesResponse>({
    queryKey: ["/api/rates"],
    staleTime: 1000 * 60 * 10,
  });

  const calc = useMemo(() => {
    const mir = data?.rates.mirRubToByn.rate ?? 0;
    const bnb = data?.rates.bnbBynPerEur.rate ?? 0;
    const visa = data?.rates.visaEurToUsd.rate ?? 0;
    const byn = rub * mir;
    const eur = bnb > 0 ? byn / bnb : 0;
    const usdBeforeFee = eur * visa;
    const usdAfterFee = Math.max(0, usdBeforeFee * (1 - pyyplPercent / 100) - pyyplFixed);
    const pyyplFee = usdBeforeFee - usdAfterFee;
    const minTopUpOk = usdBeforeFee >= 20;
    const rubForMinTopUp = mir > 0 && bnb > 0 && visa > 0 ? (20 / visa) * bnb / mir : 0;

    const usdToEurRate = visa > 0 ? 1 / visa : 0;
    const pyyplCardFeeUsd = Math.max(0, usdAfterFee * (pyyplCardPercent / 100) + pyyplCardFixed);
    const usdAvailableForFx = Math.max(0, usdAfterFee - pyyplCardFeeUsd);
    const eurFinal = usdAvailableForFx * usdToEurRate;

    return {
      byn,
      eur,
      usdBeforeFee,
      usdAfterFee,
      pyyplFee,
      minTopUpOk,
      rubForMinTopUp,
      usdToEurRate,
      pyyplCardFeeUsd,
      usdAvailableForFx,
      eurFinal,
    };
  }, [data, pyyplFixed, pyyplPercent, pyyplCardFixed, pyyplCardPercent, rub]);

  const reverse = useMemo(() => {
    const mir = data?.rates.mirRubToByn.rate ?? 0;
    const bnb = data?.rates.bnbBynPerEur.rate ?? 0;
    const visa = data?.rates.visaEurToUsd.rate ?? 0;
    const ratesOk = mir > 0 && bnb > 0 && visa > 0;
    const topUpFactor = 1 - pyyplPercent / 100;
    const cardFactor = 1 - pyyplCardPercent / 100;

    // Сценарий 1 reverse: платим N EUR с BNB → RUB → BYN → EUR
    const s1BynNeeded = targetEurBnb * bnb;
    const s1RubNeeded = mir > 0 ? s1BynNeeded / mir : 0;

    // Сценарий 2 reverse: хотим иметь N USD на Pyypl после комиссии top up
    const s2UsdBeforeFee = topUpFactor > 0 ? (targetUsdPyypl + pyyplFixed) / topUpFactor : 0;
    const s2EurNeeded = visa > 0 ? s2UsdBeforeFee / visa : 0;
    const s2BynNeeded = s2EurNeeded * bnb;
    const s2RubNeeded = mir > 0 ? s2BynNeeded / mir : 0;
    const s2MinTopUpOk = s2UsdBeforeFee >= 20;
    const s2UsdForMinTopUp = 20;
    const s2EurForMinTopUp = visa > 0 ? s2UsdForMinTopUp / visa : 0;
    const s2BynForMinTopUp = s2EurForMinTopUp * bnb;
    const s2RubForMinTopUp = mir > 0 ? s2BynForMinTopUp / mir : 0;
    const s2PyyplFee = s2UsdBeforeFee - targetUsdPyypl;

    // Сценарий 3 reverse: хотим покупку N EUR через Pyypl USD (USD→EUR по инверсии Visa, card fee, затем top-up fee)
    const s3UsdForFx = targetEurPyypl * visa;
    const s3UsdAfterTopup = cardFactor > 0 ? (s3UsdForFx + pyyplCardFixed) / cardFactor : 0;
    const s3UsdBeforeTopup = topUpFactor > 0 ? (s3UsdAfterTopup + pyyplFixed) / topUpFactor : 0;
    const s3EurNeeded = visa > 0 ? s3UsdBeforeTopup / visa : 0;
    const s3BynNeeded = s3EurNeeded * bnb;
    const s3RubNeeded = mir > 0 ? s3BynNeeded / mir : 0;
    const s3MinTopUpOk = s3UsdBeforeTopup >= 20;
    const s3PyyplTopUpFee = s3UsdBeforeTopup - s3UsdAfterTopup;
    const s3PyyplCardFee = s3UsdAfterTopup - s3UsdForFx;
    const s3UsdToEurRate = visa > 0 ? 1 / visa : 0;

    return {
      ratesOk,
      s1: { bynNeeded: s1BynNeeded, rubNeeded: s1RubNeeded },
      s2: {
        usdBeforeFee: s2UsdBeforeFee,
        eurNeeded: s2EurNeeded,
        bynNeeded: s2BynNeeded,
        rubNeeded: s2RubNeeded,
        minTopUpOk: s2MinTopUpOk,
        rubForMinTopUp: s2RubForMinTopUp,
        pyyplFee: s2PyyplFee,
      },
      s3: {
        usdForFx: s3UsdForFx,
        usdAfterTopup: s3UsdAfterTopup,
        usdBeforeTopup: s3UsdBeforeTopup,
        eurNeeded: s3EurNeeded,
        bynNeeded: s3BynNeeded,
        rubNeeded: s3RubNeeded,
        minTopUpOk: s3MinTopUpOk,
        pyyplTopUpFee: s3PyyplTopUpFee,
        pyyplCardFee: s3PyyplCardFee,
        usdToEurRate: s3UsdToEurRate,
      },
    };
  }, [data, pyyplFixed, pyyplPercent, pyyplCardFixed, pyyplCardPercent, targetEurBnb, targetUsdPyypl, targetEurPyypl]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3">
        Перейти к калькулятору
      </a>
      <header className="border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Переключить тему"
            data-testid="button-toggle-theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <section id="content" className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="overflow-hidden border-card-border lg:col-span-7 xl:col-span-8">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">Конвертер твоего маршрута</CardTitle>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    RUB карта РФ → BYN БНБ Белкарт → EUR счёт БНБ → USD Pyypl. Курсы подтягиваются с сервера, комиссию Pyypl можно менять.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="rub-input">Сумма на старте, RUB</Label>
                <Input
                  id="rub-input"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  value={rub}
                  onChange={(event) => setRub(Number(event.target.value || 0))}
                  className="h-12 font-mono text-lg"
                  data-testid="input-rub-amount"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pyypl-fixed">Pyypl fixed, USD</Label>
                  <Input
                    id="pyypl-fixed"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pyyplFixed}
                    onChange={(event) => setPyyplFixed(Number(event.target.value || 0))}
                    data-testid="input-pyypl-fixed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pyypl-percent">Pyypl percent, %</Label>
                  <Input
                    id="pyypl-percent"
                    type="number"
                    min="0"
                    step="0.1"
                    value={pyyplPercent}
                    onChange={(event) => setPyyplPercent(Number(event.target.value || 0))}
                    data-testid="input-pyypl-percent"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="h-4 w-4 text-primary" />
                  Предустановка Pyypl top up
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Load from Debit Card: USD 0.50 + 3.5%. Минимальное пополнение Pyypl: 20 USD без учёта комиссии.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pyypl-card-fixed">Pyypl card fixed, USD</Label>
                  <Input
                    id="pyypl-card-fixed"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pyyplCardFixed}
                    onChange={(event) => setPyyplCardFixed(Number(event.target.value || 0))}
                    data-testid="input-pyypl-card-fixed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pyypl-card-percent">Pyypl card percent, %</Label>
                  <Input
                    id="pyypl-card-percent"
                    type="number"
                    min="0"
                    step="0.1"
                    value={pyyplCardPercent}
                    onChange={(event) => setPyyplCardPercent(Number(event.target.value || 0))}
                    data-testid="input-pyypl-card-percent"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="h-4 w-4 text-primary" />
                  Предустановка Pyypl card transaction
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  International/Local Purchase: USD 0.00 + 5%. Применяется к покупкам/транзакциям по карте Pyypl в Сценарии 3.
                </p>
              </div>

              <Button onClick={() => refetch()} className="w-full" disabled={isFetching} data-testid="button-refresh-rates">
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Обновить курсы
              </Button>
            </CardContent>
          </Card>

          <Card className="border-card-border lg:col-span-5 xl:col-span-4">
            <CardHeader>
              <CardTitle className="text-lg">Курсы и источники</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : isError || !data ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="status-rates-error">
                  Не удалось загрузить курсы. Попробуй обновить позже.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <RatePill item={data.rates.mirRubToByn} />
                    <RatePill item={data.rates.bnbBynPerEur} />
                    <RatePill item={data.rates.visaEurToUsd} />
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-fetched-at">
                    Сервер обновил данные: {new Date(data.fetchedAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="forward" className="space-y-6" data-testid="tabs-direction">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:w-auto sm:inline-flex" data-testid="tabs-direction-list">
            <TabsTrigger value="forward" className="py-2" data-testid="tab-trigger-forward">Из рублей</TabsTrigger>
            <TabsTrigger value="reverse" className="py-2" data-testid="tab-trigger-reverse">В рубли</TabsTrigger>
          </TabsList>
          <TabsContent value="forward" className="mt-0" data-testid="tab-panel-forward">
        <section aria-labelledby="forward-heading" className="space-y-4" data-testid="section-forward">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="forward-heading" className="text-xl font-semibold tracking-tight">Прямой расчёт</h2>
              <p className="text-sm text-muted-foreground">От стартовой суммы RUB к итогу в EUR/USD по трём маршрутам.</p>
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex">RUB → EUR / USD</Badge>
          </div>
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card className="border-card-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <WalletCards className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Сценарий 1: RUB → EUR BNB</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-primary p-5 text-primary-foreground">
                <div className="text-sm opacity-80">Итог на EUR карте/счёте БНБ</div>
                <div className="mt-2 font-mono text-3xl font-bold tabular-nums" data-testid="text-result-eur">
                  {fmt(calc.eur, "EUR")}
                </div>
              </div>
              <StepRow title="RUB → BYN по Мир" value={fmt(calc.byn, "BYN")} detail={`${fmt(rub, "RUB", 0)} × ${num(data?.rates.mirRubToByn.rate ?? 0, 6)}`} />
              <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" />
              <StepRow title="BYN → EUR по БНБ" value={fmt(calc.eur, "EUR")} detail={`${fmt(calc.byn, "BYN")} / ${num(data?.rates.bnbBynPerEur.rate ?? 0, 4)} BYN за 1 EUR`} />
            </CardContent>
          </Card>

          <Card className="border-card-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Сценарий 2: RUB → USD Pyypl</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-foreground p-5 text-background dark:bg-card dark:text-card-foreground">
                <div className="text-sm opacity-70">Итог после комиссии Pyypl</div>
                <div className="mt-2 font-mono text-3xl font-bold tabular-nums" data-testid="text-result-usd">
                  {fmt(calc.usdAfterFee, "USD")}
                </div>
              </div>

              <StepRow title="EUR BNB → USD Visa" value={fmt(calc.usdBeforeFee, "USD")} detail={`${fmt(calc.eur, "EUR")} × ${num(data?.rates.visaEurToUsd.rate ?? 0, 6)}`} />
              <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" />
              <StepRow title="Pyypl top up fee" value={`−${fmt(calc.pyyplFee, "USD")}`} detail={`${pyyplPercent}% + ${fmt(pyyplFixed, "USD")}`} />

              <Separator />

              <div
                className={`rounded-lg p-4 text-sm ${
                  calc.minTopUpOk ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-destructive"
                }`}
                data-testid="status-pyypl-minimum"
              >
                {calc.minTopUpOk
                  ? "Минимум Pyypl 20 USD до комиссии выполнен."
                  : `Минимум Pyypl не выполнен. При текущих курсах нужно примерно ${fmt(calc.rubForMinTopUp, "RUB", 0)} на старте.`}
              </div>
            </CardContent>
          </Card>

          <Card className="border-card-border">
            <CardHeader>
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Сценарий 3: RUB → EUR transaction через Pyypl</CardTitle>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Оплата покупки в EUR с кошелька Pyypl (USD). Применяется комиссия card transaction Pyypl и обратный курс USD → EUR (инверсия Visa EUR → USD).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-primary p-5 text-primary-foreground">
                <div className="text-sm opacity-80">Итог EUR-покупки с Pyypl</div>
                <div className="mt-2 font-mono text-3xl font-bold tabular-nums" data-testid="text-result-eur-final">
                  {fmt(calc.eurFinal, "EUR")}
                </div>
              </div>

              <StepRow
                title="USD на Pyypl после top up"
                value={fmt(calc.usdAfterFee, "USD")}
                detail={`Результат Сценария 2 после комиссии ${pyyplPercent}% + ${fmt(pyyplFixed, "USD")}`}
              />
              <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" />
              <StepRow
                title="Pyypl card transaction fee"
                value={`−${fmt(calc.pyyplCardFeeUsd, "USD")}`}
                detail={`${pyyplCardPercent}% + ${fmt(pyyplCardFixed, "USD")} от суммы транзакции`}
              />
              <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" />
              <StepRow
                title="USD доступно для FX"
                value={fmt(calc.usdAvailableForFx, "USD")}
                detail="USD Pyypl после card transaction fee"
              />
              <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground" />
              <StepRow
                title="USD → EUR (инверсия Visa)"
                value={fmt(calc.eurFinal, "EUR")}
                detail={`${fmt(calc.usdAvailableForFx, "USD")} × ${num(calc.usdToEurRate, 6)} (= 1 / ${num(data?.rates.visaEurToUsd.rate ?? 0, 6)})`}
              />
            </CardContent>
          </Card>
          </div>
        </section>
          </TabsContent>
          <TabsContent value="reverse" className="mt-0" data-testid="tab-panel-reverse">
        <section aria-labelledby="reverse-heading" className="space-y-4" data-testid="section-reverse">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="reverse-heading" className="text-xl font-semibold tracking-tight">Обратный расчёт</h2>
              <p className="text-sm text-muted-foreground">
                Введите целевую сумму покупки — получите стартовую сумму в RUB. Курсы и комиссии берутся из настроек выше.
              </p>
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex">EUR / USD → RUB</Badge>
          </div>
          {!reverse.ratesOk && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="status-reverse-rates">
              Не хватает курсов для обратного расчёта. Обновите курсы.
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3" data-testid="card-reverse">
              <Card className="border-card-border" data-testid="block-reverse-s1">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <WalletCards className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Сценарий 1: покупка в EUR с BNB</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="reverse-s1-eur">Сумма покупки, EUR</Label>
                    <Input
                      id="reverse-s1-eur"
                      inputMode="decimal"
                      type="number"
                      min="0"
                      step="0.01"
                      value={targetEurBnb}
                      onChange={(event) => setTargetEurBnb(Number(event.target.value || 0))}
                      className="h-11 font-mono"
                      data-testid="input-reverse-s1-eur"
                    />
                  </div>
                  <StepRow
                    title="Нужно BYN на БНБ"
                    value={fmt(reverse.s1.bynNeeded, "BYN")}
                    detail={`${fmt(targetEurBnb, "EUR")} × ${num(data?.rates.bnbBynPerEur.rate ?? 0, 4)} BYN за 1 EUR`}
                  />
                  <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                  <div className="rounded-xl bg-primary p-5 text-primary-foreground">
                    <div className="text-sm opacity-80">Нужно RUB на старте</div>
                    <div className="mt-2 font-mono text-3xl font-bold tabular-nums" data-testid="text-reverse-s1-rub">
                      {fmt(reverse.s1.rubNeeded, "RUB", 0)}
                    </div>
                    <div className="mt-2 text-xs opacity-80">
                      {fmt(reverse.s1.bynNeeded, "BYN")} / {num(data?.rates.mirRubToByn.rate ?? 0, 6)} (BYN за 1 RUB)
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-card-border" data-testid="block-reverse-s2">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Сценарий 2: нужно N USD на Pyypl</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="reverse-s2-usd">Нужно USD на Pyypl</Label>
                  <Input
                    id="reverse-s2-usd"
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetUsdPyypl}
                    onChange={(event) => setTargetUsdPyypl(Number(event.target.value || 0))}
                    className="h-11 font-mono"
                    data-testid="input-reverse-s2-usd"
                  />
                </div>
                <StepRow
                  title="USD до комиссии top up"
                  value={fmt(reverse.s2.usdBeforeFee, "USD")}
                  detail={`(${fmt(targetUsdPyypl, "USD")} + ${fmt(pyyplFixed, "USD")}) / (1 − ${pyyplPercent}%)`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="Pyypl top up fee"
                  value={`+${fmt(reverse.s2.pyyplFee, "USD")}`}
                  detail={`${pyyplPercent}% + ${fmt(pyyplFixed, "USD")}`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="Нужно EUR на счёте БНБ"
                  value={fmt(reverse.s2.eurNeeded, "EUR")}
                  detail={`${fmt(reverse.s2.usdBeforeFee, "USD")} / ${num(data?.rates.visaEurToUsd.rate ?? 0, 6)} (Visa EUR→USD)`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="Нужно BYN на БНБ"
                  value={fmt(reverse.s2.bynNeeded, "BYN")}
                  detail={`${fmt(reverse.s2.eurNeeded, "EUR")} × ${num(data?.rates.bnbBynPerEur.rate ?? 0, 4)}`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="rounded-xl bg-primary p-5 text-primary-foreground">
                  <div className="text-sm opacity-80">Нужно RUB на старте</div>
                  <div className="mt-2 font-mono text-3xl font-bold tabular-nums" data-testid="text-reverse-s2-rub">
                    {fmt(reverse.s2.rubNeeded, "RUB", 0)}
                  </div>
                </div>
                <div
                  className={`rounded-lg p-3 text-sm ${
                    reverse.s2.minTopUpOk ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-destructive"
                  }`}
                  data-testid="status-reverse-s2-min"
                >
                  {reverse.s2.minTopUpOk
                    ? `Минимум Pyypl 20 USD до комиссии выполнен (${fmt(reverse.s2.usdBeforeFee, "USD")}).`
                    : `Минимум Pyypl 20 USD до комиссии не достигнут. Нужно минимум ${fmt(reverse.s2.rubForMinTopUp, "RUB", 0)} на старте, чтобы пополнить Pyypl.`}
                </div>
                </CardContent>
              </Card>

              <Card className="border-card-border" data-testid="block-reverse-s3">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Сценарий 3: покупка в EUR с Pyypl USD</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="reverse-s3-eur">Сумма покупки, EUR</Label>
                  <Input
                    id="reverse-s3-eur"
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={targetEurPyypl}
                    onChange={(event) => setTargetEurPyypl(Number(event.target.value || 0))}
                    className="h-11 font-mono"
                    data-testid="input-reverse-s3-eur"
                  />
                </div>
                <StepRow
                  title="USD для FX (покупка)"
                  value={fmt(reverse.s3.usdForFx, "USD")}
                  detail={`${fmt(targetEurPyypl, "EUR")} × ${num(data?.rates.visaEurToUsd.rate ?? 0, 6)} (инверсия: 1 EUR = Visa USD)`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="USD на Pyypl после top up"
                  value={fmt(reverse.s3.usdAfterTopup, "USD")}
                  detail={`(${fmt(reverse.s3.usdForFx, "USD")} + ${fmt(pyyplCardFixed, "USD")}) / (1 − ${pyyplCardPercent}%)`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="Pyypl card transaction fee"
                  value={`+${fmt(reverse.s3.pyyplCardFee, "USD")}`}
                  detail={`${pyyplCardPercent}% + ${fmt(pyyplCardFixed, "USD")}`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="USD до комиссии top up"
                  value={fmt(reverse.s3.usdBeforeTopup, "USD")}
                  detail={`(${fmt(reverse.s3.usdAfterTopup, "USD")} + ${fmt(pyyplFixed, "USD")}) / (1 − ${pyyplPercent}%)`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="Pyypl top up fee"
                  value={`+${fmt(reverse.s3.pyyplTopUpFee, "USD")}`}
                  detail={`${pyyplPercent}% + ${fmt(pyyplFixed, "USD")}`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="Нужно EUR на счёте БНБ"
                  value={fmt(reverse.s3.eurNeeded, "EUR")}
                  detail={`${fmt(reverse.s3.usdBeforeTopup, "USD")} / ${num(data?.rates.visaEurToUsd.rate ?? 0, 6)}`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <StepRow
                  title="Нужно BYN на БНБ"
                  value={fmt(reverse.s3.bynNeeded, "BYN")}
                  detail={`${fmt(reverse.s3.eurNeeded, "EUR")} × ${num(data?.rates.bnbBynPerEur.rate ?? 0, 4)}`}
                />
                <ArrowUp className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="rounded-xl bg-primary p-5 text-primary-foreground">
                  <div className="text-sm opacity-80">Нужно RUB на старте</div>
                  <div className="mt-2 font-mono text-3xl font-bold tabular-nums" data-testid="text-reverse-s3-rub">
                    {fmt(reverse.s3.rubNeeded, "RUB", 0)}
                  </div>
                </div>
                <div
                  className={`rounded-lg p-3 text-sm ${
                    reverse.s3.minTopUpOk ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-destructive"
                  }`}
                  data-testid="status-reverse-s3-min"
                >
                  {reverse.s3.minTopUpOk
                    ? `Минимум Pyypl 20 USD до комиссии top up выполнен (${fmt(reverse.s3.usdBeforeTopup, "USD")}).`
                    : `Минимум Pyypl 20 USD до комиссии top up не достигнут. Увеличьте сумму покупки или пополните Pyypl отдельно.`}
                </div>
                </CardContent>
              </Card>
          </div>
        </section>
          </TabsContent>
        </Tabs>

          {data && (
            <Card className="border-card-border">
              <CardHeader>
                <CardTitle className="text-lg">Примечания</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                {Object.values(data.rates).map((rate) => (
                  <p key={rate.pair} data-testid={`text-note-${rate.pair}`}>
                    <span className="font-medium text-foreground">{rate.pair}:</span> {rate.note}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
      </section>
    </main>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={Home} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
