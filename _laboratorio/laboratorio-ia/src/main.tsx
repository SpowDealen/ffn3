import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  createNotification,
  getNotifications,
  retryNotificationDelivery,
} from "./notifications/store";

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.LAB_NOTIFICATIONS = {
    createNotification,
    getNotifications,
    retryNotificationDelivery,
  };
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("No se encontró el elemento #root para montar el laboratorio IA.");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
