import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

const SuccessModal = ({
  open,
  onClose,
  title = "Saved successfully",
  message = "Your changes have been saved.",
  details = [],
  actionLabel = "Done",
  onAction,
}) => {
  const handleAction = () => {
    if (onAction) {
      onAction();
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ textAlign: "center", pb: 0 }}>
        <CheckCircleIcon
          sx={{ fontSize: 56, color: "success.main", mb: 1 }}
        />
        <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: details.length ? 2 : 0 }}>
          {message}
        </Typography>
        {details.length > 0 && (
          <Box sx={{ textAlign: "left", mt: 1 }}>
            <Divider sx={{ mb: 1 }} />
            <List dense disablePadding>
              {details.map((d, i) => (
                <ListItem key={i} disableGutters sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          {d.label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {d.value}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "center", pb: 3 }}>
        <Button variant="contained" color="success" onClick={handleAction} autoFocus>
          {actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SuccessModal;
