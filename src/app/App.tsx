import React, { useEffect, useRef, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";




export default function App() {
 const [mapsKey, setMapsKey] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setMapsKey((data.googleMapsApiKey || "").trim());
      })
      .catch((error) => {
        console.error("Error cargando config del mapa:", error);
      });
  }, []);

  if (!mapsKey) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Cargando configuración del mapa...</p>
    </div>
  );  }
  return (
    <APIProvider
      apiKey={mapsKey}
      libraries={["places", "marker"]}
      language="es"
      region="ES"
    >
    </APIProvider>
  );
}
