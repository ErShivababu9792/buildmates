import { setTheme, useTheme } from '../lib/theme';
import { useT } from '../i18n';
import Icon from './Icon';

/** Quick sun/moon button: switches between light and dark. */
export function ThemeButton() {
  const { resolved } = useTheme();
  const { t } = useT();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="theme-btn" onClick={() => setTheme(next)}
      aria-label={next === 'dark' ? t('theme.toDark') : t('theme.toLight')} title={next === 'dark' ? t('theme.toDark') : t('theme.toLight')}>
      <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={20} />
    </button>
  );
}

/** Full choice for Profile: follow the device, always light, or always dark. */
export function ThemePicker() {
  const { theme } = useTheme();
  const { t } = useT();
  return (
    <div className="seg compact" role="group" aria-label={t('theme.title')}>
      {[['system', t('theme.system')], ['light', t('theme.light')], ['dark', t('theme.dark')]].map(([k, l]) => (
        <button key={k} type="button" aria-pressed={theme === k} onClick={() => setTheme(k)}>{l}</button>
      ))}
    </div>
  );
}
