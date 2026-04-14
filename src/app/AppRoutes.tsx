import { Routes, Route } from "react-router-dom";
import ContinuarContratacionPage from "../pages/ContinueContraction";
import ContratacionDesdePropuestaPage from "../pages/ContratacionDesdePropuestaPage";
import ReservationConfirmedPage from "../pages/ReservationConfirmedPage";
import ReservationCancelledPage from "../pages/ReservationCancelledPage";
import MainAppContent from "../modules/proposal/components/MainAppContent";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/contratacion" element={<ContinuarContratacionPage />} />

      <Route
        path="/continue-contract"
        element={<ContinuarContratacionPage />}
      />

      <Route
        path="/continuar-contratacion"
        element={<ContinuarContratacionPage />}
      />

      <Route
        path="/contratacion-desde-propuesta"
        element={<ContratacionDesdePropuestaPage />}
      />

      <Route
        path="/reserva-confirmada"
        element={<ReservationConfirmedPage />}
      />

      <Route
        path="/continuar-contratacion/exito"
        element={<ReservationConfirmedPage />}
      />

      <Route
        path="/reserva-cancelada"
        element={<ReservationCancelledPage />}
      />

      <Route
        path="/continuar-contratacion/cancelado"
        element={<ReservationCancelledPage />}
      />

      <Route path="*" element={<MainAppContent />} />
    </Routes>
  );
}