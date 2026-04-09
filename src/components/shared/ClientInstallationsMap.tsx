import { useEffect, useMemo } from "react";
import {
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  Pin,
} from "@vis.gl/react-google-maps";
import { useState } from "react";

interface InstallationMarkerData {
  id: string | number;
  lat: number;
  lng: number;
  name: string;
  address?: string | null;
  distanceMeters?: number | null;
  isAvailable?: boolean;
}

interface ClientInstallationsMapProps {
  clientLat: number;
  clientLng: number;
  clientLabel?: string;
  radiusMeters: number;
  installations: InstallationMarkerData[];
  selectedInstallationId?: string | number | null;
  onSelectInstallation?: (id: string | number) => void;
  mapId?: string;
}

/**
 * Dibuja un círculo alrededor del cliente con el radio de búsqueda legal.
 * google.maps.Circle no existe como componente en @vis.gl/react-google-maps,
 * así que lo instanciamos imperativamente sobre la instancia del mapa.
 */
function SearchRadiusCircle({
  center,
  radius,
}: {
  center: { lat: number; lng: number };
  radius: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const circle = new google.maps.Circle({
      map,
      center,
      radius,
      strokeColor: "#0D1B4C",
      strokeOpacity: 0.35,
      strokeWeight: 2,
      fillColor: "#57D9D3",
      fillOpacity: 0.12,
      clickable: false,
    });

    return () => {
      circle.setMap(null);
    };
  }, [map, center.lat, center.lng, radius]);

  return null;
}

/**
 * Ajusta el viewport del mapa para que entren el cliente y todas las
 * instalaciones mostradas. Se ejecuta cuando cambian cliente o instalaciones.
 */
function FitBoundsToInstallations({
  clientLat,
  clientLng,
  installations,
  radiusMeters,
}: {
  clientLat: number;
  clientLng: number;
  installations: InstallationMarkerData[];
  radiusMeters: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: clientLat, lng: clientLng });

    for (const inst of installations) {
      if (Number.isFinite(inst.lat) && Number.isFinite(inst.lng)) {
        bounds.extend({ lat: inst.lat, lng: inst.lng });
      }
    }

    // Si solo está el cliente, encaja el círculo entero en la vista.
    if (installations.length === 0) {
      // Aproximación: 1 grado ≈ 111 km. Para 5 km de radio, 0.045 grados.
      const delta = radiusMeters / 111_000;
      bounds.extend({ lat: clientLat + delta, lng: clientLng + delta });
      bounds.extend({ lat: clientLat - delta, lng: clientLng - delta });
    }

    map.fitBounds(bounds, { top: 80, right: 80, bottom: 120, left: 80 });
  }, [map, clientLat, clientLng, installations, radiusMeters]);

  return null;
}

export function ClientInstallationsMap({
  clientLat,
  clientLng,
  clientLabel,
  radiusMeters,
  installations,
  selectedInstallationId,
  onSelectInstallation,
  mapId,
}: ClientInstallationsMapProps) {
  const [openInfoWindowId, setOpenInfoWindowId] = useState<
    string | number | null
  >(null);

  const center = useMemo(
    () => ({ lat: clientLat, lng: clientLng }),
    [clientLat, clientLng],
  );

  return (
    <GoogleMap
      mapId={mapId ?? "SAPIENS_MAIN_MAP"}
      defaultCenter={center}
      defaultZoom={13}
      gestureHandling="greedy"
      disableDefaultUI={false}
      clickableIcons={false}
      className="h-full w-full"
    >
      <SearchRadiusCircle center={center} radius={radiusMeters} />
      <FitBoundsToInstallations
        clientLat={clientLat}
        clientLng={clientLng}
        installations={installations}
        radiusMeters={radiusMeters}
      />

      {/* Marker del cliente */}
      <AdvancedMarker position={center} title={clientLabel ?? "Tu ubicación"}>
        <Pin
          background="#0D1B4C"
          borderColor="#0D1B4C"
          glyphColor="#57D9D3"
          scale={1.2}
        />
      </AdvancedMarker>

      {/* Markers de instalaciones */}
      {installations.map((inst) => {
        if (!Number.isFinite(inst.lat) || !Number.isFinite(inst.lng))
          return null;

        const isSelected = selectedInstallationId === inst.id;
        const isOpen = openInfoWindowId === inst.id;

        return (
          <AdvancedMarker
            key={inst.id}
            position={{ lat: inst.lat, lng: inst.lng }}
            title={inst.name}
            onClick={() => {
              setOpenInfoWindowId(inst.id);
              onSelectInstallation?.(inst.id);
            }}
          >
            <Pin
              background={isSelected ? "#57D9D3" : "#FFFFFF"}
              borderColor="#0D1B4C"
              glyphColor="#0D1B4C"
              scale={isSelected ? 1.4 : 1}
            />
            {isOpen && (
              <InfoWindow
                position={{ lat: inst.lat, lng: inst.lng }}
                onCloseClick={() => setOpenInfoWindowId(null)}
              >
                <div className="text-sm text-[#0D1B4C] max-w-[220px]">
                  <p className="font-bold">{inst.name}</p>
                  {inst.address ? (
                    <p className="text-xs mt-1 opacity-70">{inst.address}</p>
                  ) : null}
                  {typeof inst.distanceMeters === "number" ? (
                    <p className="text-xs mt-1">
                      Distancia:{" "}
                      {inst.distanceMeters >= 1000
                        ? `${(inst.distanceMeters / 1000).toFixed(1)} km`
                        : `${Math.round(inst.distanceMeters)} m`}
                    </p>
                  ) : null}
                </div>
              </InfoWindow>
            )}
          </AdvancedMarker>
        );
      })}
    </GoogleMap>
  );
}
