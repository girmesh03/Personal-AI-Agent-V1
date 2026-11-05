/**
 * @module theme/useThemeMode
 * @description Hook providing the active theme mode and toggle function bridging MUI v6 useColorScheme.
 */
import { useColorScheme } from '@mui/material/styles';

/**
 * Custom hook providing the active theme mode and toggle function.
 * Bridges MUI v6 useColorScheme with layout navigation and control bars.
 *
 * @function useThemeMode
 * @returns {{ mode: 'light' | 'dark', toggleTheme: () => void, setMode: (mode: string) => void }}
 */
export const useThemeMode = () => {
  const { mode, systemMode, setMode } = useColorScheme();
  const currentMode = mode === 'system' ? systemMode : mode;
  const effectiveMode = currentMode || 'light';

  return {
    mode: effectiveMode,
    setMode,
    toggleTheme: () => setMode(effectiveMode === 'dark' ? 'light' : 'dark'),
  };
};

export default useThemeMode;
