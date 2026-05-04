import AppProviders from "./providers/AppProviders";
import AppRoutes from "./router/AppRoutes";

export default function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
