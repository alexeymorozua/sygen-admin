"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";

export default function ServiceWorkerRegister() {
  const { toast } = useToast();
  const reloadingRef = useRef(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") return;
    if (!("serviceWorker" in navigator)) return;

    const promptUpdate = (waiting: ServiceWorker) => {
      if (promptedRef.current) return;
      promptedRef.current = true;
      toast("Доступно обновление", "info", {
        duration: 20000,
        action: {
          label: "Обновить",
          onClick: () => waiting.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    };

    const watchInstalling = (reg: ServiceWorkerRegistration) => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (
          installing.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          promptUpdate(installing);
        }
      });
    };

    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          promptUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          watchInstalling(registration);
        });

        if (registration.installing) watchInstalling(registration);
      } catch {
        // ignore registration errors
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, [toast]);

  return null;
}
