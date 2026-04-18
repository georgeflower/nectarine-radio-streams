import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startVersionCheck } from "./lib/versionCheck";

createRoot(document.getElementById("root")!).render(<App />);

startVersionCheck();
