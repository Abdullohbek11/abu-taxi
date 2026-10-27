import { regionName } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { regionOptions, useCities } from '../lib/queries';
import { Select } from './ui';

/**
 * Yo'nalish tanlash: shahar emas, hudud (viloyat). Qiymat — hudud markazining id'si;
 * qidiruv butun hududni qamraydi, aniq manzil esa xaritadan belgilanadi.
 */
export function RegionSelect({ label, value, onChange, error }: { label: string; value: string; onChange: (id: string) => void; error?: string }) {
  const { lang, t } = useI18n();
  const { data: cities } = useCities();
  const options = regionOptions(cities);
  // Eski havolalarda tuman id'si bo'lishi mumkin — uni hudud markaziga keltiramiz
  const city = cities?.find((c) => c.id === value);
  const selected = city ? (options.find((o) => o.region === city.region)?.center.id ?? value) : value;
  return (
    <Select label={label} value={selected} onChange={(e) => onChange(e.target.value)} error={error} required>
      <option value="" disabled>
        {t('land.pickCity')}
      </option>
      {options.map((o) => (
        <option key={o.center.id} value={o.center.id}>
          {regionName(o.region, lang)}
        </option>
      ))}
    </Select>
  );
}
