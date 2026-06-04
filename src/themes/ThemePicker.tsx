import { useMemo } from 'react'
import { Dropdown, type DropdownOption } from '../components/Dropdown'
import { settingsStore } from '../lib/settingsStore'
import { THEMES, themeStore, useTheme } from './themeStore'

export function ThemePicker() {
  const current = useTheme()

  const options = useMemo<DropdownOption[]>(
    () => THEMES.map((t) => ({ value: t.name, label: t.name, swatch: t.palette[4] })),
    []
  )

  const onChange = (name: string): void => {
    themeStore.apply(name)
    void settingsStore.update({ themeName: name })
  }

  return (
    <Dropdown
      value={current.name}
      options={options}
      onChange={onChange}
      searchable
      align="right"
      minWidth={220}
    />
  )
}
