"use client";

import { useEffect } from "react";
import { holdAppDeployReload } from "@/lib/app-deploy-reload-hold";

/** active 为 true 时占住部署强制刷新，直到变 false / 卸载。 */
export function useHoldAppDeployReloadWhile(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return holdAppDeployReload();
  }, [active]);
}
