import { Moon, Sun } from 'lucide-react';

export type AppTab = 'benchmark' | 'history' | 'guide';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  historyCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Header({
  activeTab,
  onTabChange,
  historyCount,
  theme,
  onToggleTheme,
}: HeaderProps) {
  const isDark = theme === 'dark';

  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: 'benchmark', label: 'Benchmark' },
    { id: 'history', label: historyCount > 0 ? `Riwayat (${historyCount})` : 'Riwayat' },
    { id: 'guide', label: 'Panduan' },
  ];

  return (
    <header
      className={`sticky top-0 z-30 border-b backdrop-blur-xl transition-colors ${
        isDark
          ? 'border-white/10 bg-black/75'
          : 'border-black/8 bg-white/80'
      }`}
    >
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onTabChange('benchmark')}
          className="text-sm font-semibold tracking-tight transition-opacity hover:opacity-75"
        >
          DNSlytics
        </button>

        <nav aria-label="Navigasi utama" className="flex items-center gap-6">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`text-xs transition-colors sm:text-[13px] ${
                  active
                    ? isDark
                      ? 'font-medium text-white'
                      : 'font-medium text-[#1d1d1f]'
                    : isDark
                      ? 'text-[#86868b] hover:text-white'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          title={isDark ? 'Mode Terang' : 'Mode Gelap'}
          className={`rounded-full p-1.5 transition-colors ${
            isDark
              ? 'text-[#86868b] hover:bg-white/10 hover:text-white'
              : 'text-[#6e6e73] hover:bg-black/5 hover:text-[#1d1d1f]'
          }`}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
