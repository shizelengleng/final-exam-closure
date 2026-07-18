import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface ThemeConfig {
  id: string
  name: string
  colors: {
    primary: string
    primaryLight: string
    primaryDark: string
    bg: string
    bgSecondary: string
    bgCard: string
    text: string
    textSecondary: string
    border: string
    accent: string
  }
}

const THEMES: ThemeConfig[] = [
  {
    id: 'ocean',
    name: '深海蓝',
    colors: {
      primary: '#1677ff',
      primaryLight: '#e6f4ff',
      primaryDark: '#0958d9',
      bg: '#f5f7fa',
      bgSecondary: '#ffffff',
      bgCard: '#ffffff',
      text: '#1f2937',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      accent: '#3b82f6',
    },
  },
  {
    id: 'forest',
    name: '森林绿',
    colors: {
      primary: '#52c41a',
      primaryLight: '#f6ffed',
      primaryDark: '#389e0d',
      bg: '#f6f8f5',
      bgSecondary: '#ffffff',
      bgCard: '#ffffff',
      text: '#1f2937',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      accent: '#22c55e',
    },
  },
  {
    id: 'sunset',
    name: '暖阳橙',
    colors: {
      primary: '#fa8c16',
      primaryLight: '#fff7e6',
      primaryDark: '#d46b08',
      bg: '#fdf8f3',
      bgSecondary: '#ffffff',
      bgCard: '#ffffff',
      text: '#1f2937',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      accent: '#f97316',
    },
  },
  {
    id: 'lavender',
    name: '暮光紫',
    colors: {
      primary: '#722ed1',
      primaryLight: '#f9f0ff',
      primaryDark: '#531dab',
      bg: '#f8f5fc',
      bgSecondary: '#ffffff',
      bgCard: '#ffffff',
      text: '#1f2937',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      accent: '#a855f7',
    },
  },
  {
    id: 'rose',
    name: '玫瑰红',
    colors: {
      primary: '#eb2f96',
      primaryLight: '#fff0f6',
      primaryDark: '#c41d7f',
      bg: '#fdf5f8',
      bgSecondary: '#ffffff',
      bgCard: '#ffffff',
      text: '#1f2937',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      accent: '#ec4899',
    },
  },
  {
    id: 'dark',
    name: '暗夜模式',
    colors: {
      primary: '#58a6ff',
      primaryLight: '#1f2937',
      primaryDark: '#79c0ff',
      bg: '#0d1117',
      bgSecondary: '#161b22',
      bgCard: '#1c2128',
      text: '#e6edf3',
      textSecondary: '#8b949e',
      border: '#30363d',
      accent: '#58a6ff',
    },
  },
]

interface ThemeContextType {
  theme: ThemeConfig
  themes: ThemeConfig[]
  setTheme: (id: string) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType>({
  theme: THEMES[0],
  themes: THEMES,
  setTheme: () => {},
  isDark: false,
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem('theme-id') || 'ocean'
  })

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0]

  useEffect(() => {
    localStorage.setItem('theme-id', themeId)
    const root = document.documentElement
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value)
    })
  }, [themeId, theme])

  const setTheme = (id: string) => {
    setThemeId(id)
  }

  const isDark = themeId === 'dark'

  return (
    <ThemeContext.Provider value={{ theme, themes: THEMES, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}
