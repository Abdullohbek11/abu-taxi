import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RegionSelect } from '../components/RegionSelect';
import { RideRequestForm } from '../components/RideRequestForm';
import { IconSearch, IconSwap } from '../components/Icons';
import { TripCard } from '../components/TripCard';
import { Button, Checkbox, Empty, ErrorState, Input, Segmented, Skeleton, Stepper } from '../components/ui';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';
import { addDays, dayLabel, regionName, tashkentDateKey } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useCities } from '../lib/queries';
import type { Trip } from '../lib/types';

type Sort = 'time' | 'price' | 'rating';

export default function Search() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const { data: cities } = useCities();
  const [showFilters, setShowFilters] = useState(false);

  const q = useMemo(
    () => ({
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      date: params.get('date') ?? '',
      seats: Number(params.get('seats') ?? 1),
      sort: (params.get('sort') as Sort) || 'time',
      timeFrom: params.get('timeFrom') ?? '',
      timeTo: params.get('timeTo') ?? '',
      minPrice: params.get('minPrice') ?? '',
      maxPrice: params.get('maxPrice') ?? '',
      pickupFromHome: params.get('pickupFromHome') === 'true',
      acceptsCargo: params.get('acceptsCargo') === 'true',
    }),
    [params],
  );

  const set = (patch: Record<string, string | number | boolean | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === false) p.delete(k);
      else p.set(k, String(v));
    }
    setParams(p, { replace: true });
  };

  const query = useInfiniteQuery({
    queryKey: ['search', q],
    enabled: !!(q.from && q.to),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.page<Trip>('/trips', {
        from: q.from,
        to: q.to,
        date: q.date || undefined,
        seats: q.seats,
        sort: q.sort,
        timeFrom: q.date ? q.timeFrom || undefined : undefined,
        timeTo: q.date ? q.timeTo || undefined : undefined,
        minPrice: q.minPrice || undefined,
        maxPrice: q.maxPrice || undefined,
        pickupFromHome: q.pickupFromHome || undefined,
        acceptsCargo: q.acceptsCargo || undefined,
        limit: 20,
        cursor: pageParam,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const trips = query.data?.pages.flatMap((p) => p.items) ?? [];
  const fromCity = cities?.find((c) => c.id === q.from);
  const toCity = cities?.find((c) => c.id === q.to);
  const filtersActive = [q.timeFrom, q.timeTo, q.minPrice, q.maxPrice, q.pickupFromHome, q.acceptsCargo].filter(Boolean).length;

  return (
    <div className="page stack" style={{ gap: 24 }}>
      <div>
        <h1 className="page-title">{fromCity && toCity ? t('search.title', { from: regionName(fromCity.region, lang), to: regionName(toCity.region, lang) }) : t('nav.search')}</h1>
        {q.date ? <p className="page-sub">{dayLabel(q.date, lang, t)}</p> : null}
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 12, alignItems: 'end' }}>
          <RegionSelect label={t('common.from')} value={q.from} onChange={(id) => set({ from: id })} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <button className="icon-btn" aria-label={t('land.swap')} onClick={() => set({ from: q.to, to: q.from })} style={{ marginBottom: 4 }}>
              <IconSwap />
            </button>
            <div style={{ flex: 1 }}>
              <RegionSelect label={t('common.to')} value={q.to} onChange={(id) => set({ to: id })} />
            </div>
          </div>
          <Input label={t('common.date')} type="date" value={q.date} min={tashkentDateKey()} max={addDays(tashkentDateKey(), 30)} onChange={(e) => set({ date: e.target.value })} />
          <div className="field">
            <span className="field-label">{t('land.passengers')}</span>
            <Stepper value={q.seats} max={8} onChange={(v) => set({ seats: v })} label={t('common.people', { n: q.seats })} />
          </div>
        </div>
        <div className="row-wrap between">
          <Segmented<Sort>
            value={q.sort}
            onChange={(v) => set({ sort: v === 'time' ? null : v })}
            options={[
              { value: 'time', label: t('search.sortTime') },
              { value: 'price', label: t('search.sortPrice') },
              { value: 'rating', label: t('search.sortRating') },
            ]}
          />
          <Button variant="ghost" size="sm" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            {t('search.filters')}
            {filtersActive ? <span className="badge badge-yellow">{filtersActive}</span> : null}
          </Button>
        </div>
        {showFilters ? (
          <div className="stack" style={{ animation: 'abFade 200ms both', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="grid-3">
              <Input label={t('search.timeFrom')} type="time" value={q.timeFrom} onChange={(e) => set({ timeFrom: e.target.value })} disabled={!q.date} />
              <Input label={t('search.timeTo')} type="time" value={q.timeTo} onChange={(e) => set({ timeTo: e.target.value })} disabled={!q.date} />
              <Input label={t('search.minPrice')} inputMode="numeric" value={q.minPrice} onChange={(e) => set({ minPrice: e.target.value.replace(/\D/g, '') })} placeholder="100 000" />
              <Input label={t('search.maxPrice')} inputMode="numeric" value={q.maxPrice} onChange={(e) => set({ maxPrice: e.target.value.replace(/\D/g, '') })} placeholder="200 000" />
            </div>
            <div className="row-wrap" style={{ gap: 20 }}>
              <Checkbox label={t('search.pickup')} checked={q.pickupFromHome} onChange={(v) => set({ pickupFromHome: v })} />
              <Checkbox label={t('search.acceptsCargo')} checked={q.acceptsCargo} onChange={(v) => set({ acceptsCargo: v })} />
              {filtersActive ? (
                <Button variant="ghost" size="sm" onClick={() => set({ timeFrom: null, timeTo: null, minPrice: null, maxPrice: null, pickupFromHome: null, acceptsCargo: null })}>
                  {t('search.reset')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {!q.from || !q.to ? (
        <Empty icon={<IconSearch size={26} />} title={t('search.pickRoute')} hint={t('search.pickRouteHint')} />
      ) : query.isPending ? (
        <Skeleton height={120} count={4} />
      ) : query.isError ? (
        <ErrorState message={errorText(query.error, t)} onRetry={() => query.refetch()} />
      ) : trips.length === 0 ? (
        <div className="stack" style={{ gap: 16 }}>
          <Empty
            icon={<IconSearch size={26} />}
            title={t('search.empty')}
            hint={t('search.emptyHint')}
            action={
              q.date ? (
                <Button variant="ghost" onClick={() => set({ date: addDays(q.date, 1) })}>
                  {dayLabel(addDays(q.date, 1), lang, t)} →
                </Button>
              ) : undefined
            }
          />
          {q.from !== q.to ? <RideRequestForm key={`${q.from}-${q.to}-${q.date}`} fromCityId={q.from} toCityId={q.to} date={q.date} seats={q.seats} /> : null}
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <span className="muted small">{t('search.found', { n: trips.length + (query.hasNextPage ? '+' : '') })}</span>
          {trips.map((trip, i) => (
            <TripCard key={trip.id} trip={trip} to={`/trips/${trip.id}?seats=${q.seats}`} delay={Math.min(i, 8) * 40} />
          ))}
          {query.hasNextPage ? (
            <Button variant="ghost" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage} style={{ alignSelf: 'center' }}>
              {t('common.more')}
            </Button>
          ) : (
            <details className="ride-req-more">
              <summary>{t('rr.notSuitable')}</summary>
              <RideRequestForm fromCityId={q.from} toCityId={q.to} date={q.date} seats={q.seats} />
            </details>
          )}
        </div>
      )}
    </div>
  );
}
