import AppRoutes from "./AppRoutes";
import GoogleMapsProvider from "./providers/GoogleMapsProvider";

export default function App() {
  return (
    <GoogleMapsProvider>
      <AppRoutes />
    </GoogleMapsProvider>
  );
}
