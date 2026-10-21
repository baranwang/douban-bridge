declare global {
  interface Window {
    umami?: {
      track: (event: string) => void;
    };
  }
}

export function track(event: string) {
  window.umami?.track(event);
}
