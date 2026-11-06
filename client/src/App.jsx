import AppTheme from './theme/AppTheme.jsx';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Root Application component.
 * Integrates AppTheme and base viewport structure.
 */
const App = () => {
  return (
    <AppTheme>
      <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Personal AI Agent V1
        </Typography>
      </Box>
    </AppTheme>
  );
};

export default App;
