/**
 * @module App
 * @description Root application layout component mounting AppTheme and CssBaseline.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { AppTheme } from './theme/AppTheme.jsx';

export const App = () => {
  return (
    <AppTheme>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Typography variant="h4" component="h1" fontWeight={600}>
          Operon
        </Typography>
      </Box>
    </AppTheme>
  );
};

export default App;
