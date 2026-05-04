import { Route, Routes } from "react-router-dom";

import ContinueContractPage from "@/src/pages/continue-contract/ContinueContractPage";
import ProposalPage from "@/src/pages/proposal/ProposalPage";
import ReservationCancelledPage from "@/src/pages/reservation-cancelled/ReservationCancelledPage";
import ReservationConfirmedPage from "@/src/pages/reservation-confirmed/ReservationConfirmedPage";
import MainAppContent from "@/src/features/proposal-flow/ui/MainAppContent";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/contratacion" element={<ContinueContractPage />} />
      <Route path="/continue-contract" element={<ContinueContractPage />} />
      <Route
        path="/continuar-contratacion"
        element={<ContinueContractPage />}
      />
      <Route
        path="/contratacion-desde-propuesta"
        element={<ProposalPage />}
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
