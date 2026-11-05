/**
 * @module theme/customizations/feedback
 * @description Material UI theme customizations for feedback components (Alert, Dialog, LinearProgress).
 */
import { alpha } from "@mui/material/styles";
import { gray, orange } from "../themePrimitives";

/**
 * Component-level overrides for feedback surfaces and indicators.
 * @type {import('@mui/material/styles').Components}
 */
const feedbackCustomizations = {
  MuiAlert: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: 10,
        backgroundColor: orange[100],
        color: (theme.vars || theme).palette.text.primary,
        border: `1px solid ${alpha(orange[300], 0.5)}`,
        "& .MuiAlert-icon": {
          color: orange[500],
        },
        ...theme.applyStyles("dark", {
          backgroundColor: `${alpha(orange[900], 0.5)}`,
          border: `1px solid ${alpha(orange[800], 0.5)}`,
        }),
      }),
    },
  },
  MuiDialog: {
    styleOverrides: {
      root: ({ theme }) => ({
        "& .MuiDialog-paper": {
          borderRadius: "10px",
          border: "1px solid",
          borderColor: (theme.vars || theme).palette.divider,
          backgroundImage: "none",
          backgroundColor: (theme.vars || theme).palette.background.paper,
          ...theme.applyStyles("dark", {
            backgroundColor: gray[900],
          }),
        },
      }),
    },
  },
  MuiLinearProgress: {
    styleOverrides: {
      root: ({ theme }) => ({
        height: 8,
        borderRadius: 8,
        backgroundColor: gray[200],
        ...theme.applyStyles("dark", {
          backgroundColor: gray[800],
        }),
      }),
    },
  },
};

export default feedbackCustomizations;
