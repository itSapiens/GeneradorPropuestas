import type { PropsWithChildren } from "react";

import GoogleMapsProvider from "./GoogleMapsProvider";
import I18nProvider from "./I18nProvider";
import QueryProvider from "./QueryProvider";

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <QueryProvider>
        <GoogleMapsProvider>{children}</GoogleMapsProvider>
      </QueryProvider>
    </I18nProvider>
  );
}
