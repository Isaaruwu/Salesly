import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import Clients from "./pages/clients";
import PreMeetingWindow from "./pages/pre-meeting";
import RecordingWindow from "./pages/recording";
import PostMeetingSummaryWindow from "./pages/post-meeting-summary";
import { BrowserRouter } from "react-router-dom";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else if (windowLabel === "clients") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <BrowserRouter>
          <Clients />
        </BrowserRouter>
      </ThemeProvider>
    </React.StrictMode>
  );
} else if (windowLabel === "pre_meeting") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <PreMeetingWindow />
      </ThemeProvider>
    </React.StrictMode>
  );
} else if (windowLabel === "recording") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <RecordingWindow />
      </ThemeProvider>
    </React.StrictMode>
  );
} else if (windowLabel === "post_meeting_summary") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <PostMeetingSummaryWindow />
      </ThemeProvider>
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
