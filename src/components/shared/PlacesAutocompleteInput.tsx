import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

export interface PlaceAutocompleteResult {
  address: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string | null;
  components: {
    street: string | null;
    streetNumber: string | null;
    postalCode: string | null;
    locality: string | null;
    province: string | null;
    country: string | null;
  };
}

interface PlacesAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected: (place: PlaceAutocompleteResult) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  name?: string;
  onBlur?: () => void;
}

/**
 * Input de dirección con autocompletado de Google Places.
 *
 * Usa la API clásica `google.maps.places.Autocomplete` (no la nueva
 * `PlaceAutocompleteElement` porque aún no está 100% soportada en React 19
 * con @vis.gl/react-google-maps, y porque la clásica sigue siendo compatible
 * y más flexible para integrarse en un componente controlado).
 *
 * El componente:
 *  - Restringe resultados a España (`componentRestrictions: { country: 'es' }`)
 *  - Pide solo los campos necesarios (`fields`) para minimizar el coste de
 *    cada selección (Google cobra por tipo de dato devuelto).
 *  - Es totalmente controlado: el padre mantiene `value` y recibe `onChange`.
 *  - Dispara `onPlaceSelected` con los datos ya parseados al elegir una
 *    sugerencia. Así el padre puede rellenar lat/lng, código postal, etc.
 *    sin llamar a /api/geocode-address.
 */
export function PlacesAutocompleteInput({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  disabled,
  className,
  inputClassName,
  id,
  name,
  onBlur,
}: PlacesAutocompleteInputProps) {
  const placesLib = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "es" },
      fields: [
        "formatted_address",
        "geometry.location",
        "place_id",
        "address_components",
      ],
      types: ["address"],
    });

    autocompleteRef.current = autocomplete;
    setIsReady(true);

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place?.geometry?.location) return;

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const formattedAddress = place.formatted_address ?? "";

      // Parseamos address_components para obtener calle, CP, ciudad, etc.
      const comps = place.address_components ?? [];
      const byType = (type: string): string | null => {
        const hit = comps.find((c) => c.types.includes(type));
        return hit?.long_name ?? null;
      };

      const result: PlaceAutocompleteResult = {
        address: formattedAddress,
        formattedAddress,
        lat,
        lng,
        placeId: place.place_id ?? null,
        components: {
          street: byType("route"),
          streetNumber: byType("street_number"),
          postalCode: byType("postal_code"),
          locality:
            byType("locality") ??
            byType("postal_town") ??
            byType("administrative_area_level_3"),
          province:
            byType("administrative_area_level_2") ??
            byType("administrative_area_level_1"),
          country: byType("country"),
        },
      };

      onChange(formattedAddress);
      onPlaceSelected(result);
    });

    return () => {
      listener.remove();
      autocompleteRef.current = null;
      setIsReady(false);
    };
  }, [placesLib, onChange, onPlaceSelected]);

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={
          placeholder ??
          (isReady ? "Empieza a escribir tu dirección..." : "Cargando...")
        }
        disabled={disabled || !placesLib}
        autoComplete="off"
        className={inputClassName}
      />
    </div>
  );
}
