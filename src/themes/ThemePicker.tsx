import { settingsStore } from '../lib/settingsStore'
import { THEMES, themeStore, useTheme } from './themeStore'

export function ThemePicker() {
  const current = useTheme()

  const onChange = (name: string): void => {
    themeStore.apply(name)
    void settingsStore.update({ themeName: name })
  }

  return (
    <div className="theme-picker" title="Theme">
      <span className="theme-swatch" style={{ background: current.palette[4] }} />
      <select
        className="theme-select"
        value={current.name}
        onChange={(e) => onChange(e.target.value)}
      >
        {THEMES.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  )
}
