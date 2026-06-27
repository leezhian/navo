import { useEffect, useState } from "react";

export function useWindowFullScreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const windowApi = window.vibeReviewer?.window;

    if (!windowApi) {
      return;
    }

    let isMounted = true;

    windowApi.getIsFullScreen().then((nextIsFullScreen) => {
      if (isMounted) {
        setIsFullScreen(nextIsFullScreen);
      }
    });

    const dispose = windowApi.onFullScreenChange(setIsFullScreen);

    return () => {
      isMounted = false;
      dispose();
    };
  }, []);

  return isFullScreen;
}
