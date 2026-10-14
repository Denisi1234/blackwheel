import React from "react";
import { Box, Typography, Button, Paper } from "@mui/material";

// Production safety net: chunk-load failures and render crashes show a
// recoverable panel instead of a white screen. Logs to console for
// Sentry/log-shipper pickup (no new dependency).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Something went wrong." };
  }

  componentDidCatch(error, info) {
    try {
      // eslint-disable-next-line no-console
      console.error("[blackwheel] UI crash:", error, info);
    } catch (e) {
      // ignore logging failure
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Paper elevation={0} sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>
            This section failed to load
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {this.state.message} Try reloading the section. Your saved data is preserved.
          </Typography>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
            <Button
              variant="contained"
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              Retry
            </Button>
            <Button variant="outlined" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </Box>
        </Paper>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
