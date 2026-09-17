"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isMetaApiLive,
  isMetaApiManuallyPaused,
  isMetaApiPageActive,
  isMetaApiWatchForced,
  setMetaApiManuallyPaused,
  setMetaApiWatchForced,
  subscribeMetaApiLive,
} from "@/lib/metaapi-live";

export function useMetaApiLive() {
  const [live, setLive] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [pageActive, setPageActive] = useState(true);
  const [watchForced, setWatchForced] = useState(false);

  useEffect(() => {
    function sync() {
      setLive(isMetaApiLive());
      setManualPaused(isMetaApiManuallyPaused());
      setPageActive(isMetaApiPageActive());
      setWatchForced(isMetaApiWatchForced());
    }
    sync();
    return subscribeMetaApiLive(sync);
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    setMetaApiManuallyPaused(paused);
  }, []);

  const seeLiveData = useCallback(() => {
    setMetaApiManuallyPaused(false);
    setMetaApiWatchForced(true);
  }, []);

  return {
    live,
    manualPaused,
    pageActive,
    watchForced,
    setPaused,
    seeLiveData,
  };
}
