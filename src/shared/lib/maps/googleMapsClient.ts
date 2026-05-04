export async function fetchGoogleMapsApiKey() {
  const response = await fetch("/api/config");
  const data = await response.json();
  return String(data.googleMapsApiKey || "").trim();
}
