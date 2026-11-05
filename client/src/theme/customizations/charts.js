/**
 * @module theme/customizations/charts
 * @description Material UI theme customizations for MUI X Charts components.
 */
import { axisClasses } from "@mui/x-charts/ChartsAxis";
import { legendClasses } from "@mui/x-charts/ChartsLegend";
import { chartsGridClasses } from "@mui/x-charts/ChartsGrid";
import { gray } from "../themePrimitives";

/**
 * Component-level overrides for MUI X Charts.
 * @type {import('@mui/material/styles').Components}
 */
const chartsCustomizations = {
  MuiChartsAxis: {
    styleOverrides: {
      root: ({ theme }) => ({
        [`& .${axisClasses.line}`]: {
          stroke: gray[300],
        },
        [`& .${axisClasses.tick}`]: { stroke: gray[300] },
        [`& .${axisClasses.tickLabel}`]: {
          fill: gray[500],
          fontWeight: 500,
        },
        ...theme.applyStyles("dark", {
          [`& .${axisClasses.line}`]: {
            stroke: gray[700],
          },
          [`& .${axisClasses.tick}`]: { stroke: gray[700] },
          [`& .${axisClasses.tickLabel}`]: {
            fill: gray[300],
            fontWeight: 500,
          },
        }),
      }),
    },
  },
  MuiChartsTooltip: {
    styleOverrides: {
      mark: ({ theme }) => ({
        ry: 6,
        boxShadow: "none",
        border: `1px solid ${(theme.vars || theme).palette.divider}`,
      }),
      table: ({ theme }) => ({
        border: `1px solid ${(theme.vars || theme).palette.divider}`,
        borderRadius: theme.shape.borderRadius,
        background: "hsl(0, 0%, 100%)",
        ...theme.applyStyles("dark", {
          background: gray[900],
        }),
      }),
    },
  },
  MuiChartsLegend: {
    styleOverrides: {
      root: {
        [`& .${legendClasses.mark}`]: {
          ry: 6,
        },
      },
    },
  },
  MuiChartsGrid: {
    styleOverrides: {
      root: ({ theme }) => ({
        [`& .${chartsGridClasses.line}`]: {
          stroke: gray[200],
          strokeDasharray: "4 2",
          strokeWidth: 0.8,
        },
        ...theme.applyStyles("dark", {
          [`& .${chartsGridClasses.line}`]: {
            stroke: gray[700],
            strokeDasharray: "4 2",
            strokeWidth: 0.8,
          },
        }),
      }),
    },
  },
};

export default chartsCustomizations;
