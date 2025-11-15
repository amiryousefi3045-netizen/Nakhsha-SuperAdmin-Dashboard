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
        style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap');@keyframes pulseMapMarker{0%{transform:scale(.6);opacity:.9}70%{transform:scale(1);opacity:.15}100%{transform:scale(.6);opacity:0}}.pulse-pin{position:relative;width:16px;height:16px}.pulse-pin span{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;background:#2563eb;border:2px solid #fff;border-radius:9999px;box-shadow:0 0 0 1px rgba(0,0,0,.15)}.pulse-pin:after{content:"";position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;background:rgba(37,99,235,.35);border-radius:9999px;animation:pulseMapMarker 1.6s ease-out infinite}.leaflet-control-zoom{position:absolute !important;bottom:16px;right:16px;background:transparent !important;border:none !important;box-shadow:none !important}.leaflet-control-zoom-in,.leaflet-control-zoom-out{width:36px;height:36px;background:white !important;border:none !important;border-radius:9999px !important;font-size:16px;font-weight:bold;color:#1f2937 !important;box-shadow:0 2px 8px rgba(0,0,0,0.1) !important;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s ease}.leaflet-control-zoom-in:hover,.leaflet-control-zoom-out:hover{background:white !important;box-shadow:0 4px 12px rgba(0,0,0,0.15) !important}.leaflet-control-zoom-in{margin-bottom:8px}.custom-marker-pill{font-family:Vazirmatn, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;font-weight:600;letter-spacing:0.3px}.craft-popup .leaflet-popup-content-wrapper{background:transparent !important;box-shadow:none !important;border:none !important;border-radius:16px !important;padding:0 !important}.craft-popup .leaflet-popup-content{margin:0 !important;padding:0 !important;width:100%;max-width:240px;line-height:1.4;border-radius:16px;overflow:hidden;font-family:Vazirmatn, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif}.craft-popup .leaflet-popup-tip{background:white;box-shadow:0 2px 8px rgba(0,0,0,0.1)}`;
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
            html: `<div style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); color: white; padding: 6px 10px; border-radius: 9999px; font-weight: 700; font-size: 13px; font-family: Vazirmatn, system-ui, -apple-system, 'Segoe UI', sans-serif; box-shadow: 0 6px 16px rgba(0,0,0,0.25); border: 2px solid rgba(255,255,255,0.5);" title="کلیک کنید برای دیدن جزئیات">${count.toLocaleString(
              "fa-IR"
            )}</div>`,
            className: "",
            iconSize: [50, 32],
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

      (items || [])
        .filter((i) => i && i.lat && i.lng)
        .forEach((it) => {
          // Custom pill marker icon with brand color and premium styling - LARGER
          const customIcon = L.divIcon({
            html: `<div class="custom-marker-pill" style="background: linear-gradient(135deg, #111827 0%, #1f2937 100%); color: white; padding: 8px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; box-shadow: 0 6px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.6); white-space: nowrap; cursor: pointer; transition: all 0.2s ease; letter-spacing: 0.3px;" onmouseover="this.style.transform='scale(1.08)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)'">${String(
              it.title || it.name || "آثر"
            ).substring(0, 25)}</div>`,
            className: "custom-marker-wrapper",
            iconSize: [160, 40],
            iconAnchor: [80, 20],
            popupAnchor: [0, -20],
          });

          const marker = L.marker([it.lat, it.lng], {
            icon: customIcon,
          });

          // Create rich popup with image + title + description + button
          const popupHTML = `
            <div style="max-width: 260px; overflow: hidden; border-radius: 18px; background: white; box-shadow: 0 12px 32px rgba(0,0,0,0.15); font-family: Vazirmatn, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <!-- Image -->
              <div style="width: 100%; height: 150px; overflow: hidden; background: #f3f4f6; position: relative;">
                <img 
                  src="${String(
                    it.image || (Array.isArray(it.images) && it.images[0]) || ""
                  ).replace(/"/g, "&quot;")}" 
                  alt="${String(it.title || "").replace(/"/g, "&quot;")}"
                  style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;"
                  onmouseover="this.style.transform='scale(1.05)'"
                  onmouseout="this.style.transform='scale(1)'"
                  onerror="this.src='data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22260%22 height=%22150%22 viewBox=%220 0 260 150%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23e5e7eb%22/%3E%3Cg fill=%229ca3af%22 font-family=%22Vazirmatn, sans-serif%22 font-size=%2213%22 text-anchor=%22middle%22%3E%3Ctext x=%22130%22 y=%2280%22%3Eبدون تصویر%3C/text%3E%3C/g%3E%3C/svg%3E'"
                />
              </div>
              
              <!-- Content -->
              <div style="padding: 14px 14px 12px 14px; text-align: right;">
                <!-- Title -->
                <h3 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #111827; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-family: Vazirmatn;">
                  ${String(it.title || it.name || "بدون عنوان").replace(
                    /</g,
                    "&lt;"
                  )}
                </h3>
                
                <!-- Description -->
                <p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-family: Vazirmatn;">
                  ${String(it.description || it.type || "بدون توضیح").replace(
                    /</g,
                    "&lt;"
                  )}
                </p>
                
                <!-- Location -->
                <div style="margin-bottom: 10px; font-size: 13px; color: #666; font-family: Vazirmatn; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                  <span>${String(
                    typeof it.location === "string"
                      ? it.location
                      : it.location?.city || "موقعیت نامشخص"
                  ).replace(/</g, "&lt;")}</span>
                  <span style="font-size: 14px;">📍</span>
                </div>
                
                <!-- Details Button -->
                <a href="/craft/${
                  it.id
                }" style="display: inline-block; margin-top: 8px; padding: 8px 14px; background: linear-gradient(135deg, #111827 0%, #1f2937 100%); color: white; text-decoration: none; border-radius: 9999px; font-size: 13px; font-weight: 700; transition: all 0.2s; text-align: center; border: none; cursor: pointer; font-family: Vazirmatn; box-shadow: 0 4px 12px rgba(17, 24, 39, 0.2);" onmouseover="this.style.boxShadow='0 6px 16px rgba(17, 24, 39, 0.3)'; this.style.transform='scale(1.02)'" onmouseout="this.style.boxShadow='0 4px 12px rgba(17, 24, 39, 0.2)'; this.style.transform='scale(1)'">
                  جزئیات بیشتر
                </a>
              </div>
            </div>
          `;

          marker.bindPopup(popupHTML, {
            maxWidth: 260,
            className: "craft-popup",
          });

          // Add tooltip (hover text) with distance
          let tooltipText = it.title || it.name || "";
          if (it.distanceMeters && typeof it.distanceMeters === "number") {
            const distanceKm = (it.distanceMeters / 1000).toFixed(1);
            tooltipText += ` (${distanceKm} کم)`;
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
          html: '<div style="width:18px;height:18px;background: linear-gradient(135deg, #111827 0%, #1f2937 100%);border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);"></div>',
          className: "",
          iconSize: [18, 18],
          iconAnchor: [9, 9],
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
