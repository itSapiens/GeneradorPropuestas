import type { PropsWithChildren } from "react";
import { Toaster } from "sonner";

import GoogleMapsProvider from "./GoogleMapsProvider";
import I18nProvider from "./I18nProvider";
import QueryProvider from "./QueryProvider";

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <QueryProvider>
        <GoogleMapsProvider>{children}</GoogleMapsProvider>
        <Toaster
          closeButton
          richColors
          position="top-right"
          offset={{ top: 24, right: 24 }}
          toastOptions={{
            classNames: {
              toast: "sapiens-toast",
              title: "sapiens-toast-title",
              description: "sapiens-toast-description",
            },
          }}
        />
      </QueryProvider>
    </I18nProvider>
  );
}
