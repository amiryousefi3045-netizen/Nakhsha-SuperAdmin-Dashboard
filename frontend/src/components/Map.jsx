import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import CITY_POLYGONS from "../data/cityPolygons";
import { simplifyDouglasPeucker, chaikinSmooth } from "../utils/geometry";

// Fix Leaflet default icon paths for Vite (dev and build)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

function pointInPolygon(point, polygon) {
  // Ray casting algorithm for point in polygon
  const [x, y] = [point.lng, point.lat];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1];
    const yi = polygon[i][0];
    const xj = polygon[j][1];
    const yj = polygon[j][0];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const Map = forwardRef(
  (
    {
      className = "",
      onMoveEnd,
      center,
      items = [],
      showMyLocationButton = false,
      onLocate,
      onMapClick,
      selectingLocation = false,
      selectedPos = null,
    },
    ref
  ) => {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const handlerRef = useRef(onMoveEnd);
    const onMapClickRef = useRef(onMapClick);
    const selectingLocationRef = useRef(selectingLocation);
    const timeoutsRef = useRef([]);
    const boundaryLayerRef = useRef(null);
    const outsideMaskRef = useRef(null);
    const markersLayerRef = useRef(null);
    const currentCityRef = useRef(null);

    // Keep latest callbacks without re-initializing the map
    useEffect(() => {
      handlerRef.current = onMoveEnd;
    }, [onMoveEnd]);

    useEffect(() => {
      onMapClickRef.current = onMapClick;
    }, [onMapClick]);

    useEffect(() => {
      selectingLocationRef.current = selectingLocation;
    }, [selectingLocation]);

    const userMarkerRef = useRef(null);
    const selectedMarkerRef = useRef(null);
    const lastCenterRef = useRef(null);
    const initialCenterRef = useRef(center);

    useImperativeHandle(ref, () => ({
      flyTo(lat, lng, opts = {}) {
        if (!mapRef.current) return;
        const zoom = opts.zoom || mapRef.current.getZoom() || 13;
        try {
          mapRef.current.flyTo([lat, lng], zoom, {
            duration: opts.duration || 1.1,
            easeLinearity: 0.25,
          });
        } catch {
          mapRef.current.setView([lat, lng], zoom, { animate: true });
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;
      // Inject pulsing marker CSS once
      if (!document.getElementById("pulse-marker-style")) {
        const style = document.createElement("style");
        style.id = "pulse-marker-style";
        style.textContent = `@keyframes pulseMapMarker{0%{transform:scale(.6);opacity:.9}70%{transform:scale(1);opacity:.15}100%{transform:scale(.6);opacity:0}}.pulse-pin{position:relative;width:16px;height:16px}.pulse-pin span{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;background:#2563eb;border:2px solid #fff;border-radius:9999px;box-shadow:0 0 0 1px rgba(0,0,0,.15)}.pulse-pin:after{content:"";position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;background:rgba(37,99,235,.35);border-radius:9999px;animation:pulseMapMarker 1.6s ease-out infinite}.leaflet-control-zoom{position:absolute !important;bottom:16px;right:16px;background:transparent !important;border:none !important;box-shadow:none !important}.leaflet-control-zoom-in,.leaflet-control-zoom-out{width:36px;height:36px;background:white !important;border:none !important;border-radius:9999px !important;font-size:16px;font-weight:bold;color:#1f2937 !important;box-shadow:0 2px 8px rgba(0,0,0,0.1) !important;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s ease}.leaflet-control-zoom-in:hover,.leaflet-control-zoom-out:hover{background:white !important;box-shadow:0 4px 12px rgba(0,0,0,0.15) !important}.leaflet-control-zoom-in{margin-bottom:8px}`;
        document.head.appendChild(style);
      }
      const c = initialCenterRef.current;
      const startCenter =
        c && c.lat && c.lng ? [c.lat, c.lng] : [32.4279, 53.688];
      const map = L.map(containerRef.current, {
        zoomControl: true,
      }).setView(startCenter, c ? 13 : 6);
      mapRef.current = map;

      // Position zoom controls to bottom-right with styling
      map.zoomControl.setPosition("bottomright");

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Marker cluster layer for showing craft items (populated from props)
      markersLayerRef.current = L.markerClusterGroup({
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          return L.divIcon({
            html: `<div style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:9999px;font-weight:700;font-size:12px;">${count.toLocaleString(
              "fa-IR"
            )}</div>`,
            className: "",
            iconSize: [40, 24],
          });
        },
        maxClusterRadius: 45,
      });
      map.addLayer(markersLayerRef.current);

      const emit = () => {
        const m = mapRef.current;
        if (!m) return;
        const b = m.getBounds();
        handlerRef.current?.({
          bounds: {
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          },
        });
      };

      // Manual location selection: if selectingLocation is true, allow click to select coords
      const handleMapClick = (e) => {
        if (selectingLocationRef.current && onMapClickRef.current) {
          onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      };

      map.on("moveend", emit);
      map.on("click", handleMapClick);
      map.whenReady(() => {
        const t = setTimeout(emit, 0);
        timeoutsRef.current.push(t);
      });

      return () => {
        timeoutsRef.current.forEach(clearTimeout);
        timeoutsRef.current = [];
        map.off("moveend", emit);
        map.off("click", handleMapClick);
        map.remove();
        mapRef.current = null;
      };
    }, []);

    // Update markers when items change
    useEffect(() => {
      const map = mapRef.current;
      const layer = markersLayerRef.current;
      if (!map || !layer) return;
      // Clear existing markers
      layer.clearLayers();

      const defaultIcon = L.divIcon({
        html: '<span style="display:block;width:10px;height:10px;background:#dc2626;border:2px solid #fff;border-radius:9999px;box-shadow:0 0 0 1px rgba(0,0,0,0.1);"></span>',
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      (items || [])
        .filter((i) => i && i.lat && i.lng)
        .forEach((it) => {
          const marker = L.marker([it.lat, it.lng], {
            icon: defaultIcon,
          });

          // Build tooltip content with optional distance
          let popupContent = `<div style="min-width:160px"><strong>${String(
            it.title || it.name || ""
          ).replace(
            /</g,
            "&lt;"
          )}</strong><div style="font-size:12px;margin-top:6px;color:#444">${String(
            it.location || ""
          ).replace(/</g, "&lt;")}</div>`;

          // Add distance tooltip if available (convert meters to km with 1 decimal)
          if (it.distanceMeters && typeof it.distanceMeters === "number") {
            const distanceKm = (it.distanceMeters / 1000).toFixed(1);
            popupContent += `<div style="font-size:11px;margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;color:#666">📍 ${distanceKm} کیلومتر</div>`;
          }

          popupContent += "</div>";

          marker.bindPopup(popupContent);

          // Add tooltip (hover text) with distance
          let tooltipText = it.title || it.name || "";
          if (it.distanceMeters && typeof it.distanceMeters === "number") {
            const distanceKm = (it.distanceMeters / 1000).toFixed(1);
            tooltipText += ` (${distanceKm} km)`;
          }
          marker.bindTooltip(tooltipText, {
            permanent: false,
            direction: "top",
            offset: [0, -10],
          });

          layer.addLayer(marker);
        });
    }, [items]);

    // Recenter / animate if center prop changes after init + boundary highlight
    useEffect(() => {
      if (!center || !mapRef.current) return;
      const { lat, lng } = center;
      if (
        lastCenterRef.current &&
        Math.abs(lastCenterRef.current.lat - lat) < 0.0005 &&
        Math.abs(lastCenterRef.current.lng - lng) < 0.0005
      ) {
        return; // negligible movement
      }
      lastCenterRef.current = { lat, lng };
      const map = mapRef.current;
      const targetZoom = map.getZoom() < 11 ? 13 : map.getZoom();
      try {
        map.flyTo([lat, lng], targetZoom, {
          duration: 1.2,
          easeLinearity: 0.25,
          noMoveStart: false,
        });
      } catch {
        map.setView([lat, lng], targetZoom, { animate: true });
      }
      // Update / add pulsing user location marker
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      const userIcon = L.divIcon({
        html: '<div class="pulse-pin"><span></span></div>',
        className: "",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      userMarkerRef.current = L.marker([lat, lng], { icon: userIcon }).addTo(
        map
      );

      // City boundary detection & rendering
      const pt = { lat, lng };
      let matchedCity = null;
      for (const city of CITY_POLYGONS) {
        if (pointInPolygon(pt, city.coords)) {
          matchedCity = city;
          break;
        }
      }
      if (matchedCity?.name !== currentCityRef.current) {
        if (boundaryLayerRef.current) {
          map.removeLayer(boundaryLayerRef.current);
          boundaryLayerRef.current = null;
        }
        if (outsideMaskRef.current) {
          map.removeLayer(outsideMaskRef.current);
          outsideMaskRef.current = null;
        }
        currentCityRef.current = matchedCity ? matchedCity.name : null;
        if (matchedCity) {
          // Multi-resolution shape: choose simplified version based on zoom
          const z = map.getZoom();
          let shape = matchedCity.coords;
          if (z < 10) {
            shape = simplifyDouglasPeucker(shape, 0.01);
          } else if (z < 12) {
            shape = simplifyDouglasPeucker(shape, 0.005);
          } else if (z < 14) {
            shape = simplifyDouglasPeucker(shape, 0.0025);
          } else {
            // high zoom: slightly smooth to remove sharp artifacts
            shape = chaikinSmooth(simplifyDouglasPeucker(shape, 0.0015), 1);
          }

          // Determine theme (simple heuristic: body class dark or media query)
          const prefersDark =
            document.documentElement.classList.contains("dark") ||
            window.matchMedia("(prefers-color-scheme: dark)").matches;
          const strokeColor = prefersDark ? "#f1f5f9" : "#111";
          const outsideFill = prefersDark ? "#0f172a" : "#f8fafc";
          const outsideOpacity = prefersDark ? 0.65 : 0.85;

          boundaryLayerRef.current = L.polygon(shape, {
            color: strokeColor,
            weight: 2,
            dashArray: "6 4",
            dashOffset: "0",
            lineJoin: "round",
            lineCap: "round",
            fill: false,
            interactive: false,
            opacity: 0.95,
          }).addTo(map);
          const worldRing = [
            [90, -180],
            [90, 180],
            [-90, 180],
            [-90, -180],
          ];
          outsideMaskRef.current = L.polygon([worldRing, shape], {
            stroke: false,
            fillColor: outsideFill,
            fillOpacity: outsideOpacity,
            interactive: false,
            bubblingMouseEvents: false,
          }).addTo(map);
          outsideMaskRef.current.bringToBack();
          boundaryLayerRef.current.bringToFront();
        }
      } else if (matchedCity) {
        // Update styling / resolution dynamically on zoom change or recenter
        const z = map.getZoom();
        let shape = matchedCity.coords;
        if (z < 10) shape = simplifyDouglasPeucker(shape, 0.01);
        else if (z < 12) shape = simplifyDouglasPeucker(shape, 0.005);
        else if (z < 14) shape = simplifyDouglasPeucker(shape, 0.0025);
        else shape = chaikinSmooth(simplifyDouglasPeucker(shape, 0.0015), 1);
        if (boundaryLayerRef.current) {
          boundaryLayerRef.current.setLatLngs(shape);
        }
        if (outsideMaskRef.current) {
          const worldRing = [
            [90, -180],
            [90, 180],
            [-90, 180],
            [-90, -180],
          ];
          outsideMaskRef.current.setLatLngs([worldRing, shape]);
        }
      }
    }, [center]);

    // Show a temporary selected marker when user picks a location on the map
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      if (selectedMarkerRef.current) {
        try {
          map.removeLayer(selectedMarkerRef.current);
        } catch {
          // ignore remove errors
        }
        selectedMarkerRef.current = null;
      }
      if (selectedPos && selectedPos.lat && selectedPos.lng) {
        const selIcon = L.divIcon({
          html: '<div style="width:14px;height:14px;background:#f59e0b;border-radius:7px;border:2px solid #fff;"></div>',
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        selectedMarkerRef.current = L.marker(
          [selectedPos.lat, selectedPos.lng],
          { icon: selIcon }
        ).addTo(map);
      }
    }, [selectedPos]);

    return (
      <div className={`relative w-full h-full min-h-[240px] z-0 ${className}`}>
        {showMyLocationButton && (
          <button
            type="button"
            onClick={onLocate}
            className="absolute top-3 right-3 bg-white/90 backdrop-blur px-3 py-1.5 shadow rounded-full text-xs hover:bg-white transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 font-medium"
            aria-label="استفاده از موقعیت فعلی"
          >
            موقعیت من
          </button>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }
);

export default Map;
