import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ArrowDown, Calculator, CreditCard, Moon, RefreshCw, Settings2, ShoppingCart, Sun, WalletCards } from "lucide-react";
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3">
        Перейти к калькулятору
      </a>
      <header className="border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
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

      <section id="content" className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-card-border">
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

          <Card className="border-card-border">
            <CardHeader>
              <CardTitle className="text-lg">Курсы и источники</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid gap-3">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : isError || !data ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="status-rates-error">
                  Не удалось загрузить курсы. Попробуй обновить позже.
                </div>
              ) : (
                <div className="grid gap-3">
                  <RatePill item={data.rates.mirRubToByn} />
                  <RatePill item={data.rates.bnbBynPerEur} />
                  <RatePill item={data.rates.visaEurToUsd} />
                  <p className="text-xs text-muted-foreground" data-testid="text-fetched-at">
                    Сервер обновил данные: {new Date(data.fetchedAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
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
        </div>
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
