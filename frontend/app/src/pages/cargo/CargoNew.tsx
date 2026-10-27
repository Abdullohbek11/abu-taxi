import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlaceField, type LatLng } from '../../components/LocationPicker';
import { RegionSelect } from '../../components/RegionSelect';
import { IconPlus, IconTrash } from '../../components/Icons';
import { Alert, Button, Input, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { errorText, fieldErrors } from '../../lib/errors';
import { addDays, money, tashkentDateKey } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { regionCenterCoords, useCities } from '../../lib/queries';
import { useToast } from '../../lib/toast';
import type { Cargo, CargoType } from '../../lib/types';
import type { MessageKey } from '../../locales/uz';

const TYPES: CargoType[] = ['FURNITURE', 'APPLIANCE', 'FOOD', 'CONSTRUCTION', 'OTHER'];

export default function CargoNew() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  const { data: cities } = useCities();
  const [f, setF] = useState({
    type: 'OTHER' as CargoType,
    weightKg: params.get('kg') ?? '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    fromCityId: params.get('from') ?? '',
    toCityId: params.get('to') ?? '',
    pickupAddress: '',
    dropoffAddress: '',
    date: params.get('date') ?? tashkentDateKey(),
    offeredPrice: '',
    description: '',
  });

  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const create = useMutation({
    mutationFn: () => {
      // Rasmlar bo'lsa multipart, bo'lmasa JSON — backend ikkalasini qabul qiladi
      const fields: Record<string, string> = { type: f.type, weightKg: f.weightKg, fromCityId: f.fromCityId, toCityId: f.toCityId, pickupAddress: f.pickupAddress.trim(), dropoffAddress: f.dropoffAddress.trim(), date: f.date };
      for (const k of ['lengthCm', 'widthCm', 'heightCm', 'offeredPrice'] as const) if (f[k]) fields[k] = f[k];
      if (f.description.trim()) fields.description = f.description.trim();
      if (pickup) Object.assign(fields, { pickupLat: String(pickup.lat), pickupLng: String(pickup.lng) });
      if (dropoff) Object.assign(fields, { dropoffLat: String(dropoff.lat), dropoffLng: String(dropoff.lng) });
      if (!photos.length) return api.post<Cargo>('/cargo', fields);
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      photos.forEach((p) => form.append('photos', p));
      return api.upload<Cargo>('/cargo', form);
    },
    onSuccess: () => {
      toast(t('cargo.created'));
      void qc.invalidateQueries({ queryKey: ['cargo'] });
      navigate('/cargo/my');
    },
  });
  const fe = fieldErrors(create.error);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '').slice(0, 8) });

  return (
    <form
      className="page page-narrow stack"
      style={{ gap: 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h1 className="page-title">{t('cargo.newTitle')}</h1>

      <div className="card stack">
        <span className="field-label">{t('cargo.type')}</span>
        <div className="row-wrap" role="radiogroup">
          {TYPES.map((type) => (
            <button key={type} type="button" role="radio" aria-checked={f.type === type} className={`btn btn-sm ${f.type === type ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setF({ ...f, type })}>
              {t(`cargo.${type}` as MessageKey)}
            </button>
          ))}
        </div>
        <div className="grid-2">
          <Input label={t('cargo.weight')} inputMode="numeric" value={f.weightKg} onChange={digits('weightKg')} required placeholder="120" error={fe.weightKg} />
          <Input label={`${t('cargo.price')} (${t('common.optional')})`} inputMode="numeric" value={f.offeredPrice} onChange={digits('offeredPrice')} placeholder="300 000" hint={f.offeredPrice ? `${money(Number(f.offeredPrice))} ${t('common.som')}` : undefined} error={fe.offeredPrice} />
        </div>
        <span className="field-label">{t('cargo.dims')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
          <Input aria-label={t('cargo.length')} placeholder={t('cargo.length')} inputMode="numeric" value={f.lengthCm} onChange={digits('lengthCm')} />
          <Input aria-label={t('cargo.width')} placeholder={t('cargo.width')} inputMode="numeric" value={f.widthCm} onChange={digits('widthCm')} />
          <Input aria-label={t('cargo.height')} placeholder={t('cargo.height')} inputMode="numeric" value={f.heightCm} onChange={digits('heightCm')} />
        </div>
      </div>

      <div className="card stack">
        <div className="grid-2">
          <RegionSelect label={t('common.from')} value={f.fromCityId} onChange={(id) => setF({ ...f, fromCityId: id })} error={fe.fromCityId} />
          <RegionSelect label={t('common.to')} value={f.toCityId} onChange={(id) => setF({ ...f, toCityId: id })} error={fe.toCityId} />
        </div>
        <PlaceField label={t('cargo.pickup')} address={f.pickupAddress} onAddress={(v) => setF({ ...f, pickupAddress: v })} point={pickup} onPoint={setPickup} center={regionCenterCoords(cities, f.fromCityId)} required error={fe.pickupAddress ?? fe.pickupLat} />
        <PlaceField label={t('cargo.dropoff')} address={f.dropoffAddress} onAddress={(v) => setF({ ...f, dropoffAddress: v })} point={dropoff} onPoint={setDropoff} center={regionCenterCoords(cities, f.toCityId)} required error={fe.dropoffAddress ?? fe.dropoffLat} />
        <Input label={t('cargo.date')} type="date" value={f.date} min={tashkentDateKey()} max={addDays(tashkentDateKey(), 30)} onChange={set('date')} required error={fe.date} />
      </div>

      <div className="card stack">
        <Textarea label={`${t('cargo.description')} (${t('common.optional')})`} value={f.description} onChange={set('description')} maxLength={1000} rows={3} />
        <span className="field-label">{t('cargo.photos')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
          {previews.map((src, i) => (
            <div key={src} style={{ position: 'relative' }}>
              <img src={src} alt="" className="thumb" />
              <button type="button" className="icon-btn" style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28 }} onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="×">
                <IconTrash size={14} />
              </button>
            </div>
          ))}
          {photos.length < 5 ? (
            <button type="button" className="upload-box" style={{ aspectRatio: '4/3', justifyContent: 'center', padding: 0 }} onClick={() => fileRef.current?.click()} aria-label={t('drv.addPhotos')}>
              <IconPlus />
            </button>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && setPhotos([...photos, ...e.target.files].slice(0, 5))} />
      </div>

      {create.isError && !Object.keys(fe).length ? <Alert kind="error">{errorText(create.error, t)}</Alert> : null}
      <Button size="lg" type="submit" loading={create.isPending}>
        {t('cargo.submit')}
      </Button>
    </form>
  );
}
