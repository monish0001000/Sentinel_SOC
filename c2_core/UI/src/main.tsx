import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { WebSocketProvider } from "./hooks/useWebSocket";

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <WebSocketProvider>
      <App />
    </WebSocketProvider>
  </AuthProvider>
);
