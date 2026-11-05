/**
 * @module theme/AppTheme
 * @description Root Material UI ThemeProvider integrating design tokens, CSS variables, and component customizations.
 */
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import {
  inputsCustomizations,
  dataDisplayCustomizations,
  feedbackCustomizations,
  navigationCustomizations,
  surfacesCustomizations,
  chartsCustomizations,
  dataGridCustomizations,
  datePickersCustomizations,
} from './customizations';

import { colorSchemes, typography, shadows, shape } from './themePrimitives';

/**
 * Top-level Material UI Theme Provider component.
 * Configures MUI v6 CSS variables, color schemes, typography, and component overrides.
 *
 * @component AppTheme
 * @param {object} props - Component properties.
 * @param {import('react').ReactNode} props.children - Child components to wrap.
 * @returns {JSX.Element} The theme provider wrapping children with CssBaseline.
 */
export const AppTheme = ({ children }) => {
  const theme = useMemo(
    () =>
      createTheme({
        cssVariables: {
          colorSchemeSelector: 'data-mui-color-scheme',
          cssVarPrefix: 'template',
        },
        colorSchemes,
        typography,
        shadows,
        shape,
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              html: {
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                margin: 0,
                padding: 0,
                WebkitTextSizeAdjust: '100%',
              },
              body: {
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                margin: 0,
                padding: 0,
              },
              '#root': {
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              },
            },
          },
          ...inputsCustomizations,
          ...dataDisplayCustomizations,
          ...feedbackCustomizations,
          ...navigationCustomizations,
          ...surfacesCustomizations,
          ...chartsCustomizations,
          ...dataGridCustomizations,
          ...datePickersCustomizations,
          MuiChatStreamingIndicator: {
            styleOverrides: {
              root: {
                backgroundColor: 'transparent !important',
                boxShadow: 'none !important',
                border: 'none !important',
              },
              bubble: {
                backgroundColor: 'transparent !important',
                boxShadow: 'none !important',
                border: 'none !important',
                padding: '0 !important',
              },
            },
          },
          MuiChatTypingIndicator: {
            styleOverrides: {
              root: {
                backgroundColor: 'transparent !important',
                boxShadow: 'none !important',
                border: 'none !important',
                padding: '0 !important',
              },
            },
          },
          MuiChatScrollToBottomAffordance: {
            styleOverrides: {
              root: ({ theme }) => ({
                backgroundColor: `${(theme.vars || theme).palette.background.paper} !important`,
                color: `${(theme.vars || theme).palette.text.primary} !important`,
                borderRadius: '50% !important',
                border: '1px solid !important',
                borderColor: `${(theme.vars || theme).palette.divider} !important`,
                boxShadow: `${theme.shadows[3]} !important`,
                width: 40,
                height: 40,
                zIndex: 10,
                '&:hover': {
                  backgroundColor: `${(theme.vars || theme).palette.action.hover || (theme.vars || theme).palette.background.paper} !important`,
                  boxShadow: `${theme.shadows[6]} !important`,
                },
                ...theme.applyStyles('dark', {
                  backgroundColor: `${(theme.vars || theme).palette.background.paper} !important`,
                  borderColor: `${(theme.vars || theme).palette.divider} !important`,
                  boxShadow: `${theme.shadows[4]} !important`,
                }),
              }),
            },
          },
        },
      }),
    []
  );

  return (
    <ThemeProvider theme={theme} disableTransitionOnChange>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
};

AppTheme.propTypes = {
  children: PropTypes.node,
};

export default AppTheme;
