"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoPosition = {
  lon: number;
  lat: number;
  accuracy: number;
};

export type GeoState =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "unavailable"; message: string }
  | { status: "ready"; position: GeoPosition };

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "pending" });
  const attemptRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startWatch = useCallback(() => {
    cleanupRef.current?.();
    attemptRef.current += 1;
    const attempt = attemptRef.current;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable", message: "Geolocatie niet ondersteund" });
      return;
    }

    setState({ status: "pending" });

    const onSuccess = (pos: GeolocationPosition) => {
      if (attempt !== attemptRef.current) return;
      setState({
        status: "ready",
        position: {
          lon: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
        },
      });
    };

    const onError = (err: GeolocationPositionError) => {
      if (attempt !== attemptRef.current) return;
      if (err.code === err.PERMISSION_DENIED) {
        setState({ status: "denied" });
        return;
      }
      setState({
        status: "unavailable",
        message: "Locatie tijdelijk niet beschikbaar",
      });
    };

    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    });

    cleanupRef.current = () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => startWatch(), 0);
    return () => {
      window.clearTimeout(t);
      cleanupRef.current?.();
    };
  }, [startWatch]);

  const retry = useCallback(() => {
    startWatch();
  }, [startWatch]);

  return { state, retry };
};
