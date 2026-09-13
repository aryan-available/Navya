import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BatteryCharging, Bolt, ChevronRight, CloudSun, Gauge, GitCompare, History, Layers3, LogOut, Menu, PanelLeftClose, Play, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, SunMedium, ThermometerSun, TrendingDown, TrendingUp, Wind, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import {
  getGetAssetsQueryKey, getGetCommunityQueryKey, getGetForecastQueryKey, getGetLadderQueryKey, getGetMicrogridStateQueryKey, getGetRunwayQueryKey, getGetSignalQueryKey,
  setAuthTokenGetter, useComparePlans, useGetAssets, useGetCommunity, useGetForecast, useGetLadder, useGetMicrogridState, useGetRunway, useGetSignal, useHealthCheck, useLogin, useOptimize, useRegister, useRunScenario,
} from '@workspace/api-client-react';
import { ScenarioInputScenarioType } from '@workspace/api-client-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });
setAuthTokenGetter(() => {
  try {
    const session = JSON.parse(localStorage.getItem('navya_auth') || 'null') as { token?: string } | null;
    return session?.token ?? null;
  } catch {
    return null;
  }
});
const navItems = [
  { href: '/', label: 'Control center', icon: Gauge },
  { href: '/forecast', label: 'Forecast', icon: TrendingUp },
  { href: '/scenarios', label: 'Scenarios', icon: GitCompare },
  { href: '/community', label: 'Community', icon: Layers3 },
  { href: '/history', label: 'Event history', icon: History },
  { href: '/settings', label: 'Parameters', icon: Settings2 },
];

function cx(...parts: Array<string | false | undefined>) { return parts.filter(Boolean).join(' '); }
function n(value: number | undefined, digits = 0) { return typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—'; }
function time(value?: string) { return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'; }
function date(value?: string) { return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'; }
function errText(error: unknown) { return error instanceof Error ? error.message : 'The operations service did not respond.'; }

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
    <span className="grid h-8 w-8 place-items-center rounded-sm bg-[#0c6e5c] text-[#f1ead9]"><Bolt size={17} strokeWidth={2.7} /></span>
    {!compact && <span><span className="block text-[17px] font-extrabold tracking-[.2em] leading-none">NAVYA</span><span className="mono mt-1 block text-[8px] tracking-[.18em] text-[#688184]">ENERGY OPERATIONS</span></span>}
  </Link>;
}

function SignalPill({ color = 'GREEN', message = 'Systems nominal' }: { color?: string; message?: string }) {
  const tone = color === 'RED' ? 'signal-red' : color === 'YELLOW' ? 'signal-yellow' : 'signal-green';
  return <div className={cx('flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[11px] font-bold', tone)} data-testid="status-signal">
    <span className="h-1.5 w-1.5 rounded-full bg-current" /> {message}
  </div>;
}

function Skeleton({ className = '' }: { className?: string }) { return <div className={cx('skeleton rounded-sm', className)} />; }
function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className="panel flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center" data-testid="status-error">
    <AlertTriangle size={20} className="text-[#ad4d3f]" /><p className="max-w-sm text-sm text-[#53686a]">{errText(error)}</p>
    {retry && <button onClick={retry} className="mono flex items-center gap-2 border border-[#a8b9b6] px-3 py-2 text-[10px] uppercase tracking-widest hover:bg-[#e8eee7]" data-testid="button-retry"><RefreshCw size={13} /> Retry connection</button>}
  </div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [health, setHealth] = useState<string>('checking');
  const healthQuery = useHealthCheck({ query: { queryKey: ['/api/healthz'], refetchInterval: 30000 } });
  useEffect(() => { setHealth(healthQuery.isError ? 'offline' : healthQuery.isLoading ? 'checking' : 'online'); }, [healthQuery.isError, healthQuery.isLoading]);
  const logout = () => { localStorage.removeItem('navya_auth'); setLocation('/login'); };
  return <div className="navya-noise min-h-[100dvh] bg-[#e9e5d8]">
    <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-[#c8d0c8] bg-[#e2e5da] px-4 py-5 transition-transform md:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')} data-testid="nav-sidebar">
      <div className="mb-10 flex items-center justify-between px-2"><Brand /><button className="md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="mb-3 px-2 eyebrow">Operations console</div>
      <nav className="space-y-1">{navItems.map(item => { const Icon = item.icon; const active = location === item.href; return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cx('group flex items-center gap-3 rounded-sm px-3 py-2.5 text-[12px] font-semibold transition-colors', active ? 'bg-[#174b50] text-[#f0ebdd]' : 'text-[#526769] hover:bg-[#d4ddd4]')} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} strokeWidth={active ? 2.2 : 1.8} /><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#edb44a]" />}</Link>; })}</nav>
      <div className="mt-auto border-t border-[#c8d0c8] pt-4">
        <Link href="/community-display" className="mb-2 flex items-center gap-3 rounded-sm px-3 py-2.5 text-[11px] font-semibold text-[#526769] hover:bg-[#d4ddd4]" data-testid="link-community-display"><Activity size={16} /> Community display</Link>
        <div className="flex items-center gap-2 px-3 py-3"><span className={cx('h-2 w-2 rounded-full', health === 'online' ? 'bg-[#0d8967]' : health === 'offline' ? 'bg-[#ad4d3f]' : 'bg-[#d39a2d]')} /><span className="mono text-[10px] uppercase tracking-widest text-[#657678]">API {health}</span></div>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-[11px] text-[#657678] hover:bg-[#d4ddd4]" data-testid="button-logout"><LogOut size={15} /> Sign out operator</button>
      </div>
    </aside>
    <div className="md:pl-[236px]"><header className="sticky top-0 z-30 flex h-[62px] items-center justify-between border-b border-[#ccd3cb] bg-[#e9e5d8] px-4 md:px-8">
      <div className="flex items-center gap-3"><button className="md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={20} /></button><span className="mono text-[10px] uppercase tracking-[.14em] text-[#728183]">Site / <span className="text-[#174b50]">Kijani Ridge</span></span></div>
      <div className="flex items-center gap-4"><div className="hidden items-center gap-2 md:flex"><span className="live-dot" /><span className="mono text-[10px] uppercase tracking-widest text-[#607475]">Live telemetry</span></div><div className="grid h-8 w-8 place-items-center rounded-full bg-[#c5d8cc] text-[11px] font-bold text-[#174b50]">OP</div></div>
    </header><main className="mx-auto max-w-[1440px] p-4 md:p-8">{children}</main></div>
  </div>;
}

function PageHeading({ kicker, title, description, action }: { kicker: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="eyebrow mb-2">{kicker}</div><h1 className="text-[28px] font-extrabold tracking-[-.04em] text-[#174b50] md:text-[36px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm text-[#667778]">{description}</p>}</div>{action}</div>;
}

function MiniMetric({ label, value, unit, tone = 'text-[#174b50]', trend }: { label: string; value: string; unit?: string; tone?: string; trend?: 'up' | 'down' }) {
  return <div className="panel p-4" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="eyebrow">{label}</div><div className={cx('mt-2 text-[26px] font-extrabold tracking-[-.05em]', tone)}>{value}<span className="ml-1 text-[11px] font-semibold tracking-normal text-[#799092]">{unit}</span></div>{trend && <div className="mt-1 flex items-center gap-1 text-[10px] text-[#728183]">{trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} versus prior hour</div>}</div>;
}

function FlowDiagram({ state }: { state: any }) {
  const solar = state?.generation?.solar_kw ?? 0, wind = state?.generation?.wind_kw ?? 0, battery = state?.generation?.battery_discharge_kw ?? 0, diesel = state?.generation?.diesel_kw ?? 0, demand = state?.demand?.total_kw ?? 0;
  return <div className="panel relative overflow-hidden p-5 md:p-7" data-testid="panel-power-flow">
    <div className="flex items-start justify-between"><div><div className="eyebrow">Live digital twin</div><h2 className="mt-1 text-lg font-bold text-[#174b50]">Power flow</h2></div><span className="mono rounded-sm border border-[#c1d1c8] bg-[#edf2e9] px-2 py-1 text-[10px] text-[#357467]">AUTO-DISPATCH</span></div>
    <div className="relative mt-4 min-h-[280px]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 760 280" preserveAspectRatio="none"><path d="M120 72 C220 72 235 140 330 140" fill="none" stroke="#72ae8f" strokeWidth="3" className="flow-line" /><path d="M120 208 C220 208 235 140 330 140" fill="none" stroke="#72ae8f" strokeWidth="3" className="flow-line" /><path d="M410 140 C500 140 520 74 618 74" fill="none" stroke="#72ae8f" strokeWidth="3" className="flow-line" /><path d="M410 140 C500 140 520 206 618 206" fill="none" stroke="#72ae8f" strokeWidth="3" className="flow-line" /><circle cx="370" cy="140" r="8" fill="#e9e5d8" stroke="#0c6e5c" strokeWidth="3" /></svg>
      <div className="absolute left-0 top-6 w-[110px] text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#d2b05a] bg-[#fff1cb] text-[#a87816]"><SunMedium size={26} /></div><div className="mt-2 text-[11px] font-bold">Solar array</div><div className="mono text-[11px] text-[#728183]">{n(solar)} kW</div></div>
      <div className="absolute bottom-4 left-0 w-[110px] text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#a7c8cf] bg-[#e0edf0] text-[#397b85]"><Wind size={25} /></div><div className="mt-2 text-[11px] font-bold">Wind turbine</div><div className="mono text-[11px] text-[#728183]">{n(wind)} kW</div></div>
      <div className="absolute left-[40%] top-[96px] w-[90px] -translate-x-1/2 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-[#0c6e5c] bg-[#d3e9da] text-[#0c6e5c]"><Bolt size={26} /></div><div className="mt-2 text-[11px] font-bold">Busbar</div><div className="mono text-[10px] text-[#728183]">{n(solar + wind + battery + diesel)} kW in</div></div>
      <div className="absolute right-0 top-6 w-[125px] text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#bdcfbd] bg-[#e2eee4] text-[#28745f]"><BatteryCharging size={25} /></div><div className="mt-2 text-[11px] font-bold">Battery bank</div><div className="mono text-[11px] text-[#728183]">{n(state?.battery?.soc_pct)}% SOC</div></div>
      <div className="absolute bottom-4 right-0 w-[125px] text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#d9b99b] bg-[#f2e5d5] text-[#9a6840]"><Activity size={25} /></div><div className="mt-2 text-[11px] font-bold">Community load</div><div className="mono text-[11px] text-[#728183]">{n(demand)} kW demand</div></div>
    </div>
    <div className="mt-3 flex flex-wrap gap-5 border-t border-[#d6ddd4] pt-4 text-[10px] text-[#728183]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#72ae8f]" /> Available flow</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#d39a2d]" /> Reserve / standby</span><span className="ml-auto mono">Updated {time(state?.timestamp)}</span></div>
  </div>;
}

function Dashboard() {
  const stateQuery = useGetMicrogridState({ query: { queryKey: getGetMicrogridStateQueryKey(), refetchInterval: 15000 } });
  const ladder = useGetLadder({ query: { queryKey: getGetLadderQueryKey(), refetchInterval: 30000 } });
  const runway = useGetRunway({ query: { queryKey: getGetRunwayQueryKey(), refetchInterval: 60000 } });
  const optimize = useOptimize();
  const state: any = stateQuery.data;
  const [plan, setPlan] = useState<any>();
  const runOptimize = () => optimize.mutate({ data: { horizon_hours: 24, trigger_reason: 'operator_requested' } }, {
    onSuccess: (response: any) => {
      const nextPlan = response?.dispatch_plan ?? response;
      setPlan(nextPlan);
      queryClient.invalidateQueries({ queryKey: getGetMicrogridStateQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetLadderQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRunwayQueryKey() });
    }
  });
  if (stateQuery.isLoading) return <div className="space-y-5"><PageHeading kicker="Control center" title="Live operations" description="Loading telemetry from the community microgrid." /><div className="grid gap-5 md:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-[390px]" /></div>;
  if (stateQuery.isError) return <><PageHeading kicker="Control center" title="Live operations" description="Telemetry is temporarily unavailable." /><ErrorState error={stateQuery.error} retry={() => stateQuery.refetch()} /></>;
  return <div className="animate-rise"><PageHeading kicker="Control center / live" title="Keep the lights on." description={`${state?.name ?? 'Kijani Ridge'} is operating under closed-loop dispatch. The next decision is visible before it becomes urgent.`} action={<button onClick={runOptimize} disabled={optimize.isPending} className="flex items-center gap-2 rounded-sm bg-[#174b50] px-4 py-3 text-xs font-bold text-[#f0ebdd] shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-optimize"><Play size={14} /> {optimize.isPending ? 'Calculating plan' : 'Run optimization'}</button>} />
    <div className="mb-5 flex flex-wrap items-center gap-3"><SignalPill color={state?.signal?.color} message={state?.signal?.message} /><span className="mono text-[10px] text-[#77888a]">Last sync {time(state?.timestamp)} · stage {state?.shortfall_stage ?? 0} load ladder</span></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MiniMetric label="Demand now" value={n(state?.demand?.total_kw)} unit="kW" trend="up" /><MiniMetric label="Available generation" value={n(state?.generation?.total_available_kw)} unit="kW" tone="text-[#087c62]" /><MiniMetric label="Battery reserve" value={n(state?.battery?.soc_pct)} unit="% SOC" tone="text-[#98671b]" /><MiniMetric label="Diesel runway" value={n(runway.data?.days_of_diesel_remaining, 1)} unit="days" tone={runway.data?.status === 'CRITICAL' ? 'text-[#ad4d3f]' : 'text-[#174b50]'} /></div>
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]"><FlowDiagram state={state} /><div className="space-y-5"><div className="panel p-5"><div className="flex items-center justify-between"><div><div className="eyebrow">Next decision</div><h2 className="mt-1 text-lg font-bold text-[#174b50]">Load ladder</h2></div><span className="rounded-sm bg-[#f8eac8] px-2 py-1 text-[10px] font-bold text-[#98671b]">STAGE {ladder.data?.active_stage ?? state?.shortfall_stage ?? 0}</span></div>{ladder.isLoading ? <div className="mt-5 space-y-3"><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" /></div> : <div className="mt-4 space-y-2">{(ladder.data?.loads_held_or_shed ?? []).slice(0, 4).map((item: any, i: number) => <div key={`${item.tier}-${i}`} className="flex items-center gap-3 border-t border-[#e0e4db] py-2.5"><span className="mono w-5 text-[10px] text-[#849193]">T{item.tier}</span><span className="flex-1 text-[11px] font-semibold">{item.name}</span><span className="mono text-[10px] text-[#688080]">{n(item.kw)} kW</span><span className={cx('text-[10px] font-bold', item.action?.toLowerCase().includes('shed') ? 'text-[#ad4d3f]' : 'text-[#087c62]')}>{item.action}</span></div>)}</div>}<div className="mt-3 text-[10px] text-[#728183]">{ladder.data?.actions_taken?.[0] ?? 'No load actions required at current reserve.'}</div></div><div className="panel p-5"><div className="eyebrow">Operator note</div><p className="mt-2 text-sm leading-6 text-[#53686a]">{plan ? `Plan ${plan.plan_id} returned with ${n(plan.metrics?.reliability_score_pct, 1)}% reliability and ${n(plan.metrics?.renewable_share_pct, 1)}% renewable share.` : 'Optimization uses forecast, reserve thresholds, and critical-load priority. Run it before weather shifts or demand events.'}</p>{plan?.reason_codes?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{plan.reason_codes.slice(0, 3).map((r: string) => <span key={r} className="rounded-sm bg-[#e8eee7] px-2 py-1 text-[10px] text-[#46706a]">{r}</span>)}</div> : null}</div></div></div>
  </div>;
}

function ForecastPage() {
  const [horizon, setHorizon] = useState<24 | 72>(24);
  const query = useGetForecast({ horizon }, { query: { queryKey: getGetForecastQueryKey({ horizon }), refetchInterval: 60000 } });
  const items: any[] = query.data?.hourly_forecast ?? [];
  const visible = items.slice(0, horizon === 24 ? 24 : 72);
  const max = Math.max(...visible.map(x => Math.max(x.total_demand_kw, x.predicted_solar_kw + x.predicted_wind_kw)), 1);
  return <div className="animate-rise"><PageHeading kicker="Forecast / horizon" title="See the next 72 hours." description="Expected generation against community demand. Use the shape of the day to place the next dispatch decision." action={<div className="flex rounded-sm border border-[#b9c9c2] bg-[#e0e5da] p-1">{([24, 72] as const).map(h => <button key={h} onClick={() => setHorizon(h)} className={cx('px-4 py-2 text-[11px] font-bold', horizon === h ? 'bg-[#174b50] text-[#f0ebdd]' : 'text-[#647577]')} data-testid={`button-forecast-${h}`}>{h}H</button>)}</div>} /><div className="panel p-5 md:p-7">{query.isLoading ? <Skeleton className="h-[330px]" /> : query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : <><div className="mb-5 flex flex-wrap gap-5 text-[11px] text-[#647577]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#d0a244]" /> Solar</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#5b9aa2]" /> Wind</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#174b50]" /> Demand</span></div><div className="relative h-[300px] border-b border-l border-[#cad4cd]">{visible.map((item, i) => { const renewable = item.predicted_solar_kw + item.predicted_wind_kw; return <div key={item.time + i} className="absolute bottom-0 flex w-[22px] flex-col items-center gap-1 md:w-[30px]" style={{ left: `${(i / Math.max(visible.length - 1, 1)) * 97}%` }}><div className="flex w-full items-end justify-center gap-[2px]" style={{ height: 245 }}><div className="w-[38%] rounded-t-[2px] bg-[#d0a244]" style={{ height: `${(item.predicted_solar_kw / max) * 100}%` }} /><div className="w-[38%] rounded-t-[2px] bg-[#5b9aa2]" style={{ height: `${(item.predicted_wind_kw / max) * 100}%` }} /><div className="absolute w-[3px] rounded-full bg-[#174b50]" style={{ bottom: `${(item.total_demand_kw / max) * 245}px`, height: 6 }} /></div>{(i % (horizon === 72 ? 12 : 4) === 0 || i === visible.length - 1) && <span className="mono mt-2 -rotate-45 whitespace-nowrap text-[9px] text-[#7a8989]">{time(item.time)}</span>}</div>; })}</div><div className="mt-8 grid gap-3 sm:grid-cols-3"><MiniMetric label="Peak demand" value={n(Math.max(...visible.map(x => x.total_demand_kw), 0))} unit="kW" /><MiniMetric label="Peak renewable" value={n(Math.max(...visible.map(x => x.predicted_solar_kw + x.predicted_wind_kw), 0))} unit="kW" tone="text-[#087c62]" /><MiniMetric label="Forecast window" value={String(query.data?.horizon_hours ?? horizon)} unit="hours" /></div></>}</div></div>;
}

function ScenariosPage() {
  const [kind, setKind] = useState<any>(ScenarioInputScenarioType.CLOUD_COVER);
  const [severity, setSeverity] = useState('35');
  const [result, setResult] = useState<any>();
  const [compare, setCompare] = useState<any>();
  const run = useRunScenario(); const compareMutation = useComparePlans();
  const labels: Record<string, string> = { CLOUD_COVER: 'Cloud cover increase', WIND_DROP: 'Wind generation drop', BATTERY_FAULT: 'Battery unavailable', DEMAND_SURGE: 'Demand surge', DIESEL_PRICE_SPIKE: 'Diesel price spike', STORM: 'Storm conditions' };
  const submit = () => run.mutate({ data: { scenario_type: kind, name: labels[kind], parameters: { severity_pct: Number(severity) } } }, {
    onSuccess: (response: any) => {
      setResult(response?.result ?? response);
      queryClient.invalidateQueries({ queryKey: getGetMicrogridStateQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetLadderQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRunwayQueryKey() });
    }
  });
  return <div className="animate-rise"><PageHeading kicker="Scenarios / what-if" title="Test the consequence first." description="Inject an operating event into the digital twin, then compare the resulting dispatch with alternate strategies." action={<button onClick={() => compareMutation.mutate(undefined, { onSuccess: setCompare })} disabled={compareMutation.isPending} className="flex items-center gap-2 border border-[#8fa9a2] bg-[#eef1e8] px-4 py-3 text-xs font-bold text-[#174b50]" data-testid="button-compare-plans"><GitCompare size={15} /> {compareMutation.isPending ? 'Comparing' : 'Compare plans'}</button>} /><div className="grid gap-5 lg:grid-cols-[340px_1fr]"><div className="panel p-5"><div className="eyebrow">Event launcher</div><h2 className="mt-1 text-lg font-bold text-[#174b50]">Change one condition</h2><label className="mt-6 block text-[11px] font-bold text-[#53686a]">Event type<select value={kind} onChange={e => setKind(e.target.value)} className="mt-2 w-full border border-[#b8c9c1] bg-[#f7f5ed] px-3 py-2.5 text-sm outline-none focus:border-[#0c6e5c]" data-testid="select-scenario-type">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="mt-5 block text-[11px] font-bold text-[#53686a]">Severity <span className="mono float-right text-[#174b50]">{severity}%</span><input type="range" min="10" max="90" step="5" value={severity} onChange={e => setSeverity(e.target.value)} className="mt-3 w-full accent-[#0c6e5c]" data-testid="input-scenario-severity" /></label><button onClick={submit} disabled={run.isPending} className="mt-7 flex w-full items-center justify-center gap-2 bg-[#174b50] px-4 py-3 text-xs font-bold text-[#f0ebdd] disabled:opacity-60" data-testid="button-run-scenario"><Play size={14} /> {run.isPending ? 'Simulating event' : 'Run scenario'}</button>{run.isError && <p className="mt-3 text-xs text-[#ad4d3f]">{errText(run.error)}</p>}</div><div className="space-y-5">{result ? <div className="panel border-l-4 border-l-[#d0a244] p-5" data-testid="panel-scenario-result"><div className="flex items-center justify-between"><div><div className="eyebrow">Simulation result</div><h2 className="mt-1 text-lg font-bold text-[#174b50]">{result.message}</h2></div><span className="signal-yellow rounded-sm px-2 py-1 text-[10px] font-bold">{result.status}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-4"><MiniMetric label="Cost delta" value={n(result.cost_delta_usd, 2)} unit="USD" tone="text-[#ad4d3f]" /><MiniMetric label="CO2 delta" value={n(result.co2_delta_kg, 1)} unit="kg" /><MiniMetric label="New stage" value={String(result.updated_state?.shortfall_stage ?? '—')} /><MiniMetric label="Reliability" value={n(result.reoptimized_dispatch?.metrics?.reliability_score_pct, 1)} unit="%" tone="text-[#087c62]" /></div><div className="mt-5 border-t border-[#dae0d7] pt-4 text-[11px] text-[#667778]">Reoptimized plan: <span className="mono text-[#174b50]">{result.reoptimized_dispatch?.plan_id ?? '—'}</span></div></div> : <div className="panel flex min-h-[230px] flex-col items-center justify-center p-8 text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#e0ece4] text-[#0c6e5c]"><GitCompare size={21} /></div><h2 className="font-bold text-[#174b50]">No event under test</h2><p className="mt-2 max-w-sm text-sm text-[#718183]">Choose a condition and launch a simulation. It will not change live dispatch.</p></div>}{compare && <div className="panel p-5" data-testid="panel-plan-comparison"><div className="eyebrow">Strategy comparison</div><div className="mt-4 grid gap-3 md:grid-cols-3">{[['AI optimal', compare.ai_optimal], ['Diesel first', compare.diesel_first], ['Renewable first', compare.renewable_first]].map(([name, plan]: any) => <div key={name} className="border border-[#ced9d0] bg-[#f3f4eb] p-4"><div className="text-xs font-bold text-[#174b50]">{name}</div><div className="mt-4 space-y-2 text-[11px]"><div className="flex justify-between"><span className="text-[#718183]">Cost</span><span className="mono">${n(plan.cost_usd, 2)}</span></div><div className="flex justify-between"><span className="text-[#718183]">Renewable</span><span className="mono">{n(plan.renewable_share_pct, 1)}%</span></div><div className="flex justify-between"><span className="text-[#718183]">Reliability</span><span className="mono">{n(plan.reliability_pct, 1)}%</span></div></div></div>)}</div></div>}</div></div></div>;
}

function CommunityPage() {
  const community = useGetCommunity({ query: { queryKey: getGetCommunityQueryKey() } });
  const assets = useGetAssets({ query: { queryKey: getGetAssetsQueryKey() } });
  const state = useGetMicrogridState({ query: { queryKey: getGetMicrogridStateQueryKey(), staleTime: 30000 } });
  const d: any = state.data?.demand?.tier_breakdown;
  return <div className="animate-rise"><PageHeading kicker="Community / assets" title={community.data?.name ?? 'Community profile'} description={community.data ? `${community.data.location} · ${n(community.data.population)} residents · reliability target ${n(community.data.reliability_target_pct, 1)}%` : 'Loading community metadata and connected assets.'} /><div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]"><div className="panel p-5 md:p-7"><div className="eyebrow">Load tiers</div><h2 className="mt-1 text-lg font-bold text-[#174b50]">What the community is protecting</h2><div className="mt-7 space-y-5">{[['T1', 'Critical', d?.tier1_critical_kw, '#b65b4a'], ['T2', 'Important', d?.tier2_important_kw, '#c18f35'], ['T3', 'Standard', d?.tier3_standard_kw, '#5b9aa2'], ['T4', 'Flexible', d?.tier4_flexible_kw, '#8b9c86']].map(([tier, label, value, color]: any, i) => <div key={tier} data-testid={`row-load-tier-${tier}`}><div className="mb-2 flex items-center gap-3"><span className="mono text-[10px] text-[#7b8b8c]">{tier}</span><span className="flex-1 text-xs font-bold">{label}</span><span className="mono text-[11px]">{n(value)} kW</span></div><div className="h-2 bg-[#e1e6dc]"><div className="h-full" style={{ background: color, width: `${Math.min(100, ((value ?? 0) / Math.max(state.data?.demand?.total_kw ?? 1, 1)) * 100)}%` }} /></div><div className="mt-1 text-[10px] text-[#829091]">{i === 0 ? 'Always served' : i === 1 ? 'Held through stage 2' : i === 2 ? 'Reduced during reserve events' : 'First to curtail'}</div></div>)}</div></div><div className="panel p-5 md:p-7"><div className="eyebrow">Installed capacity</div><h2 className="mt-1 text-lg font-bold text-[#174b50]">Energy assets</h2>{assets.isLoading ? <div className="mt-6 space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : assets.isError ? <div className="mt-5"><ErrorState error={assets.error} retry={() => assets.refetch()} /></div> : <div className="mt-5 divide-y divide-[#dce2da]">{[['Solar generation', assets.data?.solar_capacity_kw, 'kW', SunMedium], ['Wind generation', assets.data?.wind_capacity_kw, 'kW', Wind], ['Battery storage', assets.data?.battery_capacity_kwh, 'kWh', BatteryCharging], ['Diesel backup', assets.data?.diesel_capacity_kw, 'kW', Activity]].map(([label, value, unit, Icon]: any) => <div key={label} className="flex items-center gap-3 py-4"><div className="grid h-9 w-9 place-items-center rounded-sm bg-[#e1ece3] text-[#28745f]"><Icon size={17} /></div><span className="flex-1 text-xs font-semibold">{label}</span><span className="mono text-xs text-[#174b50]">{n(value)} {unit}</span></div>)}</div>}</div></div></div>;
}

function HistoryPage() {
  const state = useGetMicrogridState({ query: { queryKey: getGetMicrogridStateQueryKey() } });
  const ladder = useGetLadder({ query: { queryKey: getGetLadderQueryKey() } });
  const items = useMemo(() => [{ time: state.data?.timestamp, title: 'Telemetry synchronized', detail: state.data?.signal?.message ?? 'Current digital twin state loaded', tone: 'green' }, ...(ladder.data?.reason_codes ?? []).map((reason: string, i: number) => ({ time: new Date(Date.now() - (i + 1) * 3600000).toISOString(), title: 'Ladder evaluation', detail: reason, tone: 'yellow' })), { time: new Date(Date.now() - 86400000).toISOString(), title: 'Optimization policy active', detail: 'Critical loads prioritized; diesel held in reserve', tone: 'blue' }], [state.data?.timestamp, state.data?.signal?.message, ladder.data?.reason_codes]);
  return <div className="animate-rise"><PageHeading kicker="History / event feed" title="Decisions, recorded." description="A concise operator trail from the current operating envelope and dispatch rationale." /><div className="panel p-5 md:p-7"><div className="flex items-center justify-between border-b border-[#d8dfd6] pb-4"><div className="eyebrow">Recent operations</div><span className="mono text-[10px] text-[#7b8b8c]">{items.length} events</span></div><div className="relative mt-3">{items.map((item, i) => <div key={`${item.title}-${i}`} className="relative flex gap-4 border-b border-[#e3e7df] py-5 last:border-0"><div className="relative z-10 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#c8d7cc] bg-[#f3f3e9] text-[#36786a]"><Activity size={13} /></div><div className="flex-1"><div className="flex flex-wrap items-center gap-3"><h3 className="text-xs font-bold text-[#174b50]">{item.title}</h3><span className={cx('rounded-sm px-2 py-1 text-[9px] font-bold', item.tone === 'yellow' ? 'signal-yellow' : item.tone === 'green' ? 'signal-green' : 'bg-[#e0edf0] text-[#397b85]')}>{item.tone === 'yellow' ? 'REVIEW' : 'LOGGED'}</span></div><p className="mt-1 text-xs text-[#6d7e80]">{item.detail}</p></div><span className="mono text-[10px] text-[#849193]">{date(item.time)} {time(item.time)}</span></div>)}</div></div></div>;
}

function SettingsPage() {
  const optimize = useOptimize(); const [saved, setSaved] = useState(false);
  const [values, setValues] = useState({ reserve: '24', reliability: '99.5', horizon: '24', threshold: '18' });
  const save = () => { localStorage.setItem('navya_parameters', JSON.stringify(values)); setSaved(true); setTimeout(() => setSaved(false), 1800); };
  return <div className="animate-rise"><PageHeading kicker="Settings / operating envelope" title="Parameters for the field." description="Compact controls for the current operating policy. Changes are stored locally for this operator station." action={<button onClick={() => optimize.mutate({ data: { horizon_hours: Number(values.horizon) as 24 | 72, trigger_reason: 'parameter_review' } })} className="flex items-center gap-2 border border-[#8fa9a2] bg-[#eef1e8] px-4 py-3 text-xs font-bold text-[#174b50]" data-testid="button-test-parameters"><SlidersHorizontal size={15} /> Test parameters</button>} /><div className="max-w-3xl panel p-5 md:p-8"><div className="grid gap-x-8 gap-y-7 md:grid-cols-2">{[['reserve', 'Battery reserve floor', '%', 'Minimum state of charge before diesel support'], ['reliability', 'Reliability target', '%', 'Target service level for critical loads'], ['horizon', 'Optimization horizon', 'hours', 'Dispatch window used by the operator action'], ['threshold', 'Diesel start threshold', 'kW', 'Demand gap that triggers backup preparation']].map(([key, label, unit, help]) => <label key={key} className="block text-[11px] font-bold text-[#53686a]">{label}<div className="mt-2 flex items-center border border-[#b8c9c1] bg-[#f7f5ed]"><input value={(values as any)[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} className="w-full bg-transparent px-3 py-2.5 text-sm outline-none" data-testid={`input-setting-${key}`} /><span className="mono pr-3 text-[10px] text-[#7e8e8f]">{unit}</span></div><span className="mt-1 block font-normal text-[#849193]">{help}</span></label>)}</div><div className="mt-9 flex items-center justify-between border-t border-[#dce2da] pt-5"><span className="text-xs text-[#087c62]">{saved ? 'Parameters saved to this station.' : 'Unsaved changes stay local until saved.'}</span><button onClick={save} className="bg-[#174b50] px-5 py-2.5 text-xs font-bold text-[#f0ebdd]" data-testid="button-save-settings">Save parameters</button></div></div></div>;
}

function LoginPage() {
  const [, setLocation] = useLocation(); const [registerMode, setRegisterMode] = useState(false); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [notice, setNotice] = useState('');
  const login = useLogin(); const register = useRegister();
  useEffect(() => { if (localStorage.getItem('navya_auth')) setLocation('/'); }, [setLocation]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setNotice(''); if (registerMode) register.mutate({ data: { email, password } }, { onSuccess: () => { setNotice('Operator account created. Sign in to continue.'); setRegisterMode(false); }, onError: x => setNotice(errText(x)) }); else login.mutate({ data: { email, password } }, { onSuccess: response => { localStorage.setItem('navya_auth', JSON.stringify(response)); setLocation('/'); }, onError: x => setNotice(errText(x)) }); };
  const pending = login.isPending || register.isPending;
  return <div className="navya-grid flex min-h-[100dvh] items-center justify-center bg-[#e9e5d8] px-5 py-10"><div className="grid w-full max-w-[940px] overflow-hidden border border-[#bdcbc2] bg-[#f5f2e8] shadow-[0_18px_60px_rgba(36,75,70,.1)] md:grid-cols-[1fr_390px]"><div className="relative hidden min-h-[600px] flex-col justify-between overflow-hidden bg-[#174b50] p-10 text-[#f0ebdd] md:flex"><div className="absolute -right-20 -top-16 h-72 w-72 rounded-full border-[24px] border-[#d4a342]/30" /><div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full border-[30px] border-[#63a388]/25" /><Brand /><div className="relative"><div className="eyebrow text-[#afc2b9]">Operator access / 01</div><h1 className="mt-4 max-w-sm text-5xl font-extrabold leading-[.97] tracking-[-.06em]">Know the next move.</h1><p className="mt-6 max-w-sm text-sm leading-6 text-[#b8cbc1]">NAVYA gives off-grid operators a clear view of energy now, energy next, and the decisions that keep a community online.</p></div><div className="relative flex items-center gap-3 border-t border-[#4d7777] pt-5"><ShieldCheck size={18} className="text-[#e1b34e]" /><span className="text-[11px] text-[#b8cbc1]">Authorized field console · Kijani Ridge</span></div></div><div className="p-7 md:p-10"><div className="md:hidden"><Brand /></div><div className="mt-10 md:mt-20"><div className="eyebrow">{registerMode ? 'New operator' : 'Secure sign in'}</div><h2 className="mt-2 text-2xl font-extrabold tracking-[-.04em] text-[#174b50]">{registerMode ? 'Create access.' : 'Welcome back.'}</h2><p className="mt-2 text-xs leading-5 text-[#708081]">{registerMode ? 'Register an operator identity for this console.' : 'Sign in to access live community controls.'}</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block text-[11px] font-bold text-[#53686a]">Operator email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full border border-[#b8c9c1] bg-[#fbf9f1] px-3 py-3 text-sm outline-none focus:border-[#0c6e5c]" data-testid="input-email" /></label><label className="block text-[11px] font-bold text-[#53686a]">Passphrase<input required minLength={6} type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full border border-[#b8c9c1] bg-[#fbf9f1] px-3 py-3 text-sm outline-none focus:border-[#0c6e5c]" data-testid="input-password" /></label>{notice && <p className={cx('text-xs', notice.includes('created') ? 'text-[#087c62]' : 'text-[#ad4d3f]')} data-testid="status-auth">{notice}</p>}<button disabled={pending} className="w-full bg-[#174b50] py-3.5 text-xs font-bold text-[#f0ebdd] disabled:opacity-60" data-testid="button-submit-auth">{pending ? 'Connecting' : registerMode ? 'Create operator account' : 'Enter control center'}</button></form><button onClick={() => { setRegisterMode(!registerMode); setNotice(''); }} className="mt-6 text-xs font-bold text-[#0c6e5c] underline underline-offset-4" data-testid="button-toggle-auth">{registerMode ? 'Already have access? Sign in' : 'Need an operator account? Register'}</button></div></div></div></div>;
}

function KioskPage() {
  const query = useGetSignal({ query: { queryKey: getGetSignalQueryKey(), refetchInterval: 20000 } });
  const [cached, setCached] = useState<any>(() => { try { return JSON.parse(localStorage.getItem('navya_public_signal') || 'null'); } catch { return null; } });
  useEffect(() => { if (query.data) { setCached(query.data); localStorage.setItem('navya_public_signal', JSON.stringify(query.data)); } }, [query.data]);
  const signal: any = query.data ?? cached;
  return <div className="navya-grid min-h-[100dvh] bg-[#174b50] text-[#f0ebdd]"><header className="flex items-center justify-between border-b border-[#406c6c] px-6 py-5 md:px-12"><Brand /><span className="mono text-[10px] uppercase tracking-[.16em] text-[#afc2b9]">Public community signal</span></header><main className="mx-auto flex min-h-[calc(100dvh-77px)] max-w-[1000px] flex-col justify-center px-6 py-12 text-center md:px-12"><div className="eyebrow text-[#a9c2b7]">Kijani Ridge · power status</div><div className={cx('mx-auto mt-7 grid h-36 w-36 place-items-center rounded-full border-[10px]', signal?.color === 'RED' ? 'border-[#d67768] bg-[#934c43]' : signal?.color === 'YELLOW' ? 'border-[#d8b65d] bg-[#886a35]' : 'border-[#6db392] bg-[#356c62]')}><span className="text-5xl font-extrabold">{signal?.color === 'RED' ? '!' : signal?.color === 'YELLOW' ? '~' : '✓'}</span></div><h1 className="mt-9 text-5xl font-extrabold tracking-[-.06em] md:text-7xl" data-testid="text-public-signal">{signal?.color === 'RED' ? 'Conserve energy.' : signal?.color === 'YELLOW' ? 'Use energy thoughtfully.' : 'Power is steady.'}</h1><p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#b8cbc1]" data-testid="text-public-message">{signal?.message ?? 'Signal is not available. The display will update when connected.'}</p><div className="mt-12 flex items-center justify-center gap-3 text-[10px] text-[#91b0a5]"><span className={cx('h-2 w-2 rounded-full', query.isError ? 'bg-[#d8b65d]' : 'bg-[#76b896]')} />{query.isError ? 'Showing last known signal' : `Updated ${time(signal?.updated_at)}`}</div></main></div>;
}

function AppRouter() {
  const [location] = useLocation();
  const auth = localStorage.getItem('navya_auth');
  if (location === '/login') return <LoginPage />;
  if (location === '/community-display') return <KioskPage />;
  if (!auth) return <LoginPage />;
  return <Shell><Switch><Route path="/" component={Dashboard} /><Route path="/forecast" component={ForecastPage} /><Route path="/scenarios" component={ScenariosPage} /><Route path="/community" component={CommunityPage} /><Route path="/history" component={HistoryPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></Shell>;
}

function RoutedBoundary() { const [location] = useLocation(); return <ErrorBoundary resetKey={location}><AppRouter /></ErrorBoundary>; }
export default function App() { return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedBoundary /></WouterRouter></QueryClientProvider>; }